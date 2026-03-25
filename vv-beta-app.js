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

// ================= BOOT =================
window.onload = () => {
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

    // PRIMUL PAS: logam anonim imediat ca sa avem token pentru Firestore
    auth.signInAnonymously().catch(function(err) {
        console.log('[VV] signInAnonymously err:', err.code);
    });

    // AUTH STATE LISTENER — sursa de adevar
    auth.onAuthStateChanged(function(user) {
        if (user) {
            currentUser = user;

            const tutorialDone = localStorage.getItem('vv_premium_tutorial_done');
            const accessKey = localStorage.getItem('vv_access_key');

            if (tutorialDone === 'DA' && accessKey) {
                // User cunoscut — direct in app
                document.getElementById('splash-screen').style.display = 'none';
                document.getElementById('tutorial-screen').style.display = 'none';
                showApp();
                loadUserData();
            } else {
                // User nou — aratam splash
                document.getElementById('splash-screen').style.display = 'flex';
            }
        }
    });
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
        // Pas 1 — verificam cheia in Firestore
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

        // Pas 2 — salvam cheia
        localStorage.setItem('vv_access_key', key);

        // Pas 3 — userul e deja logat anonim din boot
        // Ne asiguram ca currentUser e setat
        if (!currentUser) {
            btn.textContent = 'SE CONECTEAZĂ...';
            const cred = await auth.signInAnonymously();
            currentUser = cred.user;
        }

        // Pas 4 — succes
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
        // Eroarea exacta vizibila pe ecran
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

        // Generam 3 chei unice pentru acest user
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        const generateKey = () => Array.from({length: 6}, () => 
            chars[Math.floor(Math.random() * chars.length)]).join('');
        
        const userKeys = [generateKey(), generateKey(), generateKey()];
        
        // Salvam userul cu cheile lui
        await db.collection('users').doc(cred.user.uid).set({
            alias: alias,
            balance: 100,
            rating: 5,
            joinedAt: firebase.firestore.FieldValue.serverTimestamp(),
            accessKey: localStorage.getItem('vv_access_key'),
            inviteKeys: userKeys,
            keysBalance: 3
        });

        // Salvam cheile in colectia access_keys ca sa fie valide
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
        // Mergem la tutorial chiar dacă firebase dă eroare
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
}

// ================= SILENT LOGIN =================
let lastActiveUpdated = false;

function silentLogin() {
    // Daca userul e deja logat nu facem nimic
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

    // Altfel logam anonim
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

// ================= LOAD USER DATA — robust cu retry =================
let userDataListener = null; // tinem referinta la listener

function loadUserData() {
    const alias = localStorage.getItem('vv_alias') || 'INSIDER';

    // Setam alias imediat din localStorage
    var nameEl = document.getElementById('profile-main-name');
    if (nameEl) nameEl.textContent = alias;

    // Setam loading state
    var hudEl = document.getElementById('hud-balance');
    if (hudEl && hudEl.textContent === '— VV') hudEl.textContent = '... VV';

    if (!currentUser) {
        console.log('[VV] currentUser null — retry 1s');
        setTimeout(loadUserData, 1000);
        return;
    }

    var uid = currentUser.uid;
    var userRef = db.collection('users').doc(uid);

    // Verificam daca documentul exista
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
        // Oprim listener-ul vechi daca exista
        if (userDataListener) {
            userDataListener();
            userDataListener = null;
        }

        // Listener live pentru balanta
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
            // Retry la erori de permisiuni
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

// ================= LEADERBOARD CĂMIN =================
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
                        <div style="font-size:14px; font-weight:900; color:${isMe ? '#D4AF37' : 'rgba(255,255,255,0.7)'};">
                            ${(u.balance || 0).toLocaleString()} VV
                        </div>
                    </div>
                `;
                rank++;
            });
        });
}

// ================= CHEI INVITATIE USER =================
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
    
    // Calculăm procentul spre urmatorul milestone
    const progress = Math.min(((balance - prevMilestone) / (nextMilestone - prevMilestone)) * 100, 100);
    
    // Update bar
    const bar = document.getElementById('onyx-progress-bar');
    const label = document.getElementById('onyx-progress-label');
    if (bar) bar.style.width = progress + '%';
    if (label) label.textContent = `${balance} / ${nextMilestone} VV`;

    // Update milestone checks
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

    // Dacă a atins un milestone — toast special
    if (balance === 500 || balance === 1000 || balance === 1500) {
        const months = balance === 500 ? 1 : balance === 1000 ? 2 : 3;
        showToast(`🎉 Felicitări! Ai câștigat ${months} ${months === 1 ? 'lună' : 'luni'} ONYX gratuit!`);
    }
}

// ================= HARTA =================
function initMap() {
    if (map) return;

    map = L.map('map', { zoomControl: false }).setView([44.4325, 26.1038], 14);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '',
        maxZoom: 19,
        detectRetina: true  // Fix harta blurry pe ecrane Retina
    }).addTo(map);

    // Limitam harta la Romania + tari vecine
    const romaniaBounds = L.latLngBounds(
        L.latLng(43.5, 20.0),  // Sud-Vest
        L.latLng(48.5, 30.5)   // Nord-Est
    );
    map.setMaxBounds(romaniaBounds);
    map.options.minZoom = 6;

    // GPS
    map.locate({ setView: true, maxZoom: 16, enableHighAccuracy: true });

    let userMarker = null;
    map.on('locationfound', e => {
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

        // Popup loading
        const loadingPopup = `
            <div style="text-align:center; padding:4px; min-width:160px;">
                <div style="font-size:10px; color:rgba(255,255,255,0.3); letter-spacing:2px; font-weight:700;">SE SCANEAZĂ...</div>
            </div>`;
        targetMarker.bindPopup(loadingPopup, { closeButton: false, className: 'dark-popup' }).openPopup();

        // Reverse Geocoding via Nominatim (gratuit, fără API key)
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

    // Inițializăm cluster ÎNAINTE de venues
    venueClusterGroup = L.markerClusterGroup({
        maxClusterRadius: 45,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        zoomToBoundsOnClick: true,
        iconCreateFunction: function(cluster) {
            const count = cluster.getChildCount();
            const size = count < 10 ? 38 : count < 30 ? 46 : 54;
            return L.divIcon({
                html: `<div style="
                    width:${size}px; height:${size}px;
                    background: rgba(5,5,7,0.9);
                    backdrop-filter: blur(15px);
                    -webkit-backdrop-filter: blur(15px);
                    border: 1px solid rgba(212,175,55,0.6);
                    border-radius: 50%;
                    display: flex; align-items: center; justify-content: center;
                    color: #D4AF37; font-size: 13px; font-weight: 900;
                    font-family: -apple-system, sans-serif;
                    box-shadow: 0 2px 16px rgba(0,0,0,0.6);
                ">${count}</div>`,
                className: '',
                iconSize: [size, size],
                iconAnchor: [size/2, size/2]
            });
        }
    });
    map.addLayer(venueClusterGroup);

    // Încărcăm locațiile din București
    setTimeout(() => { loadBucharestVenues(); }, 800);

    setTimeout(() => { if (map) map.invalidateSize(); }, 400);
}

// ================= LOCAȚII BUCUREȘTI — FILTRARE + CLUSTERING =================

let venueClusterGroup = null;
let currentCategory = 'all';

const VENUE_CATEGORIES = {
    nightlife: {
        label: 'Club / Nightlife', emoji: '🎵',
        color: 'rgba(138,43,226,0.92)', border: 'rgba(180,100,255,0.8)',
        size: 30, zIndex: 500, cacheDays: 1,
        query: `[out:json][timeout:15];(node["amenity"="nightclub"](around:5000,44.4325,26.1038););out body;`
    },
    bar: {
        label: 'Bar / Lounge', emoji: '🍸',
        color: 'rgba(10,100,200,0.92)', border: 'rgba(10,132,255,0.8)',
        size: 28, zIndex: 400, cacheDays: 1,
        query: `[out:json][timeout:15];(node["amenity"="bar"](around:5000,44.4325,26.1038););out body;`
    },
    restaurant: {
        label: 'Restaurant', emoji: '🍽️',
        color: 'rgba(180,60,20,0.75)', border: 'rgba(255,100,40,0.5)',
        size: 22, zIndex: 200, cacheDays: 1,
        query: `[out:json][timeout:15];(node["amenity"="restaurant"](around:5000,44.4325,26.1038););out body;`
    },
    hotel: {
        label: 'Hotel', emoji: '🏨',
        color: 'rgba(20,120,60,0.75)', border: 'rgba(52,199,89,0.45)',
        size: 22, zIndex: 200, cacheDays: 7,
        query: `[out:json][timeout:15];(node["tourism"="hotel"](around:5000,44.4325,26.1038););out body;`
    },
    shopping: {
        label: 'Supermarketuri', emoji: '🛒',
        color: 'rgba(20,100,180,0.88)', border: 'rgba(60,160,240,0.6)',
        size: 24, zIndex: 300, cacheDays: 7,
        query: `[out:json][timeout:25];(node["shop"~"supermarket|convenience"](around:5000,44.4325,26.1038););out body;`
    },
    mall: {
        label: 'Mall-uri & Jumbo', emoji: '🛍️',
        color: 'rgba(120,40,180,0.88)', border: 'rgba(180,80,255,0.6)',
        size: 32, zIndex: 600, cacheDays: 7,
        isMall: true,
        query: `[out:json][timeout:25];(nwr["shop"="mall"](around:15000,44.4325,26.1038);nwr["name"~"(?i)Jumbo|Fashion House|AFI|Baneasa|Promenada|Mega Mall|Sun Plaza|Cotroceni|Liberty|Vitantis"](around:15000,44.4325,26.1038););out center;`
    }
};

// MOTOR PRINCIPAL — încarcă o categorie din Overpass și o afișează
async function applyFilter(category) {
    if (!map) return;
    if (!venueClusterGroup) {
        setTimeout(() => applyFilter(category), 500);
        return;
    }

    // Update UI pastile
    currentCategory = category;
    document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
    const activePill = document.getElementById('filter-' + category);
    if (activePill) activePill.classList.add('active');

    // Golim harta
    venueClusterGroup.clearLayers();

    if (category === 'all') {
        showToast('Se încarcă locațiile...');
        let totalAdded = 0;
        for (const [catKey, cat] of Object.entries(VENUE_CATEGORIES)) {
            try {
                const added = await loadCategoryMarkers(catKey, cat, 20);
                totalAdded += added;
            } catch(e) {
                console.error(`[VV] Eroare categorie ${catKey}:`, e);
            }
        }
        if (totalAdded > 0) {
            showToast(`${totalAdded} locații încărcate ✅`);
        } else {
            showToast('Eroare încărcare. Încearcă din nou.');
        }
        return;
    }

    const cat = VENUE_CATEGORIES[category];
    if (!cat) return;

    showToast(`Se caută ${cat.emoji} ${cat.label}...`);
    try {
        const limit = category === 'shopping' ? 50 : 40;
        const added = await loadCategoryMarkers(category, cat, limit);
        if (added > 0) {
            showToast(`${cat.emoji} ${added} locații găsite!`);
        } else {
            showToast(`${cat.emoji} Nicio locație găsită în zonă.`);
        }
    } catch(e) {
        console.error(`[VV] Eroare filtrare ${category}:`, e);
        showToast('Eroare conexiune. Încearcă din nou. 🔄');
    }
}

// ================= CACHE HELPERS =================
function getCacheKey(catKey) { return `vv_cache_${catKey}`; }
function getCacheTimestampKey(catKey) { return `vv_cache_ts_${catKey}`; }

function loadFromCache(catKey, cacheDays) {
    try {
        const ts = localStorage.getItem(getCacheTimestampKey(catKey));
        if (!ts) return null;
        const age = (Date.now() - parseInt(ts)) / (1000 * 60 * 60 * 24);
        if (age > cacheDays) { 
            console.log(`[VV Cache] ${catKey} expirat (${age.toFixed(1)} zile)`);
            return null; 
        }
        const raw = localStorage.getItem(getCacheKey(catKey));
        if (!raw) return null;
        const data = JSON.parse(raw);
        console.log(`[VV Cache] ${catKey} din cache (${age.toFixed(1)} zile vechi) — ${data.length} elemente`);
        return data;
    } catch(e) { return null; }
}

function saveToCache(catKey, elements) {
    try {
        localStorage.setItem(getCacheKey(catKey), JSON.stringify(elements));
        localStorage.setItem(getCacheTimestampKey(catKey), Date.now().toString());
        console.log(`[VV Cache] ${catKey} salvat (${elements.length} elemente)`);
    } catch(e) { console.warn('[VV Cache] LocalStorage plin:', e); }
}

// Fetch + adaugă markeri pentru o categorie
async function loadCategoryMarkers(catKey, cat, limit) {
    let addedCount = 0;
    try {
        // Verificăm cache-ul mai întâi
        const cacheDays = cat.cacheDays || 1;
        let elements = loadFromCache(catKey, cacheDays);

        if (!elements) {
            // Cache miss — fetch de la Overpass
            console.log(`[VV] Fetch live ${catKey}...`);
            const res = await fetch('https://overpass-api.de/api/interpreter', {
                method: 'POST',
                body: cat.query
            });

            if (!res.ok) {
                console.error(`[VV] HTTP ${res.status} pentru ${catKey} — ${res.statusText}`);
                if (res.status === 429) console.error('[VV] 429 Too Many Requests!');
                return 0;
            }

            const data = await res.json();
            if (!data.elements || data.elements.length === 0) {
                console.warn(`[VV] Niciun element găsit pentru ${catKey}`);
                return 0;
            }

            elements = data.elements;
            saveToCache(catKey, elements);
            console.log(`[VV] ${catKey}: ${elements.length} elemente de la API`);
        }

        const sliced = elements.slice(0, limit);

        sliced.forEach(el => {
            // Fallback coordonate: node → el.lat/lon, way/relation → el.center.lat/lon
            const lat = el.lat || (el.center && el.center.lat);
            const lon = el.lon || (el.center && el.center.lon);
            if (!lat || !lon) return;

            const name = (el.tags && el.tags.name) || (el.tags && el.tags['name:ro']) || (el.tags && el.tags.brand) || cat.label;
            const address = (el.tags && el.tags['addr:street'])
                ? `${el.tags['addr:street']}${el.tags['addr:housenumber'] ? ' ' + el.tags['addr:housenumber'] : ''}`
                : '';
            const phone = (el.tags && el.tags.phone) || (el.tags && el.tags['contact:phone']) || '';
            const opening = (el.tags && el.tags.opening_hours) || '';
            const brand = (el.tags && el.tags.brand) || '';

            const s = cat.size;
            const icon = L.divIcon({
                className: '',
                html: `<div style="
                    background: ${cat.color};
                    backdrop-filter: blur(8px);
                    -webkit-backdrop-filter: blur(8px);
                    border: 1px solid ${cat.border};
                    border-radius: 50%;
                    width: ${s}px; height: ${s}px;
                    display: flex; align-items: center; justify-content: center;
                    font-size: ${Math.round(s*0.45)}px;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.4);
                    cursor: pointer;
                ">${cat.emoji}</div>`,
                iconSize: [s, s],
                iconAnchor: [s/2, s/2]
            });

            const marker = L.marker([lat, lon], { icon, zIndexOffset: cat.zIndex });

            marker.bindPopup(`
                <div style="padding:4px; min-width:190px;">
                    <div style="font-size:10px; color:rgba(255,255,255,0.35); margin-bottom:5px; letter-spacing:2px; font-weight:700;">${cat.label.toUpperCase()}</div>
                    <div style="font-size:14px; color:#fff; font-weight:800; margin-bottom:8px; line-height:1.3;">${name}</div>
                    ${brand && brand !== name ? `<div style="font-size:11px; color:rgba(255,255,255,0.4); margin-bottom:4px;">🏷️ ${brand}</div>` : ''}
                    ${address ? `<div style="font-size:11px; color:rgba(255,255,255,0.5); margin-bottom:4px;">📍 ${address}</div>` : ''}
                    ${opening ? `<div style="font-size:11px; color:rgba(255,255,255,0.5); margin-bottom:4px;">🕐 ${opening}</div>` : ''}
                    ${phone ? `<div style="font-size:11px; color:rgba(255,255,255,0.5); margin-bottom:8px;">📞 ${phone}</div>` : ''}
                    <button onclick="map.closePopup(); openCreateMissionModal('${lat}', '${lon}')"
                        style="background:rgba(255,255,255,0.9); color:#000; border:none; padding:10px; border-radius:10px; font-weight:800; font-size:12px; cursor:pointer; width:100%; margin-top:6px;">
                        LANSEAZĂ CONTRACT AICI
                    </button>
                </div>`, { closeButton: false, className: 'dark-popup' });

            venueClusterGroup.addLayer(marker);
            addedCount++;
        });

        console.log(`[VV] ${catKey}: ${addedCount} markere adăugate pe hartă`);
        return addedCount;

    } catch (err) {
        console.error(`[VV] CATCH ${catKey}:`, err.message || err);
        return 0;
    }
}

// Mall-uri fixe hardcodate — Fashion House + toate mall-urile mari
const FIXED_MALLS = [
    { name: 'Fashion House Outlet Militari', lat: 44.4289, lng: 25.9978, emoji: '🛍️' },
    { name: 'Fashion House Pallady', lat: 44.4198, lng: 26.2089, emoji: '🛍️' },
    { name: 'AFI Cotroceni', lat: 44.4311, lng: 26.0542, emoji: '🏬' },
    { name: 'Băneasa Shopping City', lat: 44.5089, lng: 26.0834, emoji: '🏬' },
    { name: 'Mega Mall', lat: 44.4478, lng: 26.1623, emoji: '🏬' },
    { name: 'Sun Plaza', lat: 44.3889, lng: 26.0823, emoji: '🏬' },
    { name: 'Promenada Mall', lat: 44.4734, lng: 26.0912, emoji: '🏬' },
    { name: 'Liberty Center', lat: 44.3978, lng: 26.0234, emoji: '🏬' },
    { name: 'Vitantis Shopping Center', lat: 44.3823, lng: 26.1045, emoji: '🏬' },
    { name: 'Jumbo Militari', lat: 44.4312, lng: 25.9945, emoji: '📦' },
    { name: 'Jumbo Băneasa', lat: 44.5012, lng: 26.0756, emoji: '📦' },
    { name: 'Jumbo Titan', lat: 44.4134, lng: 26.1823, emoji: '📦' },
];

function loadFixedMalls() {
    if (!venueClusterGroup) return;
    FIXED_MALLS.forEach(mall => {
        const icon = L.divIcon({
            className: '',
            html: `<div style="
                background: rgba(120,40,180,0.92);
                backdrop-filter: blur(8px);
                -webkit-backdrop-filter: blur(8px);
                border: 2px solid rgba(180,80,255,0.7);
                border-radius: 50%;
                width: 34px; height: 34px;
                display: flex; align-items: center; justify-content: center;
                font-size: 15px;
                box-shadow: 0 2px 12px rgba(120,40,180,0.4);
                cursor: pointer;
            ">${mall.emoji}</div>`,
            iconSize: [34, 34],
            iconAnchor: [17, 17]
        });

        const marker = L.marker([mall.lat, mall.lng], { icon, zIndexOffset: 700 });
        marker.bindPopup(`
            <div style="padding:4px; min-width:190px;">
                <div style="font-size:10px; color:rgba(180,80,255,0.8); margin-bottom:5px; letter-spacing:2px; font-weight:700;">MALL / OUTLET</div>
                <div style="font-size:14px; color:#fff; font-weight:800; margin-bottom:12px;">${mall.name}</div>
                <button onclick="map.closePopup(); openCreateMissionModal(${mall.lat}, ${mall.lng});"
                    style="background:rgba(255,255,255,0.9); color:#000; border:none; padding:10px; border-radius:10px; font-weight:800; font-size:12px; cursor:pointer; width:100%;">
                    LANSEAZĂ CONTRACT AICI
                </button>
            </div>`, { closeButton: false, className: 'dark-popup' });

        venueClusterGroup.addLayer(marker);
    });
}

// Pornire inițială
async function loadBucharestVenues() {
    loadFixedMalls();
    await applyFilter('all');
}

// Funcție publică pentru pastile
function filterVenues(category) {
    applyFilter(category);
}


// Radar Onyx eliminat — hartă curată

// ================= MISIUNI PE HARTĂ — REAL-TIME PENTRU TOȚI =================
let missionMarkers = {}; // Tinem evidenta markerelor active

function loadMissionsOnMap() {
    if (!map) return;

    const now = new Date();

    // Listener real-time — toti Insiderii vad aceleasi misiuni live
    db.collection('missions')
        .where('status', '==', 'open')
        .onSnapshot(snap => {
            snap.docChanges().forEach(change => {
                const doc = change.doc;
                const m = doc.data();

                if (change.type === 'removed' || change.type === 'modified') {
                    // Stergem marker-ul vechi intotdeauna
                    if (missionMarkers[doc.id]) {
                        try { map.removeLayer(missionMarkers[doc.id]); } catch(e) {}
                        delete missionMarkers[doc.id];
                    }
                }

                // Daca misiunea nu mai e open — nu o mai afisam
                if (m.status !== 'open') return;

                if (change.type === 'added' || change.type === 'modified') {
                    if (!m.lat || !m.lng) return;
                    if (m.status !== 'open') return;

                    // Verificam expiry
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

                    // Logica diferita pentru Creator vs Insider
                    const isMyMission = m.createdBy === (currentUser ? currentUser.uid : null);

                    if (isMyMission) {
                        // CREATOR VIEW — vezi statusul misiunii tale
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
                            // Misiunea e completata — vezi poza
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
                        // INSIDER VIEW — accepta misiunea
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

async function submitPinpointMission() {
    const desc = document.getElementById('mission-desc').value.trim();
    if (!desc) { showToast('Descrie misiunea!'); return; }
    if (!currentUser) { showToast('Nu ești conectat!'); return; }

    const launchBtn = document.getElementById('btn-launch-radar');
    launchBtn.textContent = 'SE VERIFICĂ...';
    launchBtn.style.opacity = '0.6';

    // COOLDOWN: verificam daca are deja o misiune activa
    try {
        const existing = await db.collection('missions')
            .where('createdBy', '==', currentUser.uid)
            .where('status', '==', 'open')
            .limit(1).get();
        
        if (!existing.empty) {
            showToast('⚠️ Ai deja un contract activ!');
            launchBtn.textContent = 'LANSEAZĂ CONTRACTUL';
            launchBtn.style.opacity = '1';
            return;
        }
    } catch(e) { console.log('Cooldown check err:', e); }

    launchBtn.textContent = 'SE LANSEAZĂ...';

    // Calculam expiry: (reward * 1.5) + 5 minute
    const expiryMinutes = Math.round((selectedReward * 1.5) + 5);
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

    // Verificăm dacă userul are destui VV
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
        // NU mai afisam toast — overlayul e suficient
        loadMissionsOnMap();
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

    db.collection('missions').where('status', '==', 'open').orderBy('createdAt', 'desc').limit(20).get()
        .then(snap => {
            if (snap.empty) {
                container.innerHTML = '<div style="color:rgba(255,255,255,0.3); text-align:center; padding:30px; font-size:13px;">Nicio misiune activă momentan.</div>';
                return;
            }

            container.innerHTML = '';
            const now = new Date();
            snap.forEach(doc => {
                const m = doc.data();
                // Sarim misiunile expirate
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

// ================= ANULEAZĂ PROPRIA MISIUNE (cu refund) =================
async function cancelMyMission(missionId, reward) {
    if (!currentUser) return;
    if (!confirm(`Anulezi misiunea și recuperezi ${reward} VV?`)) return;

    try {
        const batch = db.batch();

        // Stergem misiunea
        batch.delete(db.collection('missions').doc(missionId));

        // Refund VV Coins
        batch.update(db.collection('users').doc(currentUser.uid), {
            balance: firebase.firestore.FieldValue.increment(reward)
        });

        await batch.commit();

        // Scoatem markerul de pe harta
        if (missionMarkers[missionId]) {
            map.removeLayer(missionMarkers[missionId]);
            delete missionMarkers[missionId];
        }

        showToast(`✅ Misiune anulată! +${reward} VV recuperați.`);
    } catch(e) {
        showToast('Eroare la anulare: ' + e.message);
    }
}

// ================= VEZI REZULTATUL MISIUNII (Creator View) =================
async function openMissionResult(missionId) {
    try {
        // Cautam poza in inbox trimisa pentru aceasta misiune
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

// ================= ACCEPTĂ MISIUNEA =================
async function acceptMission(missionId) {
    if (!currentUser) { showToast('Nu ești conectat!'); return; }

    // Verificam ca nu e propria misiune
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

// ================= INBOX =================
function openInbox() {
    openModal('inbox-modal');
}

function listenInbox() {
    if (!currentUser) return;

    db.collection('inbox').where('to', '==', currentUser.uid)
        .orderBy('createdAt', 'desc').limit(20)
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
                    <div style="font-size:11px; color:rgba(255,255,255,0.3); margin-bottom:6px; letter-spacing:1px;">INTEL PRIMIT</div>
                    <div style="font-size:13px; color:#fff; margin-bottom:8px;">${msg.message || ''}</div>
                    ${msg.photoUrl ? `<img src="${msg.photoUrl}" style="width:100%; border-radius:10px; margin-bottom:8px;" />` : ''}
                    ${msg.reward ? `
                        <button onclick="approveIntel('${doc.id}', ${msg.reward}, '${msg.from}');"
                            style="background:rgba(255,255,255,0.9); color:#000; border:none; padding:10px; border-radius:10px; font-weight:800; font-size:12px; cursor:pointer; width:100%;">
                            APROBĂ +${msg.reward} VV
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

function approveIntel(inboxId, reward, fromUid) {
    if (!currentUser) return;

    db.collection('users').doc(fromUid).update({
        balance: firebase.firestore.FieldValue.increment(reward)
    }).then(() => {
        db.collection('inbox').doc(inboxId).update({ reward: 0 });
        showToast(`+${reward} VV trimis agentului!`);
    });
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

// ================= CAMERA =================
function openCamera() {
    const cam = document.getElementById('camera-screen');
    cam.style.display = 'flex';
    document.getElementById('post-photo-menu').style.display = 'none';
    document.getElementById('shutter-container').style.display = 'flex';
    capturedImageBlob = null;

    // Capturam GPS pentru watermark
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

// Stocam GPS pentru watermark
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

    // Watermark premium cu GPS
    const gpsStr = capturedGPS
        ? `${capturedGPS.lat.toFixed(5)}, ${capturedGPS.lng.toFixed(5)}`
        : 'GPS N/A';

    // Background watermark
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, canvas.height - 70, canvas.width, 70);

    // Text VV PROOF
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

async function uploadPhotoToCEO() {
    if (!capturedImageBlob) { showToast('Nu ai capturat nicio poză!'); return; }
    if (!currentUser) { showToast('Nu ești conectat!'); return; }

    // VVeye — validare antifraudă dacă modulul e disponibil
    if (typeof VVeye !== 'undefined' && VVeye.validateProof) {
        try {
            const validation = await VVeye.validateProof(
                capturedImageBlob,
                { lat: missionLat, lng: missionLng },
                capturedGPS
            );
            if (!validation.valid) {
                showToast('❌ ' + (validation.reason || 'Dovadă invalidă VVeye'));
                return;
            }
        } catch(e) {
            console.log('[VVeye] Eroare validare:', e.message);
            // Continuam fara validare daca modulul da eroare
        }
    }

    const msg = document.getElementById('photo-msg').value.trim();
    const sendBtn = document.getElementById('send-btn');
    sendBtn.textContent = 'SE TRIMITE...';
    sendBtn.style.opacity = '0.6';

    const fileName = 'proofs/' + currentUser.uid + '_' + Date.now() + '.jpg';
    const ref = storage.ref(fileName);

    ref.put(capturedImageBlob).then(() => ref.getDownloadURL()).then(url => {
        const alias = localStorage.getItem('vv_alias') || 'INSIDER';
        const now = firebase.firestore.FieldValue.serverTimestamp();

        // Scriem in toate colectiile necesare
        const batch = db.batch();

        // 1. inbox CEO — pentru panoul de control
        const inboxCEORef = db.collection('inbox').doc();
        batch.set(inboxCEORef, {
            to: 'CEO',
            from: currentUser.uid,
            alias: alias,
            message: msg || 'Captură trimisă',
            photoUrl: url,
            missionId: currentMissionId || null,
            reward: selectedReward,
            read: false,
            createdAt: now
        });

        // 2. photos — pentru Global Feed CEO
        const photoRef = db.collection('photos').doc();
        batch.set(photoRef, {
            url: url,
            message: msg || 'Captură VV',
            agentId: currentUser.uid,
            alias: alias,
            missionId: currentMissionId || null,
            gpsLat: capturedGPS ? capturedGPS.lat : null,
            gpsLng: capturedGPS ? capturedGPS.lng : null,
            timestamp: Date.now(),
            createdAt: now,
            flagged: false
        });

        // 3. Notificare catre CREATORUL misiunii — vede poza pentru care a platit
        if (currentMissionId) {
            try {
                const missionDoc = await db.collection('missions').doc(currentMissionId).get();
                if (missionDoc.exists) {
                    const missionData = missionDoc.data();
                    const creatorId = missionData.createdBy;

                    if (creatorId && creatorId !== currentUser.uid) {
                        // Trimitem notificare creatorului
                        const inboxCreatorRef = db.collection('inbox').doc();
                        batch.set(inboxCreatorRef, {
                            to: creatorId,
                            from: currentUser.uid,
                            alias: alias,
                            message: msg || `Insider a completat: "${missionData.description}"`,
                            photoUrl: url,
                            missionId: currentMissionId,
                            reward: missionData.reward || selectedReward,
                            read: false,
                            type: 'mission_result',
                            createdAt: now
                        });

                        // Actualizam statusul misiunii la completed
                        batch.update(db.collection('missions').doc(currentMissionId), {
                            status: 'completed',
                            photoUrl: url,
                            solverId: currentUser.uid,
                            solvedAt: now
                        });
                    }
                }
            } catch(e) {
                console.log('[VV] Eroare update misiune:', e);
            }
        }

        return batch.commit();
    }).then(() => {
        showToast('Raport trimis cu succes! ✅');
        sendBtn.textContent = 'TRIMITE RAPORT';
        sendBtn.style.opacity = '1';
        document.getElementById('photo-msg').value = '';
        currentMissionId = null;
        capturedImageBlob = null;
        capturedGPS = null;
        closeCamera();
        // Revenim la harta dupa 1.5s
        setTimeout(() => {
            switchTab('map');
        }, 1500);
    }).catch(err => {
        console.log('Upload err:', err);
        showToast('Eroare upload. Încearcă din nou.');
        sendBtn.textContent = 'TRIMITE RAPORT';
        sendBtn.style.opacity = '1';
    });
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

// ================= CLEAN BETA — sterge zgomotul de test =================
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

        // Curatam markerii fantoma de pe harta
        if (missionMarkers) {
            Object.values(missionMarkers).forEach(m => { try { map.removeLayer(m); } catch(e){} });
            Object.keys(missionMarkers).forEach(k => delete missionMarkers[k]);
        }

        // Curatam cache venues
        Object.keys(localStorage).forEach(k => {
            if (k.startsWith('vv_cache_')) localStorage.removeItem(k);
        });

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

    // Pozitionam bara corect deasupra dock-ului
    const dockHeight = 72;
    const safeArea = parseInt(getComputedStyle(document.documentElement)
        .getPropertyValue('--safe-area-bottom') || '0');
    bar.style.bottom = (dockHeight + 10 + safeArea) + 'px';

    // Aratam overlay centrat
    bar.style.display = 'flex';
    bar.style.opacity = '0';
    setTimeout(() => {
        bar.style.transition = 'opacity 0.3s ease';
        bar.style.opacity = '1';
    }, 50);

    // Setam recompensa
    if (rewardText) rewardText.textContent = reward + ' VV';

    // Secventa de cautare animata
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

    // Numaram Insideri activi REAL — cu fallback psihologic pentru numere mici
    try {
        const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000);
        const snap = await db.collection('users')
            .where('lastActive', '>', fifteenMinAgo)
            .get();

        if (snap.size >= 2) {
            // Aratam numarul real doar daca e relevant
            if (countText) countText.textContent = `${snap.size} Insideri activi în zonă`;
        } else {
            // Sub 2 — suspans, nu dezamagire
            if (countText) countText.textContent = 'Se caută Insideri în rețea...';
            if (searchText) searchText.textContent = 'CONNECTING TO NETWORK...';
        }
    } catch(e) {
        console.log('Eroare count:', e);
        if (countText) countText.textContent = 'Se caută Insideri în rețea...';
    }

    // Ascundem bara dupa 5 secunde
    clearTimeout(insiderSearchTimer);
    insiderSearchTimer = setTimeout(() => {
        hideInsiderSearch();
    }, 6000);
}

function hideInsiderSearch() {
    const bar = document.getElementById('insider-search-bar');
    if (!bar) return;
    bar.style.transition = 'opacity 0.3s ease';
    bar.style.opacity = '0';
    setTimeout(() => { bar.style.display = 'none'; }, 300);
    clearTimeout(insiderSearchTimer);
}
