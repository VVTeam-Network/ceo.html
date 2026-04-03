// ================= FIREBASE CONFIG =================
const firebaseConfig = {
    apiKey: "AIzaSyDGv4kEClO0RHCLvXVLOT-vyPHw6bsxYVc",
    authDomain: "vv-ep-beta.firebaseapp.com",
    projectId: "vv-ep-beta",
    storageBucket: "vv-ep-beta.firebasestorage.app"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const db = firebase.firestore();
const auth = firebase.auth();
const storage = firebase.storage();

// ================= VARIABILE GLOBALE =================
let map = null;
let currentStream = null;
let targetMarker = null;
let currentUser = null;
let currentMissionId = null;
let selectedReward = 15;
let selectedTip = 0;
let capturedImageBlob = null;

// PILON 2: GPS curent stocat global
let userCurrentLat = null;
let userCurrentLng = null;

// ================= PILON 2: HAVERSINE — calcul distanță în metri =================
function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // raza Pământului în metri
    const toRad = (deg) => deg * (Math.PI / 180);
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // distanta in metri
}

// ================= BOOT =================
window.onload = function() {
    // FIX iOS swipe back
    document.addEventListener('touchstart', function(e) {
        if (e.touches[0].clientX < 20 || e.touches[0].clientX > window.innerWidth - 20) {
            e.preventDefault();
        }
    }, { passive: false });

    document.body.addEventListener('touchmove', function(e) {
        if (e.target === document.body || e.target === document.documentElement) {
            e.preventDefault();
        }
    }, { passive: false });

    // PRIMUL PAS: logam anonim imediat
    try {
        auth.signInAnonymously().catch(function(err) {
            console.log('[VV] signInAnonymously err:', err.code);
        });
    } catch(e) { console.log('[VV] auth err:', e); }

    // AUTH STATE LISTENER
    try {
        auth.onAuthStateChanged(function(user) {
            if (user) {
                currentUser = user;
                var tutorialDone = localStorage.getItem('vv_premium_tutorial_done');
                var accessKey = localStorage.getItem('vv_access_key');
                if (tutorialDone === 'DA' && accessKey) {
                    document.getElementById('splash-screen').style.display = 'none';
                    document.getElementById('tutorial-screen').style.display = 'none';
                    showApp();
                    loadUserData();
                } else {
                    document.getElementById('splash-screen').style.display = 'flex';
                }
            }
        });
    } catch(e) { console.log('[VV] auth listener err:', e); }
};

// ================= TOGGLE ACCEPT BUTTON =================
function toggleAcceptButton() {
    // Butonul e mereu activ — validarea se face la click
}

// ================= BOOT SEQUENCE (după Accept) =================
async function startBootSequence() {
    const key = document.getElementById('access-key').value.trim().toUpperCase();
    const btn = document.getElementById('btn-accept');
    const cb = document.getElementById('tc-checkbox');

    const existingError = document.getElementById('key-error-msg');
    if (existingError) existingError.remove();

    if (!cb || !cb.checked) {
        showKeyError('Trebuie să accepți regulamentul mai întâi.');
        return;
    }

    if (!key) {
        showKeyError('Introdu cheia de acces.');
        return;
    }

    btn.textContent = 'SE VERIFICĂ...';
    btn.style.opacity = '0.7';
    btn.style.pointerEvents = 'none';

    try {
        const snap = await db.collection('access_keys')
            .where('key', '==', key)
            .where('active', '==', true)
            .get();

        if (snap.empty) {
            const snap2 = await db.collection('access_keys')
                .where('key', '==', key).get();
            throw new Error(snap2.empty
                ? 'Cheie invalidă: ' + key
                : 'Cheie dezactivată. Cere una nouă.');
        }

        localStorage.setItem('vv_access_key', key);

        if (!currentUser) {
            btn.textContent = 'SE CONECTEAZĂ...';
            const cred = await auth.signInAnonymously();
            currentUser = cred.user;
        }

        btn.textContent = 'ACCES ACORDAT ✓';
        btn.style.background = 'rgba(52,199,89,0.9)';
        btn.style.color = '#000';
        btn.style.opacity = '1';

        setTimeout(() => {
            document.getElementById('splash-screen').style.display = 'none';
            document.getElementById('alias-screen').style.display = 'flex';
        }, 500);

    } catch(err) {
        console.error('[VV Boot]', err.code, err.message);
        btn.textContent = 'DECRIPTEZ & INTRU';
        btn.style.opacity = '1';
        btn.style.pointerEvents = 'auto';
        btn.style.background = '';
        btn.style.color = '';
        showKeyError('❌ ' + (err.message || JSON.stringify(err)));
    }
}

function showKeyError(msg) {
    const existing = document.getElementById('key-error-msg');
    if (existing) existing.remove();

    const err = document.createElement('div');
    err.id = 'key-error-msg';
    err.style.cssText = `
        color: #ff3b30;
        font-size: 14px;
        text-align: center;
        margin-top: 10px;
        margin-bottom: 10px;
        font-weight: 700;
        width: 100%;
        max-width: 390px;
        padding: 10px 14px;
        background: rgba(255,59,48,0.1);
        border: 1px solid rgba(255,59,48,0.3);
        border-radius: 10px;
        line-height: 1.4;
        word-break: break-all;
    `;
    err.textContent = '⚠️ ' + msg;

    const keyInput = document.getElementById('access-key');
    if (keyInput && keyInput.parentNode) {
        keyInput.parentNode.insertBefore(err, keyInput.nextSibling);
    }
}

// ================= CONFIRMARE ALIAS =================
function confirmAlias() {
    const alias = document.getElementById('user-alias-input').value.trim();
    if (!alias || alias.length < 2) {
        showToast('Introdu un nume de cod valid!');
        return;
    }

    localStorage.setItem('vv_alias', alias);

    auth.signInAnonymously().then(async cred => {
        currentUser = cred.user;

        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        const generateKey = () => Array.from({length: 6}, () => 
            chars[Math.floor(Math.random() * chars.length)]).join('');
        
        const userKeys = [generateKey(), generateKey(), generateKey()];
        
        await db.collection('users').doc(cred.user.uid).set({
            alias: alias,
            balance: 100,
            rating: 5,
            joinedAt: firebase.firestore.FieldValue.serverTimestamp(),
            accessKey: localStorage.getItem('vv_access_key'),
            inviteKeys: userKeys,
            keysBalance: 3
        });

        const batch = db.batch();
        userKeys.forEach(key => {
            const ref = db.collection('access_keys').doc();
            batch.set(ref, {
                key: key,
                active: true,
                generatedBy: cred.user.uid,
                generatedByAlias: alias,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                used: false
            });
        });
        await batch.commit();

        return Promise.resolve();
    }).then(() => {
        document.getElementById('alias-screen').style.display = 'none';
        document.getElementById('tutorial-screen').style.display = 'flex';
    }).catch(err => {
        console.log('Eroare creare cont:', err);
        document.getElementById('alias-screen').style.display = 'none';
        document.getElementById('tutorial-screen').style.display = 'flex';
    });
}

// ================= TUTORIAL =================
function nextTutorial(step) {
    document.querySelectorAll('.tutorial-card').forEach(c => c.classList.remove('active'));
    const card = document.getElementById('tut-' + step);
    if (card) card.classList.add('active');
}

function finishTutorial() {
    localStorage.setItem('vv_premium_tutorial_done', 'DA');
    document.getElementById('tutorial-screen').style.display = 'none';
    showApp();
    loadUserData();
}

// ================= SHOW APP =================
function showApp() {
    const app = document.getElementById('app-container');
    const dock = document.getElementById('main-dock');
    app.style.display = 'block';
    dock.style.display = 'flex';
    setTimeout(() => { app.style.opacity = '1'; }, 50);
    initMap();
    setTimeout(function() { maybeStartProximity(); }, 3000);
}

// ================= SILENT LOGIN =================
let lastActiveUpdated = false;

function silentLogin() {
    const current = auth.currentUser;
    if (current) {
        currentUser = current;
        if (!lastActiveUpdated) {
            lastActiveUpdated = true;
            db.collection('users').doc(current.uid).update({
                lastActive: firebase.firestore.FieldValue.serverTimestamp()
            }).catch(() => {});
        }
        loadUserData();
        return;
    }

    auth.signInAnonymously().then(cred => {
        currentUser = cred.user;
        if (!lastActiveUpdated) {
            lastActiveUpdated = true;
            db.collection('users').doc(cred.user.uid).update({
                lastActive: firebase.firestore.FieldValue.serverTimestamp()
            }).catch(() => {});
        }
        loadUserData();
    }).catch(err => console.log('Silent login err:', err));
}

// ================= LOAD USER DATA =================
let userDataListener = null;

function loadUserData() {
    const alias = localStorage.getItem('vv_alias') || 'INSIDER';

    var nameEl = document.getElementById('profile-main-name');
    if (nameEl) nameEl.textContent = alias;

    var hudEl = document.getElementById('hud-balance');
    if (hudEl && hudEl.textContent === '— VV') hudEl.textContent = '... VV';

    if (!currentUser) {
        console.log('[VV] currentUser null — retry 1s');
        setTimeout(loadUserData, 1000);
        return;
    }

    var uid = currentUser.uid;
    var userRef = db.collection('users').doc(uid);

    userRef.get().then(function(doc) {
        if (!doc.exists) {
            console.log('[VV] Document inexistent — cream cu 100 VV');
            return userRef.set({
                alias: alias,
                balance: 100,
                rating: 5,
                joinedAt: firebase.firestore.FieldValue.serverTimestamp(),
                accessKey: localStorage.getItem('vv_access_key') || '',
                lastActive: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
    }).then(function() {
        if (userDataListener) {
            userDataListener();
            userDataListener = null;
        }

        userDataListener = userRef.onSnapshot(function(doc) {
            if (!doc.exists) return;

            var data = doc.data();
            var balance = typeof data.balance === 'number' ? data.balance : 0;
            var lei = (balance * 0.5).toFixed(2);

            var hudEl2 = document.getElementById('hud-balance');
            var vvEl = document.getElementById('profile-vv-val');
            var leiEl = document.getElementById('profile-lei-val');
            var nameEl2 = document.getElementById('profile-main-name');

            if (hudEl2) hudEl2.textContent = balance + ' VV';
            if (vvEl) vvEl.textContent = balance;
            if (leiEl) leiEl.textContent = lei;
            if (nameEl2) nameEl2.textContent = data.alias || alias;

            updateOnyxProgress(balance);

            console.log('[VV] Balanta actualizata:', balance, 'VV');
        }, function(err) {
            console.error('[VV] onSnapshot eroare:', err.code, err.message);
            if (err.code === 'permission-denied') {
                setTimeout(loadUserData, 3000);
            }
        });

    }).catch(function(err) {
        console.error('[VV] loadUserData eroare:', err.code, err.message);
        setTimeout(loadUserData, 2000);
    });

    listenInbox();
    loadInviteKeys();
    loadLeaderboard();
}

// ================= LEADERBOARD =================
function loadLeaderboard() {
    db.collection('users')
        .orderBy('balance', 'desc')
        .limit(10)
        .onSnapshot(snap => {
            const container = document.getElementById('leaderboard-container');
            if (!container) return;

            container.innerHTML = '';
            let rank = 1;

            snap.forEach(doc => {
                const u = doc.data();
                const isMe = doc.id === (currentUser ? currentUser.uid : null);
                const medals = ['🥇', '🥈', '🥉'];
                const medal = rank <= 3 ? medals[rank-1] : `#${rank}`;

                container.innerHTML += `
                    <div style="
                        display:flex; align-items:center; gap:12px;
                        padding:12px 16px;
                        background:${isMe ? 'rgba(212,175,55,0.08)' : 'rgba(255,255,255,0.03)'};
                        border:1px solid ${isMe ? 'rgba(212,175,55,0.2)' : 'rgba(255,255,255,0.06)'};
                        border-radius:12px; margin-bottom:8px;
                    ">
                        <span style="font-size:18px; width:28px; text-align:center;">${medal}</span>
                        <div style="flex:1;">
                            <div style="font-size:13px; font-weight:700; color:${isMe ? '#D4AF37' : '#fff'};">
                                ${u.alias || 'INSIDER'} ${isMe ? '· Tu' : ''}
                            </div>
                        </div>
                        <div style="font-size:11px; font-weight:700; color:${rank === 1 ? '#D4AF37' : rank <= 3 ? '#0A84FF' : 'rgba(255,255,255,0.35)'};">
                            ${rank === 1 ? '👑 Elite' : rank <= 3 ? '⭐ Expert' : 'Insider'}
                        </div>
                    </div>
                `;
                rank++;
            });
        });
}

// ================= CHEI INVITATIE =================
function loadInviteKeys() {
    if (!currentUser) return;

    db.collection('users').doc(currentUser.uid).get().then(doc => {
        if (!doc.exists) return;
        const keys = doc.data().inviteKeys || [];
        const container = document.getElementById('invite-keys-container');
        if (!container) return;

        if (keys.length === 0) {
            container.innerHTML = '<div style="font-size:12px; color:rgba(255,255,255,0.3);">Nicio cheie disponibilă.</div>';
            return;
        }

        container.innerHTML = keys.map(key => `
            <div style="
                display:flex; justify-content:space-between; align-items:center;
                background:rgba(255,255,255,0.04);
                border:1px solid rgba(255,255,255,0.08);
                border-radius:10px; padding:12px 16px;
                margin-bottom:8px;
            ">
                <span style="font-family:monospace; font-size:16px; font-weight:700; color:#fff; letter-spacing:2px;">${key}</span>
                <button onclick="copyKey('${key}')" style="
                    background:rgba(255,255,255,0.08);
                    border:1px solid rgba(255,255,255,0.12);
                    border-radius:8px; padding:6px 12px;
                    color:rgba(255,255,255,0.6); font-size:11px;
                    font-weight:700; cursor:pointer; letter-spacing:1px;
                ">COPIAZĂ</button>
            </div>
        `).join('');
    });
}

function copyKey(key) {
    navigator.clipboard.writeText(key).then(() => {
        showToast('Cheie copiată! Trimite-o unui prieten 🎯');
    }).catch(() => {
        showToast('Cheie: ' + key);
    });
}

// ================= ONYX PROGRESS BAR =================
function updateOnyxProgress(balance) {
    const milestones = [500, 1000, 1500];
    const nextMilestone = milestones.find(m => balance < m) || 1500;
    const prevMilestone = nextMilestone === 500 ? 0 : milestones[milestones.indexOf(nextMilestone) - 1];
    
    const progress = Math.min(((balance - prevMilestone) / (nextMilestone - prevMilestone)) * 100, 100);
    
    const bar = document.getElementById('onyx-progress-bar');
    const label = document.getElementById('onyx-progress-label');
    if (bar) bar.style.width = progress + '%';
    if (label) label.textContent = `${balance} / ${nextMilestone} VV`;

    milestones.forEach(m => {
        const check = document.getElementById('check-' + m);
        const milestone = document.getElementById('milestone-' + m);
        if (!check || !milestone) return;
        
        if (balance >= m) {
            check.textContent = '✅';
            check.style.color = '#34c759';
            milestone.style.opacity = '1';
        } else if (m === nextMilestone) {
            check.textContent = `${Math.round(progress)}%`;
            check.style.color = '#D4AF37';
            milestone.style.opacity = '1';
        } else {
            check.textContent = '—';
            check.style.color = 'rgba(212,175,55,0.3)';
            milestone.style.opacity = '0.5';
        }
    });

    if (balance === 500 || balance === 1000 || balance === 1500) {
        const months = balance === 500 ? 1 : balance === 1000 ? 2 : 3;
        showToast(`🎉 Felicitări! Ai câștigat ${months} ${months === 1 ? 'lună' : 'luni'} ONYX gratuit!`);
    }
}

// ================= HARTA — PILON 1: HARTĂ CURATĂ (fără venues/Overpass) =================
function initMap() {
    if (map) return;

    map = L.map('map', { zoomControl: false }).setView([44.4325, 26.1038], 14);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '',
        maxZoom: 19,
        detectRetina: true
    }).addTo(map);

    // Limitam harta la Romania
    const romaniaBounds = L.latLngBounds(
        L.latLng(43.5, 20.0),
        L.latLng(48.5, 30.5)
    );
    map.setMaxBounds(romaniaBounds);
    map.options.minZoom = 6;

    // GPS — PILON 2: salvam coordonatele userului global
    // Pornire pe Bucuresti — userul controleaza harta
    // GPS doar pentru marker si verificari distanta, NU muta harta
    map.locate({ setView: false, enableHighAccuracy: true, watch: true });

    let userMarker = null;
    let firstLocationDone = false;

    map.on('locationfound', e => {
        userCurrentLat = e.latlng.lat;
        userCurrentLng = e.latlng.lng;

        if (!userMarker) {
            userMarker = L.circleMarker(e.latlng, {
                radius: 8,
                fillColor: "#fff",
                color: "rgba(255,255,255,0.25)",
                weight: 10,
                opacity: 1,
                fillOpacity: 1
            }).addTo(map);
        } else {
            userMarker.setLatLng(e.latlng);
        }

        // Nu centram harta automat niciodata
        // Userul e pe Bucuresti si cauta manual locatii
    });

    // Click pe hartă → Reverse Geocoding + lansează contract
    map.on('click', async e => {
        if (targetMarker) map.removeLayer(targetMarker);

        const crosshairIcon = L.divIcon({
            className: 'target-crosshair',
            html: '<div class="crosshair-center"></div>',
            iconSize: [40, 40],
            iconAnchor: [20, 20]
        });

        targetMarker = L.marker(e.latlng, { icon: crosshairIcon }).addTo(map);

        const loadingPopup = `
            <div style="text-align:center; padding:4px; min-width:160px;">
                <div style="font-size:10px; color:rgba(255,255,255,0.3); letter-spacing:2px; font-weight:700;">SE SCANEAZĂ...</div>
            </div>`;
        targetMarker.bindPopup(loadingPopup, { closeButton: false, className: 'dark-popup' }).openPopup();

        let locationName = 'Locație necunoscută';
        try {
            const lat = e.latlng.lat;
            const lng = e.latlng.lng;
            const res = await fetch(
                `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
                { headers: { 'Accept-Language': 'ro' } }
            );
            const data = await res.json();
            if (data && data.address) {
                locationName = data.address.road
                    || data.address.pedestrian
                    || data.address.neighbourhood
                    || data.address.suburb
                    || data.display_name
                    || 'Locație necunoscută';
            }
        } catch (err) {
            console.log('Geocoding err:', err);
        }

        const popupContent = `
            <div style="text-align:center; padding:4px; min-width:160px;">
                <div style="font-size:9px; color:rgba(255,255,255,0.35); margin-bottom:5px; font-weight:700; letter-spacing:2px;">ZONĂ ȚINTĂ</div>
                <div style="font-size:13px; color:#fff; font-weight:800; margin-bottom:10px; line-height:1.3;">${locationName}</div>
                <button onclick="map.closePopup(); openCreateMissionModal(${e.latlng.lat}, ${e.latlng.lng});"
                    style="background:rgba(255,255,255,0.92); color:#000; border:none; padding:11px 16px; border-radius:10px; font-weight:800; font-size:12px; cursor:pointer; width:100%; letter-spacing:0.5px;">
                    LANSEAZĂ CONTRACT
                </button>
            </div>`;

        targetMarker.getPopup().setContent(popupContent);
    });

    // Încărcăm misiunile existente pe hartă
    loadMissionsOnMap();

    // PILON 1: Inițializăm search bar-ul
    initSearchBar();

    setTimeout(() => { if (map) map.invalidateSize(); }, 400);
}

// ================= PILON 1: SEARCH BAR — Nominatim Autocomplete =================
let searchDebounceTimer = null;

function initSearchBar() {
    const input = document.getElementById('vv-search-input');
    const clearBtn = document.getElementById('vv-search-clear');
    if (!input) return;

    input.addEventListener('input', function() {
        const query = this.value.trim();
        
        // Arată/ascunde butonul clear
        if (clearBtn) {
            clearBtn.style.display = query.length > 0 ? 'flex' : 'none';
        }

        // Debounce 400ms
        clearTimeout(searchDebounceTimer);
        if (query.length < 3) {
            hideSearchResults();
            return;
        }

        searchDebounceTimer = setTimeout(() => {
            searchNominatim(query);
        }, 400);
    });

    // Închide rezultatele la click în afară
    document.addEventListener('click', function(e) {
        const container = document.getElementById('vv-search-container');
        if (container && !container.contains(e.target)) {
            hideSearchResults();
        }
    });
}

async function searchNominatim(query) {
    const resultsEl = document.getElementById('vv-search-results');
    const loadingEl = document.getElementById('vv-search-loading');
    if (!resultsEl) return;

    // Arătăm loading
    resultsEl.style.display = 'none';
    loadingEl.style.display = 'block';

    try {
        // Bias spre România pentru rezultate mai relevante
        const res = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&countrycodes=ro&addressdetails=1&accept-language=ro`,
            { headers: { 'Accept-Language': 'ro' } }
        );
        const data = await res.json();

        loadingEl.style.display = 'none';

        if (!data || data.length === 0) {
            resultsEl.innerHTML = `
                <div style="padding:20px; text-align:center; font-size:12px; color:rgba(255,255,255,0.3);">
                    Nicio locație găsită
                </div>`;
            resultsEl.style.display = 'block';
            return;
        }

        resultsEl.innerHTML = data.map(item => {
            const name = item.address ?
                (item.address.road || item.address.pedestrian || item.address.neighbourhood || item.name || item.display_name.split(',')[0]) :
                item.display_name.split(',')[0];
            const address = item.display_name.split(',').slice(0, 3).join(',');
            
            return `
                <div class="vv-search-result-item" onclick="selectSearchResult(${item.lat}, ${item.lon}, '${name.replace(/'/g, "\\'")}')">
                    <div class="vv-search-result-icon">
                        <i class="fas fa-map-pin"></i>
                    </div>
                    <div class="vv-search-result-text">
                        <div class="vv-search-result-name">${name}</div>
                        <div class="vv-search-result-address">${address}</div>
                    </div>
                </div>`;
        }).join('');

        resultsEl.style.display = 'block';

    } catch(err) {
        console.error('[VV Search]', err);
        loadingEl.style.display = 'none';
        resultsEl.innerHTML = `
            <div style="padding:20px; text-align:center; font-size:12px; color:rgba(255,255,255,0.3);">
                Eroare conexiune. Încearcă din nou.
            </div>`;
        resultsEl.style.display = 'block';
    }
}

function selectSearchResult(lat, lng, name) {
    hideSearchResults();

    // Setăm inputul cu numele locației
    const input = document.getElementById('vv-search-input');
    if (input) input.value = name;

    // Arătăm butonul clear
    const clearBtn = document.getElementById('vv-search-clear');
    if (clearBtn) clearBtn.style.display = 'flex';

    // Scoatem pinul vechi
    if (targetMarker) map.removeLayer(targetMarker);

    // Cinematic flyTo
    map.flyTo([lat, lng], 17, {
        duration: 1.5,
        easeLinearity: 0.25
    });

    // Punem pin după animație
    setTimeout(() => {
        const crosshairIcon = L.divIcon({
            className: 'target-crosshair',
            html: '<div class="crosshair-center"></div>',
            iconSize: [40, 40],
            iconAnchor: [20, 20]
        });

        targetMarker = L.marker([lat, lng], { icon: crosshairIcon }).addTo(map);

        const popupContent = `
            <div style="text-align:center; padding:4px; min-width:160px;">
                <div style="font-size:9px; color:rgba(255,255,255,0.35); margin-bottom:5px; font-weight:700; letter-spacing:2px;">ZONĂ ȚINTĂ</div>
                <div style="font-size:13px; color:#fff; font-weight:800; margin-bottom:10px; line-height:1.3;">${name}</div>
                <button onclick="map.closePopup(); openCreateMissionModal(${lat}, ${lng});"
                    style="background:rgba(255,255,255,0.92); color:#000; border:none; padding:11px 16px; border-radius:10px; font-weight:800; font-size:12px; cursor:pointer; width:100%; letter-spacing:0.5px;">
                    LANSEAZĂ CONTRACT AICI
                </button>
            </div>`;

        targetMarker.bindPopup(popupContent, { closeButton: false, className: 'dark-popup' }).openPopup();
    }, 1600);
}

function clearSearch() {
    const input = document.getElementById('vv-search-input');
    const clearBtn = document.getElementById('vv-search-clear');
    if (input) input.value = '';
    if (clearBtn) clearBtn.style.display = 'none';
    hideSearchResults();
}

function hideSearchResults() {
    const resultsEl = document.getElementById('vv-search-results');
    const loadingEl = document.getElementById('vv-search-loading');
    if (resultsEl) resultsEl.style.display = 'none';
    if (loadingEl) loadingEl.style.display = 'none';
}

// ================= MISIUNI PE HARTĂ — REAL-TIME =================
let missionMarkers = {};
let missionsListenerActive = false;

function loadMissionsOnMap() {
    if (!map) return;
    if (missionsListenerActive) return;
    missionsListenerActive = true;

    const now = new Date();

    db.collection('missions')
        .where('status', '==', 'open')
        .onSnapshot(snap => {
            snap.docChanges().forEach(change => {
                const doc = change.doc;
                const m = doc.data();

                if (change.type === 'removed') {
                    if (missionMarkers[doc.id]) {
                        try { map.removeLayer(missionMarkers[doc.id]); } catch(e) {}
                        delete missionMarkers[doc.id];
                    }
                    return;
                }

                if (change.type === 'modified') {
                    if (missionMarkers[doc.id]) {
                        try { map.removeLayer(missionMarkers[doc.id]); } catch(e) {}
                        delete missionMarkers[doc.id];
                    }
                }

                const isMyMission = (currentUser && m.createdBy === currentUser.uid);
                if (m.status !== 'open' && !(isMyMission && m.status === 'completed')) return;

                if (change.type === 'added' || change.type === 'modified') {
                    if (!m.lat || !m.lng) return;
                    if (m.status !== 'open') return;

                    // Update proximity cache
                    updateMissionProximityCache(doc.id, m);

                    if (m.expiresAt && m.expiresAt.toDate() < now) return;

                    const minsLeft = m.expiresAt
                        ? Math.max(0, Math.round((m.expiresAt.toDate() - now) / 60000))
                        : null;

                    const icon = L.divIcon({
                        className: '',
                        html: `<div style="
                            background: rgba(255,59,48,0.85);
                            backdrop-filter: blur(10px);
                            -webkit-backdrop-filter: blur(10px);
                            border: 2px solid rgba(255,100,80,0.6);
                            border-radius: 50%;
                            width: 38px; height: 38px;
                            display: flex; align-items: center; justify-content: center;
                            font-size: 16px;
                            box-shadow: 0 0 16px rgba(255,59,48,0.4);
                            animation: missionPulse 2s infinite;
                        ">🎯</div>`,
                        iconSize: [38, 38],
                        iconAnchor: [19, 19]
                    });

                    const marker = L.marker([m.lat, m.lng], { icon, zIndexOffset: 1000 }).addTo(map);

                    const isMyMission2 = m.createdBy === (currentUser ? currentUser.uid : null);

                    if (isMyMission2) {
                        let creatorContent = '';

                        if (m.status === 'open') {
                            creatorContent = `
                                <div style="padding:4px; min-width:200px;">
                                    <div style="font-size:10px; color:#D4AF37; margin-bottom:5px; letter-spacing:2px; font-weight:700;">MISIUNEA TA</div>
                                    <div style="font-size:14px; color:#fff; font-weight:800; margin-bottom:6px;">${m.description || 'Misiune'}</div>
                                    <div style="display:flex; justify-content:space-between; margin-bottom:12px;">
                                        <span style="font-size:12px; color:rgba(255,255,255,0.5);">Recompensă</span>
                                        <span style="font-size:13px; color:#fff; font-weight:900;">${m.reward} VV</span>
                                    </div>
                                    <div style="background:rgba(52,199,89,0.1); border:1px solid rgba(52,199,89,0.2); border-radius:8px; padding:8px; text-align:center; margin-bottom:10px;">
                                        <span style="font-size:11px; color:#34c759;">⏳ Se caută Insider...</span>
                                    </div>
                                    <button onclick="map.closePopup(); cancelMyMission('${doc.id}', ${m.reward});"
                                        style="background:rgba(255,59,48,0.1); color:#ff3b30;
                                        border:1px solid rgba(255,59,48,0.3);
                                        padding:10px; border-radius:10px; font-weight:700;
                                        font-size:12px; cursor:pointer; width:100%;">
                                        ANULEAZĂ & RECUPEREAZĂ ${m.reward} VV
                                    </button>
                                </div>`;
                        } else {
                            creatorContent = `
                                <div style="padding:4px; min-width:200px;">
                                    <div style="font-size:10px; color:#34c759; margin-bottom:5px; letter-spacing:2px; font-weight:700;">✅ MISIUNE COMPLETATĂ</div>
                                    <div style="font-size:13px; color:#fff; font-weight:800; margin-bottom:10px;">${m.description || 'Misiune'}</div>
                                    ${m.photoUrl ? `<img src="${m.photoUrl}" style="width:100%; border-radius:8px; margin-bottom:8px;" />` : ''}
                                    <button onclick="map.closePopup(); openMissionResult('${doc.id}');"
                                        style="background:rgba(255,255,255,0.9); color:#000; border:none;
                                        padding:10px; border-radius:10px; font-weight:800;
                                        font-size:12px; cursor:pointer; width:100%;">
                                        VEZ VV PROOF COMPLET
                                    </button>
                                </div>`;
                        }

                        marker.bindPopup(creatorContent, { closeButton: false, className: 'dark-popup' });

                    } else {
                        marker.bindPopup(`
                            <div style="padding:4px; min-width:190px;">
                                <div style="font-size:10px; color:rgba(255,59,48,0.8); margin-bottom:6px; letter-spacing:2px; font-weight:700;">CONTRACT ACTIV</div>
                                <div style="font-size:14px; color:#fff; font-weight:800; margin-bottom:8px;">${m.description || 'Misiune'}</div>
                                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                                    <span style="font-size:13px; color:#fff; font-weight:900;">${m.reward} VV</span>
                                    ${minsLeft !== null ? `<span style="font-size:11px; color:rgba(255,255,255,0.4);">⏱ ${minsLeft} min</span>` : ''}
                                </div>
                                <button onclick="map.closePopup(); acceptMission('${doc.id}');"
                                    style="background:rgba(255,255,255,0.92); color:#000; border:none;
                                    padding:12px; border-radius:10px; font-weight:800;
                                    font-size:12px; cursor:pointer; width:100%;">
                                    ACCEPTĂ MISIUNEA
                                </button>
                            </div>`, { closeButton: false, className: 'dark-popup' });
                    }

                    missionMarkers[doc.id] = marker;
                }
            });
        });
}

// ================= MODAL CREATE MISSION =================
let missionLat = null, missionLng = null;

function openCreateMissionModal(lat, lng) {
    missionLat = lat;
    missionLng = lng;
    openModal('create-mission-modal');
}

function selectReward(val) {
    selectedReward = val;
    document.querySelectorAll('.reward-btn[id^="rew-btn"]').forEach(b => b.classList.remove('active'));
    const btn = document.getElementById('rew-btn-' + val);
    if (btn) btn.classList.add('active');
}

// ================= PILON 2: submitPinpointMission cu verificare distanță min 1km =================
async function submitPinpointMission() {
    const desc = document.getElementById('mission-desc').value.trim();
    if (!desc) { showToast('Descrie misiunea!'); return; }
    if (!currentUser) {
        try {
            const cred = await auth.signInAnonymously();
            currentUser = cred.user;
        } catch(e) {
            showToast('Eroare reconectare. Reîncearcă.');
            return;
        }
    }

    const launchBtn = document.getElementById('btn-launch-radar');
    launchBtn.textContent = 'SE VERIFICĂ...';
    launchBtn.style.opacity = '0.6';

    // ===== PILON 2: Verificare distanță minim 1km =====
    try {
        // Obținem GPS proaspăt
        const freshPos = await new Promise((resolve, reject) => {
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                    err => {
                        // Fallback la coordonatele din hartă
                        if (userCurrentLat !== null) {
                            resolve({ lat: userCurrentLat, lng: userCurrentLng });
                        } else {
                            reject(err);
                        }
                    },
                    { enableHighAccuracy: true, timeout: 5000 }
                );
            } else if (userCurrentLat !== null) {
                resolve({ lat: userCurrentLat, lng: userCurrentLng });
            } else {
                reject(new Error('GPS indisponibil'));
            }
        });

        const targetLat = parseFloat(missionLat) || 44.4325;
        const targetLng = parseFloat(missionLng) || 26.1038;
        const distanceToTarget = haversineDistance(freshPos.lat, freshPos.lng, targetLat, targetLng);

        if (distanceToTarget < 100) {
            var distLeft = Math.round(100 - distanceToTarget);
            showToast('⚠️ Ești prea aproape! Lansează la minim 100m de tine. (' + Math.round(distanceToTarget) + 'm acum)');
            launchBtn.textContent = 'LANSEAZĂ CONTRACTUL';
            launchBtn.style.opacity = '1';
            return;
        }
    } catch(gpsErr) {
        console.warn('[VV] GPS error la verificare distanță:', gpsErr);
        // Continuăm fără verificare dacă GPS-ul nu merge
    }
    // ===== SFÂRȘIT PILON 2 =====

    launchBtn.textContent = 'SE LANSEAZĂ...';

    const expiryMinutes = Math.round((selectedReward * 1.5) + 5);
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

    db.collection('users').doc(currentUser.uid).get().then(doc => {
        const balance = (doc.data() ? doc.data().balance : 0) || 0;
        if (balance < selectedReward) {
            showToast('VV insuficienți!');
            launchBtn.textContent = 'LANSEAZĂ CONTRACTUL';
            launchBtn.style.opacity = '1';
            return;
        }

        const batch = db.batch();
        const missionRef = db.collection('missions').doc();
        lastCreatedMissionId = missionRef.id;
        batch.set(missionRef, {
            description: desc,
            reward: selectedReward,
            lat: missionLat || 44.4325,
            lng: missionLng || 26.1038,
            createdBy: currentUser.uid,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            expiresAt: firebase.firestore.Timestamp.fromDate(expiresAt),
            expiryMinutes: expiryMinutes,
            status: 'open'
        });

        const userRef = db.collection('users').doc(currentUser.uid);
        batch.update(userRef, {
            balance: firebase.firestore.FieldValue.increment(-selectedReward)
        });

        return batch.commit();
    }).then(() => {
        closeModal('create-mission-modal');
        document.getElementById('mission-desc').value = '';
        launchBtn.textContent = 'LANSEAZĂ CONTRACTUL';
        launchBtn.style.opacity = '1';
        showInsiderSearch(selectedReward);
    }).catch(err => {
        console.log('Eroare misiune:', err);
        showToast('Eroare. Încearcă din nou.');
        launchBtn.textContent = 'LANSEAZĂ CONTRACTUL';
        launchBtn.style.opacity = '1';
    });
}

// ================= LISTA MISIUNI =================
function openMissionsList() {
    openModal('missions-list-modal');
    const container = document.getElementById('missions-container');
    container.innerHTML = '<div style="color:rgba(255,255,255,0.3); text-align:center; padding:30px; font-size:13px;">Se încarcă...</div>';

    db.collection('missions').where('status', '==', 'open').limit(20).get()
        .then(snap => {
            if (snap.empty) {
                container.innerHTML = '<div style="color:rgba(255,255,255,0.3); text-align:center; padding:30px; font-size:13px;">Nicio misiune activă momentan.</div>';
                return;
            }

            container.innerHTML = '';
            const now = new Date();
            snap.forEach(doc => {
                const m = doc.data();
                if (m.expiresAt && m.expiresAt.toDate() < now) return;
                const div = document.createElement('div');
                div.style.cssText = `
                    background: rgba(255,255,255,0.05);
                    border: 1px solid rgba(255,255,255,0.08);
                    border-radius: 14px;
                    padding: 16px;
                    margin-bottom: 12px;
                    cursor: pointer;
                    transition: background 0.2s;
                `;
                div.innerHTML = `
                    <div style="font-size:13px; color:#fff; font-weight:700; margin-bottom:6px;">${m.description || 'Misiune'}</div>
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-size:12px; color:rgba(255,255,255,0.4);">Recompensă</span>
                        <span style="font-size:14px; color:#fff; font-weight:800;">${m.reward} VV</span>
                    </div>
                `;
                div.onclick = () => acceptMission(doc.id);
                container.appendChild(div);
            });
        })
        .catch(() => {
            container.innerHTML = '<div style="color:rgba(255,255,255,0.3); text-align:center; padding:30px;">Eroare de conexiune.</div>';
        });
}

// ================= ANULEAZĂ PROPRIA MISIUNE =================
var isCancelling = false;
var lastCreatedMissionId = null;

async function cancelMyMission(missionId, reward) {
    if (!currentUser) return;
    if (isCancelling) return;
    if (!confirm('Anulezi misiunea și recuperezi ' + reward + ' VV?')) return;

    isCancelling = true;

    try {
        var batch = db.batch();

        batch.delete(db.collection('missions').doc(missionId));
        batch.update(db.collection('users').doc(currentUser.uid), {
            balance: firebase.firestore.FieldValue.increment(reward)
        });

        await batch.commit();

        if (missionMarkers[missionId]) {
            try { map.removeLayer(missionMarkers[missionId]); } catch(e) {}
            delete missionMarkers[missionId];
        }
        if (map) {
            map.eachLayer(function(layer) {
                if (layer._missionId === missionId) {
                    try { map.removeLayer(layer); } catch(e) {}
                }
            });
        }

        showToast('✅ Misiune anulată! +' + reward + ' VV recuperați.');

    } catch(e) {
        showToast('Eroare anulare: ' + e.message);
    } finally {
        isCancelling = false;
    }
}

// ================= VEZI REZULTATUL MISIUNII =================
async function openMissionResult(missionId) {
    try {
        const snap = await db.collection('inbox')
            .where('missionId', '==', missionId)
            .limit(1).get();

        const modal = document.createElement('div');
        modal.id = 'mission-result-modal';
        modal.style.cssText = `
            position:fixed; inset:0; z-index:99998;
            background:rgba(0,0,0,0.85);
            backdrop-filter:blur(20px);
            -webkit-backdrop-filter:blur(20px);
            display:flex; align-items:center; justify-content:center;
        `;

        let photoHtml = '<div style="color:rgba(255,255,255,0.3); text-align:center; padding:30px;">Poza se procesează...</div>';

        if (!snap.empty) {
            const data = snap.docs[0].data();
            if (data.photoUrl) {
                photoHtml = `
                    <div style="position:relative;">
                        <img src="${data.photoUrl}"
                            style="width:100%; border-radius:12px; display:block;" />
                        <div style="
                            position:absolute; bottom:0; left:0; right:0;
                            background:rgba(0,0,0,0.65);
                            backdrop-filter:blur(8px);
                            padding:10px 14px; border-radius:0 0 12px 12px;
                        ">
                            <div style="font-size:11px; color:#fff; font-weight:800;">VV PROOF</div>
                            <div style="font-size:10px; color:rgba(255,255,255,0.5);">
                                de ${data.alias || 'INSIDER'} · ${(data.createdAt ? data.createdAt.toDate().toLocaleString('ro-RO') : '') || ''}
                            </div>
                        </div>
                    </div>
                `;
            }
        }

        modal.innerHTML = `
            <div style="
                background:rgba(10,10,14,0.98);
                backdrop-filter:blur(30px);
                -webkit-backdrop-filter:blur(30px);
                border:1px solid rgba(255,255,255,0.1);
                border-radius:24px;
                padding:24px;
                width:90%; max-width:360px;
            ">
                <div style="font-size:10px; color:rgba(255,255,255,0.3); letter-spacing:3px; margin-bottom:8px;">VV PROOF</div>
                <div style="font-size:16px; font-weight:800; color:#fff; margin-bottom:16px;">Rezultatul Misiunii</div>
                ${photoHtml}
                <button onclick="document.getElementById('mission-result-modal').remove();"
                    style="width:100%; margin-top:16px; padding:14px; border-radius:12px;
                    background:rgba(255,255,255,0.08); color:rgba(255,255,255,0.5);
                    border:1px solid rgba(255,255,255,0.08);
                    font-weight:700; font-size:13px; cursor:pointer;">
                    ÎNCHIDE
                </button>
            </div>
        `;

        document.body.appendChild(modal);
    } catch(e) {
        showToast('Eroare: ' + e.message);
    }
}

// ================= ACCEPTĂ MISIUNEA (PILON 2: fără filtru de distanță la acceptare) =================
async function acceptMission(missionId) {
    if (!currentUser) { showToast('Nu ești conectat!'); return; }

    if (currentMissionId) {
        showToast('⚠️ Termină misiunea activă înainte să accepți alta!');
        return;
    }

    try {
        const missionDoc = await db.collection('missions').doc(missionId).get();
        if (missionDoc.exists && missionDoc.data().createdBy === currentUser.uid) {
            showToast('❌ Nu poți accepta misiuni create de tine!');
            return;
        }
    } catch(e) {
        console.log('Eroare verificare misiune:', e);
    }

    currentMissionId = missionId;
    closeModal('missions-list-modal');
    showToast('Misiune acceptată! Trimite dovada 📸');
    openCamera();
}

// ================= PILON 3: INBOX CU BUTON RAPORTEAZĂ =================
function openInbox() {
    openModal('inbox-modal');
}

function listenInbox() {
    if (!currentUser) return;

    db.collection('inbox').where('to', '==', currentUser.uid)
        .limit(20)
        .onSnapshot(snap => {
            const badge = document.getElementById('inbox-badge');
            let unread = 0;
            const container = document.getElementById('inbox-container');
            container.innerHTML = '';

            if (snap.empty) {
                container.innerHTML = '<div style="color:rgba(255,255,255,0.3); text-align:center; padding:30px; font-size:13px;">Niciun mesaj primit.</div>';
                badge.textContent = '0';
                badge.style.display = 'none';
                return;
            }

            snap.forEach(doc => {
                const msg = doc.data();

                // PILON 3: Ascundem mesajele raportate
                if (msg.status === 'reported') return;

                if (!msg.read) unread++;

                const div = document.createElement('div');
                div.style.cssText = `
                    background: rgba(255,255,255,0.05);
                    border: 1px solid rgba(255,255,255,0.08);
                    border-radius: 14px;
                    padding: 16px;
                    margin-bottom: 12px;
                `;
                div.innerHTML = `
                    <div style="font-size:11px; color:rgba(255,255,255,0.3); margin-bottom:6px; letter-spacing:1px;">DOVADĂ MISIUNE</div>
                    <div style="font-size:13px; color:#fff; margin-bottom:8px;">${msg.message || ''}</div>
                    ${msg.photoUrl ? `<img src="${msg.photoUrl}" style="width:100%; border-radius:10px; margin-bottom:8px;" />` : ''}
                    ${msg.reward ? `
                        <button onclick="openPremiumFeedback('${doc.id}', ${msg.reward}, '${msg.from}');"
                            style="background:rgba(255,255,255,0.9); color:#000; border:none; padding:10px; border-radius:10px; font-weight:800; font-size:12px; cursor:pointer; width:100%;">
                            APROBĂ +${msg.reward} VV
                        </button>
                        <button class="btn-report-fake" onclick="reportIntel('${doc.id}', ${msg.reward});">
                            🚩 RAPORTEAZĂ FAKE
                        </button>` : ''}
                `;
                container.appendChild(div);

                // Marchează ca citit
                doc.ref.update({ read: true });
            });

            badge.textContent = unread;
            badge.style.display = unread > 0 ? 'flex' : 'none';
        });
}

async function approveIntel(inboxId, reward, fromUid) {
    if (!currentUser) return;
    try {
        await db.collection('users').doc(fromUid).update({
            balance: firebase.firestore.FieldValue.increment(reward)
        });
        const inboxDoc = await db.collection('inbox').doc(inboxId).get();
        await db.collection('inbox').doc(inboxId).update({ reward: 0, status: 'approved' });
        // Stergem poza din photos pentru a economisi storage Beta
        if (inboxDoc.exists && inboxDoc.data().missionId) {
            const snap = await db.collection('photos')
                .where('missionId', '==', inboxDoc.data().missionId).limit(1).get();
            snap.forEach(doc => { if (!doc.data().flagged) doc.ref.delete().catch(() => {}); });
        }
        showToast('+' + reward + ' VV trimis Insider-ului! ✅');
    } catch(e) { showToast('Eroare: ' + e.message); }
}

// ================= PILON 3: RAPORTEAZĂ FAKE — refund + marcare =================
async function reportIntel(inboxId, reward) {
    if (!currentUser) return;
    if (!confirm('Raportezi această dovadă ca FAKE?\n\nVei primi înapoi ' + reward + ' VV și cazul va fi investigat.')) return;

    try {
        const batch = db.batch();

        // 1. Refund creatorul misiunii (userul curent)
        batch.update(db.collection('users').doc(currentUser.uid), {
            balance: firebase.firestore.FieldValue.increment(reward)
        });

        // 2. Marchează inbox-ul ca raportat (NU ștergem din DB)
        batch.update(db.collection('inbox').doc(inboxId), {
            status: 'reported',
            reportedAt: firebase.firestore.FieldValue.serverTimestamp(),
            reportedBy: currentUser.uid,
            reward: 0
        });

        await batch.commit();

        showToast('🚩 Raportat! +' + reward + ' VV recuperați. Cazul va fi investigat.');

    } catch(e) {
        console.error('[VV] Eroare raportare:', e);
        showToast('Eroare la raportare: ' + e.message);
    }
}

// ================= TIPS =================
function selectTip(val) {
    selectedTip = val;
    document.querySelectorAll('.reward-btn[id^="tip-btn"]').forEach(b => b.classList.remove('active'));
    const btn = document.getElementById('tip-btn-' + val);
    if (btn) btn.classList.add('active');
}

function finalizeApprovalWithTips() {
    const customTip = parseInt(document.getElementById('custom-tip').value) || selectedTip;
    showToast(`Plată de ${customTip} VV trimisă!`);
    closeModal('tips-modal');
}

// ================= FEEDBACK =================
function openFeedbackModal() {
    openModal('feedback-modal');
}

function sendFeedback() {
    const msg = document.getElementById('feedback-msg-input').value.trim();
    if (!msg) { showToast('Scrie un mesaj!'); return; }

    db.collection('feedback').add({
        message: msg,
        uid: (currentUser ? currentUser.uid : null) || 'anonim',
        alias: localStorage.getItem('vv_alias') || 'INSIDER',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => {
        showToast('Mesaj trimis! Mulțumim. ✅');
        document.getElementById('feedback-msg-input').value = '';
        closeModal('feedback-modal');
    }).catch(() => showToast('Eroare trimitere.'));
}

// ================= CAMERA — PILON 2: verificare distanță max 50m la dovadă =================
function openCamera() {
    const cam = document.getElementById('camera-screen');
    cam.style.display = 'flex';
    document.getElementById('post-photo-menu').style.display = 'none';
    document.getElementById('shutter-container').style.display = 'flex';

    capturedImageBlob = null;
    capturedGPS = null;
    var oldPreview = document.getElementById('preview-img');
    if (oldPreview) oldPreview.remove();
    var video = document.getElementById('real-camera-video');
    if (video) video.style.display = 'block';

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(pos => {
            capturedGPS = {
                lat: pos.coords.latitude,
                lng: pos.coords.longitude
            };
        }, () => { capturedGPS = null; });
    }

    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
        .then(stream => {
            currentStream = stream;
            document.getElementById('real-camera-video').srcObject = stream;
        })
        .catch(err => {
            showToast('Cameră indisponibilă: ' + err.message);
            cam.style.display = 'none';
        });
}

function closeCamera() {
    document.getElementById('camera-screen').style.display = 'none';
    if (currentStream) {
        currentStream.getTracks().forEach(t => t.stop());
        currentStream = null;
    }
}

let capturedGPS = null;

function takePicture() {
    const video = document.getElementById('real-camera-video');
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);

    const now = new Date();
    const timeStr = now.toLocaleString('ro-RO');

    const gpsStr = capturedGPS
        ? `${capturedGPS.lat.toFixed(5)}, ${capturedGPS.lng.toFixed(5)}`
        : 'GPS N/A';

    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, canvas.height - 70, canvas.width, 70);

    ctx.font = 'bold 15px -apple-system';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 4;
    ctx.fillText('VV PROOF', 14, canvas.height - 46);

    ctx.font = '12px -apple-system';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText('📍 ' + gpsStr, 14, canvas.height - 28);
    ctx.fillText('🕐 ' + timeStr, 14, canvas.height - 10);

    canvas.toBlob(blob => {
        capturedImageBlob = blob;
        const url = URL.createObjectURL(blob);
        document.getElementById('real-camera-video').style.display = 'none';
        const preview = document.createElement('img');
        preview.src = url;
        preview.style.cssText = 'width:100%; height:100%; object-fit:cover;';
        preview.id = 'preview-img';
        document.querySelector('.cam-viewfinder').appendChild(preview);
    }, 'image/jpeg', 0.92);

    document.getElementById('shutter-container').style.display = 'none';
    document.getElementById('post-photo-menu').style.display = 'block';
}

function retakePhoto() {
    capturedImageBlob = null;
    const preview = document.getElementById('preview-img');
    if (preview) preview.remove();
    document.getElementById('real-camera-video').style.display = 'block';
    document.getElementById('shutter-container').style.display = 'flex';
    document.getElementById('post-photo-menu').style.display = 'none';
}

// ================= PILON 2: uploadPhotoToCEO cu verificare distanță max 50m =================
async function uploadPhotoToCEO() {
    if (!capturedImageBlob) { showToast('Nu ai capturat nicio poză!'); return; }
    if (!currentUser) {
        try {
            const cred = await auth.signInAnonymously();
            currentUser = cred.user;
        } catch(e) {
            showToast('Eroare reconectare. Reîncearcă.');
            return;
        }
    }

    var msg = document.getElementById('photo-msg').value.trim();
    var sendBtn = document.getElementById('send-btn');

    function resetBtn() {
        sendBtn.textContent = 'TRIMITE RAPORT';
        sendBtn.style.opacity = '1';
        sendBtn.style.pointerEvents = 'auto';
    }

    sendBtn.textContent = 'SE VERIFICĂ...';
    sendBtn.style.opacity = '0.6';
    sendBtn.style.pointerEvents = 'none';

    // ===== PILON 2: Verificare distanță max 50m de locația misiunii =====
    if (currentMissionId) {
        try {
            const missionDoc = await db.collection('missions').doc(currentMissionId).get();
            if (missionDoc.exists) {
                const mData = missionDoc.data();
                const mLat = mData.lat;
                const mLng = mData.lng;

                // Obținem GPS proaspăt
                const freshPos = await new Promise((resolve, reject) => {
                    if (navigator.geolocation) {
                        navigator.geolocation.getCurrentPosition(
                            pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                            err => {
                                if (capturedGPS) {
                                    resolve(capturedGPS);
                                } else if (userCurrentLat !== null) {
                                    resolve({ lat: userCurrentLat, lng: userCurrentLng });
                                } else {
                                    reject(err);
                                }
                            },
                            { enableHighAccuracy: true, timeout: 5000 }
                        );
                    } else if (capturedGPS) {
                        resolve(capturedGPS);
                    } else if (userCurrentLat !== null) {
                        resolve({ lat: userCurrentLat, lng: userCurrentLng });
                    } else {
                        reject(new Error('GPS indisponibil'));
                    }
                });

                const distToMission = haversineDistance(freshPos.lat, freshPos.lng, mLat, mLng);

                if (distToMission > 50) {
                    showToast('📍 Ești prea departe! Trebuie să fii la fața locului (maxim 50m).');
                    resetBtn();
                    return;
                }
            }
        } catch(gpsErr) {
            console.warn('[VV] GPS check la upload:', gpsErr);
            // Continuăm fără verificare dacă GPS-ul nu merge
        }
    }
    // ===== SFÂRȘIT PILON 2 =====

    sendBtn.textContent = 'SE TRIMITE...';

    var fileName = 'proofs/' + currentUser.uid + '_' + Date.now() + '.jpg';
    var ref = storage.ref(fileName);

    try {
        await ref.put(capturedImageBlob);
        var url = await ref.getDownloadURL();

        var alias = localStorage.getItem('vv_alias') || 'INSIDER';
        var uid = currentUser.uid || '';
        var gpsLat = (capturedGPS && capturedGPS.lat) ? capturedGPS.lat : null;
        var gpsLng = (capturedGPS && capturedGPS.lng) ? capturedGPS.lng : null;
        var missionId = currentMissionId || null;
        var now = firebase.firestore.FieldValue.serverTimestamp();

        var batch = db.batch();

        var inboxCEORef = db.collection('inbox').doc();
        batch.set(inboxCEORef, {
            to: 'CEO',
            from: uid,
            alias: alias,
            message: msg || 'Captură trimisă',
            photoUrl: url,
            missionId: missionId,
            reward: selectedReward || 0,
            read: false,
            createdAt: now
        });

        var photoRef = db.collection('photos').doc();
        batch.set(photoRef, {
            url: url,
            message: msg || 'Captură VV',
            agentId: uid,
            alias: alias,
            missionId: missionId,
            gpsLat: gpsLat,
            gpsLng: gpsLng,
            timestamp: Date.now(),
            createdAt: now,
            flagged: false,
            approved: false
        });

        if (missionId) {
            try {
                var missionDoc = await db.collection('missions').doc(missionId).get();
                if (missionDoc.exists) {
                    var missionData = missionDoc.data();
                    var creatorId = missionData.createdBy || '';
                    if (creatorId && creatorId !== uid) {
                        var inboxCreatorRef = db.collection('inbox').doc();
                        batch.set(inboxCreatorRef, {
                            to: creatorId,
                            from: uid,
                            alias: alias,
                            message: msg || 'Insider a completat misiunea ta!',
                            photoUrl: url,
                            missionId: missionId,
                            reward: missionData.reward || 0,
                            read: false,
                            type: 'mission_result',
                            createdAt: now
                        });
                        batch.update(db.collection('missions').doc(missionId), {
                            status: 'completed',
                            photoUrl: url,
                            solverId: uid,
                            solvedAt: now
                        });
                    }
                }
            } catch(e) {
                console.log('[VV] Eroare update misiune:', e.message);
            }
        }

        await batch.commit();

        resetBtn();
        showToast('Raport trimis! ✅');
        document.getElementById('photo-msg').value = '';
        currentMissionId = null;
        capturedImageBlob = null;
        capturedGPS = null;
        closeCamera();
        setTimeout(function() { switchTab('map'); }, 1500);

    } catch(err) {
        console.error('[VV] Upload error:', err.code, err.message);
        showToast('Eroare: ' + (err.message || 'necunoscută'));
    } finally {
        resetBtn();
    }
}

// ================= SETTINGS & LOGOUT =================
function openSettings() {
    openModal('settings-modal');
}

function logoutAgent() {
    localStorage.removeItem('vv_premium_tutorial_done');
    localStorage.removeItem('vv_access_key');
    localStorage.removeItem('vv_alias');
    auth.signOut().then(() => location.reload());
}

// ================= CLEAN BETA =================
async function cleanBetaData() {
    const promptWord = prompt("Curăță misiunile și pozele de test?\nScrie: RESET");
    if (promptWord !== "RESET") { showToast('Anulat.'); return; }

    showToast('Se curăță...');

    try {
        for (const col of ['missions', 'photos', 'inbox']) {
            const snap = await db.collection(col).get();
            const batch = db.batch();
            snap.forEach(doc => batch.delete(doc.ref));
            if (!snap.empty) await batch.commit();
        }

        if (missionMarkers) {
            Object.values(missionMarkers).forEach(m => { try { map.removeLayer(m); } catch(e){} });
            Object.keys(missionMarkers).forEach(k => delete missionMarkers[k]);
        }

        showToast('✅ Gata! Sistem curat.');
        setTimeout(() => location.reload(), 2000);

    } catch(e) {
        showToast('Eroare: ' + e.message);
    }
}

// ================= SWITCH TAB =================
function switchTab(tab) {
    const mapView = document.getElementById('map-view');
    const profileView = document.getElementById('profile-screen');
    const tabMap = document.getElementById('tab-map');
    const tabProfile = document.getElementById('tab-profile');

    if (tab === 'map') {
        mapView.style.display = 'block';
        profileView.style.display = 'none';
        tabMap.classList.add('active');
        tabProfile.classList.remove('active');
        setTimeout(() => { if (map) map.invalidateSize(); }, 100);
    } else {
        mapView.style.display = 'none';
        profileView.style.display = 'block';
        tabMap.classList.remove('active');
        tabProfile.classList.add('active');
    }
}

// ================= MODAL HELPERS =================
function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.style.display = 'flex';
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.style.display = 'none';
}

// ================= RECRUTARE VV TEAM =================
async function submitApplication() {
    const skill = (document.getElementById('recruit-skill') ? document.getElementById('recruit-skill').value.trim() : '');
    const portfolio = (document.getElementById('recruit-portfolio') ? document.getElementById('recruit-portfolio').value.trim() : '');

    if (!skill) { showToast('Spune-ne ce știi să construiești!'); return; }

    const btn = event.target;
    btn.textContent = 'SE TRIMITE...';
    btn.style.opacity = '0.6';

    try {
        await db.collection('talent_pool').add({
            skill: skill,
            portfolio: portfolio || 'N/A',
            alias: localStorage.getItem('vv_alias') || 'INSIDER',
            uid: (currentUser ? currentUser.uid : null) || 'anonim',
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            status: 'pending'
        });

        document.getElementById('recruit-skill').value = '';
        document.getElementById('recruit-portfolio').value = '';
        btn.textContent = 'APLICĂ LA VV TEAM';
        btn.style.opacity = '1';
        showToast('✅ Aplicație trimisă! Te vom contacta.');
    } catch(e) {
        btn.textContent = 'APLICĂ LA VV TEAM';
        btn.style.opacity = '1';
        showToast('Eroare. Încearcă din nou.');
    }
}

// ================= TOAST NOTIFICATION =================
function showToast(msg) {
    let toast = document.getElementById('vv-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'vv-toast';
        toast.style.cssText = `
            position: fixed;
            bottom: 110px;
            left: 50%;
            transform: translateX(-50%) translateY(10px);
            background: rgba(255,255,255,0.12);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border: 1px solid rgba(255,255,255,0.15);
            color: #fff;
            padding: 12px 22px;
            border-radius: 30px;
            font-size: 13px;
            font-weight: 600;
            z-index: 999999;
            opacity: 0;
            transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            white-space: nowrap;
            pointer-events: none;
        `;
        document.body.appendChild(toast);
    }

    toast.textContent = msg;
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';

    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(10px)';
    }, 2800);
}

// ================= BARA INSIDER STYLE UBER =================
let insiderSearchTimer = null;

async function showInsiderSearch(reward) {
    const bar = document.getElementById('insider-search-bar');
    const searchText = document.getElementById('insider-search-text');
    const countText = document.getElementById('insider-count-text');
    const rewardText = document.getElementById('insider-reward-text');
    if (!bar) return;

    const dockHeight = 72;
    const safeArea = parseInt(getComputedStyle(document.documentElement)
        .getPropertyValue('--safe-area-bottom') || '0');
    bar.style.bottom = (dockHeight + 10 + safeArea) + 'px';

    bar.style.display = 'flex';
    bar.style.opacity = '0';
    setTimeout(() => {
        bar.style.transition = 'opacity 0.3s ease';
        bar.style.opacity = '1';
    }, 50);

    if (rewardText) rewardText.textContent = reward + ' VV';

    const messages = [
        'SE CAUTĂ INSIDER...',
        'SE SCANEAZĂ ZONA...',
        'CONNECTING TO NETWORK...',
        'INSIDER GĂSIT! 🎯'
    ];

    let msgIndex = 0;
    const msgTimer = setInterval(() => {
        if (searchText && msgIndex < messages.length - 1) {
            msgIndex++;
            searchText.textContent = messages[msgIndex];
        } else {
            clearInterval(msgTimer);
        }
    }, 1200);

    try {
        const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000);
        const snap = await db.collection('users')
            .where('lastActive', '>', fifteenMinAgo)
            .get();

        if (snap.size >= 2) {
            if (countText) countText.textContent = `${snap.size} Insideri activi în zonă`;
        } else {
            if (countText) countText.textContent = 'Se caută Insideri în rețea...';
            if (searchText) searchText.textContent = 'CONNECTING TO NETWORK...';
        }
    } catch(e) {
        console.log('Eroare count:', e);
        if (countText) countText.textContent = 'Se caută Insideri în rețea...';
    }

    clearTimeout(insiderSearchTimer);
    insiderSearchTimer = setTimeout(() => {
        hideInsiderSearch();
    }, 6000);
}

async function cancelFromSearchOverlay() {
    hideInsiderSearch();
    
    if (!lastCreatedMissionId) {
        showToast('Nicio misiune activă de anulat.');
        return;
    }

    var missionIdToCancel = lastCreatedMissionId;
    lastCreatedMissionId = null;

    try {
        var missionDoc = await db.collection('missions').doc(missionIdToCancel).get();
        var reward = selectedReward;
        
        if (missionDoc.exists) {
            reward = missionDoc.data().reward || selectedReward;
        }

        var batch = db.batch();
        batch.delete(db.collection('missions').doc(missionIdToCancel));
        batch.update(db.collection('users').doc(currentUser.uid), {
            balance: firebase.firestore.FieldValue.increment(reward)
        });
        await batch.commit();

        if (missionMarkers[missionIdToCancel]) {
            try { map.removeLayer(missionMarkers[missionIdToCancel]); } catch(e) {}
            delete missionMarkers[missionIdToCancel];
        }

        showToast('✅ Contract anulat! +' + reward + ' VV recuperați.');
    } catch(e) {
        console.error('[VV] Eroare anulare overlay:', e.message);
        showToast('Eroare la anulare: ' + e.message);
    }
}

function hideInsiderSearch() {
    const bar = document.getElementById('insider-search-bar');
    if (!bar) return;
    bar.style.transition = 'opacity 0.3s ease';
    bar.style.opacity = '0';
    setTimeout(() => { bar.style.display = 'none'; }, 300);
    clearTimeout(insiderSearchTimer);
}

// ================================================================
// ===== SISTEM PROXIMITATE 300-500m — Notificări misiuni aproape =====
// ================================================================
let proximityNotifSent = {}; // { missionId: true } — evităm spam
let proximityInterval = null;

function startProximityCheck() {
    if (proximityInterval) return; // deja pornit
    proximityInterval = setInterval(function() {
        checkNearbyMissions();
    }, 15000); // verifică la fiecare 15 secunde
}

function stopProximityCheck() {
    if (proximityInterval) {
        clearInterval(proximityInterval);
        proximityInterval = null;
    }
}

function checkNearbyMissions() {
    if (userCurrentLat === null || userCurrentLng === null) return;

    // Citim misiunile active din Firestore
    db.collection('missions')
        .where('status', '==', 'active')
        .get()
        .then(function(snap) {
            snap.forEach(function(doc) {
                var m = doc.data();
                if (!m.lat || !m.lng) return;
                if (m.createdBy === (currentUser && currentUser.uid)) return; // nu notifica propriile misiuni

                var dist = haversineDistance(userCurrentLat, userCurrentLng, m.lat, m.lng);

                // Notifică la 300-500m, o singură dată per misiune per sesiune
                if (dist >= 50 && dist <= 500 && !proximityNotifSent[doc.id]) {
                    proximityNotifSent[doc.id] = true;
                    showProximityNotif(dist, m.reward || 0, doc.id);
                }

                // Resetăm dacă utilizatorul s-a îndepărtat peste 600m
                if (dist > 600) {
                    delete proximityNotifSent[doc.id];
                }
            });
        })
        .catch(function() {}); // tăcut — nu blocăm app
}

function showProximityNotif(distMetri, reward, missionId) {
    var metersLeft = Math.round(distMetri);

    // Creăm notificarea vizuală
    var notif = document.createElement('div');
    notif.id = 'proximity-notif-' + missionId;
    notif.style.cssText = [
        'position:fixed',
        'top:90px',
        'left:16px',
        'right:16px',
        'z-index:99999',
        'background:rgba(18,18,22,0.96)',
        'backdrop-filter:blur(20px)',
        '-webkit-backdrop-filter:blur(20px)',
        'border:1px solid rgba(212,175,55,0.3)',
        'border-radius:18px',
        'padding:16px 18px',
        'display:flex',
        'align-items:center',
        'gap:14px',
        'animation:slideDownNotif 0.4s cubic-bezier(0.16,1,0.3,1)',
        'cursor:pointer'
    ].join(';');

    notif.innerHTML =
        '<div style="width:40px;height:40px;border-radius:50%;background:rgba(212,175,55,0.12);border:1px solid rgba(212,175,55,0.3);display:flex;align-items:center;justify-content:center;flex-shrink:0;">' +
            '<span style="font-size:18px;">📍</span>' +
        '</div>' +
        '<div style="flex:1;min-width:0;">' +
            '<div style="font-size:11px;letter-spacing:2px;color:rgba(212,175,55,0.8);font-weight:700;margin-bottom:3px;">EȘTI APROAPE DE O MISIUNE VV!</div>' +
            '<div style="font-size:13px;color:#fff;font-weight:600;line-height:1.4;">' +
                'Mai ai <span style="color:#D4AF37;font-weight:800;">' + metersLeft + 'm</span> până la pin. ' +
                'Recompensă: <span style="color:#D4AF37;font-weight:800;">+' + reward + ' VV</span>' +
            '</div>' +
            '<div style="font-size:11px;color:rgba(255,255,255,0.35);margin-top:2px;">Fiecare misiune contează la fel de mult!</div>' +
        '</div>' +
        '<div style="flex-shrink:0;color:rgba(255,255,255,0.2);font-size:18px;">›</div>';

    // Animație CSS
    if (!document.getElementById('proximity-anim-style')) {
        var style = document.createElement('style');
        style.id = 'proximity-anim-style';
        style.textContent = '@keyframes slideDownNotif{from{opacity:0;transform:translateY(-20px)}to{opacity:1;transform:translateY(0)}}';
        document.head.appendChild(style);
    }

    notif.onclick = function() {
        removeProximityNotif(notif);
    };

    document.body.appendChild(notif);

    // Dispare automat după 6 secunde
    setTimeout(function() {
        removeProximityNotif(notif);
    }, 6000);
}

function removeProximityNotif(notif) {
    if (!notif || !notif.parentNode) return;
    notif.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    notif.style.opacity = '0';
    notif.style.transform = 'translateY(-10px)';
    setTimeout(function() {
        if (notif.parentNode) notif.parentNode.removeChild(notif);
    }, 300);
}

// Pornește proximity check când e în app
// Apelat din showApp() — adaugă în fluxul existent
var _origShowApp = typeof showApp === 'function' ? showApp : null;
document.addEventListener('vv-app-ready', function() {
    startProximityCheck();
});

// ================================================================
// ===== MODAL PREMIUM FEEDBACK — Glassmorphism Uber-Apple =====
// ================================================================
var pfmCurrentInboxId = null;
var pfmCurrentReward = 0;
var pfmCurrentFromUid = null;
var pfmSelectedStar = 0;
var pfmSelectedTip = 0;

function openPremiumFeedback(inboxId, reward, fromUid, insiderAlias, missionTitle) {
    pfmCurrentInboxId = inboxId;
    pfmCurrentReward = reward;
    pfmCurrentFromUid = fromUid;
    pfmSelectedStar = 0;
    pfmSelectedTip = 0;

    // Reset stele
    document.querySelectorAll('.vv-star').forEach(function(s) {
        s.style.filter = 'grayscale(1) opacity(0.3)';
        s.style.color = '#fff';
    });

    // Reset tip-uri
    ['tip-vv-3','tip-vv-6','tip-vv-9'].forEach(function(id) {
        var btn = document.getElementById(id);
        if (btn) {
            btn.style.background = 'rgba(255,255,255,0.05)';
            btn.style.border = '1px solid rgba(255,255,255,0.08)';
            btn.style.color = 'rgba(255,255,255,0.5)';
        }
    });

    // Populează info
    var nameEl = document.getElementById('pfm-insider-name');
    var missionEl = document.getElementById('pfm-mission-name');
    if (nameEl) nameEl.textContent = insiderAlias || 'INSIDER';
    if (missionEl) missionEl.textContent = missionTitle || '';

    // Deschide
    var modal = document.getElementById('premium-feedback-modal');
    var box = document.getElementById('pfm-box');
    if (modal && box) {
        modal.style.display = 'flex';
        setTimeout(function() {
            box.style.transform = 'translateY(0)';
        }, 10);
    }
}

function closePremiumFeedback() {
    var modal = document.getElementById('premium-feedback-modal');
    var box = document.getElementById('pfm-box');
    if (box) box.style.transform = 'translateY(100%)';
    setTimeout(function() {
        if (modal) modal.style.display = 'none';
    }, 400);
}

function selectStar(val) {
    pfmSelectedStar = val;
    document.querySelectorAll('.vv-star').forEach(function(s) {
        var sv = parseInt(s.getAttribute('data-val'));
        if (sv <= val) {
            s.style.filter = 'none';
            s.style.color = '#D4AF37';
            s.style.textShadow = '0 0 12px rgba(212,175,55,0.5)';
        } else {
            s.style.filter = 'grayscale(1) opacity(0.3)';
            s.style.color = '#fff';
            s.style.textShadow = 'none';
        }
    });
}

function selectTipPremium(val) {
    pfmSelectedTip = (pfmSelectedTip === val) ? 0 : val; // toggle

    ['tip-vv-3','tip-vv-6','tip-vv-9'].forEach(function(id) {
        var btn = document.getElementById(id);
        if (!btn) return;
        var btnVal = parseInt(id.replace('tip-vv-',''));
        if (btnVal === pfmSelectedTip) {
            btn.style.background = 'rgba(212,175,55,0.12)';
            btn.style.border = '1px solid rgba(212,175,55,0.35)';
            btn.style.color = '#D4AF37';
        } else {
            btn.style.background = 'rgba(255,255,255,0.05)';
            btn.style.border = '1px solid rgba(255,255,255,0.08)';
            btn.style.color = 'rgba(255,255,255,0.5)';
        }
    });
}

async function submitPremiumFeedback() {
    if (!currentUser || !pfmCurrentInboxId) return;

    var btn = document.getElementById('pfm-confirm-btn');
    if (btn) { btn.textContent = 'SE PROCESEAZĂ...'; btn.disabled = true; }

    try {
        var batch = db.batch();
        var totalReward = pfmCurrentReward + pfmSelectedTip;

        // 1. Plătim Insider-ul: reward + tip
        batch.update(db.collection('users').doc(pfmCurrentFromUid), {
            balance: firebase.firestore.FieldValue.increment(totalReward)
        });

        // 2. Actualizăm inbox
        batch.update(db.collection('inbox').doc(pfmCurrentInboxId), {
            status: 'approved',
            reward: 0,
            tipAmount: pfmSelectedTip,
            ratingGiven: pfmSelectedStar,
            approvedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // 3. Salvăm ratingul pe profilul Insider-ului
        if (pfmSelectedStar > 0) {
            batch.update(db.collection('users').doc(pfmCurrentFromUid), {
                totalRatings: firebase.firestore.FieldValue.increment(1),
                ratingSum: firebase.firestore.FieldValue.increment(pfmSelectedStar)
            });
        }

        await batch.commit();

        // Ștergem poza din storage
        try {
            var inboxDoc = await db.collection('inbox').doc(pfmCurrentInboxId).get();
            if (inboxDoc.exists && inboxDoc.data().missionId) {
                var snap = await db.collection('photos')
                    .where('missionId', '==', inboxDoc.data().missionId).limit(1).get();
                snap.forEach(function(d) { if (!d.data().flagged) d.ref.delete().catch(function(){}); });
            }
        } catch(e) {}

        closePremiumFeedback();

        // Toast confirmare cu detalii
        var tipText = pfmSelectedTip > 0 ? ' + ' + pfmSelectedTip + ' VV tip' : '';
        var starText = pfmSelectedStar > 0 ? ' · ' + pfmSelectedStar + '★' : '';
        showToast('✅ +' + pfmCurrentReward + ' VV trimis' + tipText + starText);

    } catch(e) {
        showToast('Eroare: ' + e.message);
        if (btn) { btn.textContent = 'CONFIRMĂ'; btn.disabled = false; }
    }
}

// ================================================================
// ===== SISTEM PREMIUM 1: NOTIFICĂRI DE PROXIMITATE (300-500m) ===
// ================================================================
let activeMissionsForProximity = {};   // cache misiuni deschise
let proximityAlerted = {};             // evităm spam: {missionId: timestamp}
let proximityCheckInterval = null;

// Se apelează din loadMissionsOnMap când vine un snapshot
function updateMissionProximityCache(missionId, data) {
    if (data && data.status === 'open' && data.lat && data.lng) {
        activeMissionsForProximity[missionId] = {
            lat: data.lat,
            lng: data.lng,
            reward: data.reward || 0,
            description: data.description || 'Misiune activă'
        };
    } else {
        delete activeMissionsForProximity[missionId];
    }
}

// ================================================================
// Funcții Premium lipsă (completare)
// ================================================================

function showProximityAlert(meters, reward, desc) {
    var old = document.getElementById('vv-proximity-alert');
    if (old) old.remove();
    var el = document.createElement('div');
    el.id = 'vv-proximity-alert';
    el.style.cssText = 'position:fixed;top:80px;left:50%;transform:translateX(-50%);z-index:99999;background:rgba(10,10,18,0.92);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);border:1px solid rgba(212,175,55,0.4);border-radius:20px;padding:16px 20px;max-width:340px;width:90%;box-shadow:0 8px 40px rgba(212,175,55,0.15);';
    el.innerHTML = '<div style="display:flex;align-items:flex-start;gap:12px;">' +
        '<div style="font-size:22px;margin-top:2px;">📍</div>' +
        '<div style="flex:1;">' +
            '<div style="font-size:10px;letter-spacing:3px;color:rgba(212,175,55,0.8);font-weight:700;margin-bottom:4px;">EȘTI APROAPE DE O MISIUNE VV!</div>' +
            '<div style="font-size:13px;color:#fff;font-weight:600;margin-bottom:4px;">MAI AI <span style="color:#D4AF37;font-family:\'JetBrains Mono\',monospace;font-weight:900;">' + meters + 'm</span> PÂNĂ LA PIN</div>' +
            '<div style="font-size:11px;color:rgba(255,255,255,0.45);margin-bottom:8px;">FIECARE MISIUNE CONTEAZĂ LA FEL DE MULT!</div>' +
            '<div style="font-size:10px;letter-spacing:1px;color:rgba(212,175,55,0.6);">+' + reward + ' VV COINS</div>' +
        '</div>' +
        '<div onclick="document.getElementById(\'vv-proximity-alert\').remove()" style="color:rgba(255,255,255,0.3);cursor:pointer;font-size:18px;padding:2px;">×</div>' +
    '</div>';
    document.body.appendChild(el);
    setTimeout(function() { if (el.parentNode) el.remove(); }, 6000);
}

function selectFeedbackStar(n) {
    _selectedStars = n;
    [1,2,3,4,5].forEach(function(i) {
        var poly = document.getElementById('vv-star-poly-' + i);
        if (!poly) return;
        if (i <= n) {
            poly.setAttribute('fill', '#D4AF37');
            poly.setAttribute('stroke', '#D4AF37');
            poly.style.filter = 'drop-shadow(0 0 6px rgba(212,175,55,0.5))';
        } else {
            poly.setAttribute('fill', 'rgba(255,255,255,0.08)');
            poly.setAttribute('stroke', 'rgba(255,255,255,0.2)');
            poly.style.filter = 'none';
        }
    });
}

function selectFeedbackTip(amount) {
    _selectedTipAmount = (_selectedTipAmount === amount) ? 0 : amount;
    [3,6,9].forEach(function(v) {
        var chip = document.getElementById('vv-tip-' + v);
        if (chip) chip.classList.toggle('selected', v === _selectedTipAmount);
    });
}

function skipPremiumFeedback() {
    _selectedTipAmount = 0;
    _selectedStars = _selectedStars || 5;
    submitPremiumFeedback();
}

var _proximityStarted = false;
function maybeStartProximity() {
    if (_proximityStarted) return;
    _proximityStarted = true;
    startProximityCheck();
}
