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
let radarActive = false;
let radarLayers = [];
let targetMarker = null;
let currentUser = null;
let currentMissionId = null;
let selectedReward = 15;
let selectedTip = 0;
let capturedImageBlob = null;

// ================= BOOT =================
window.onload = () => {
    // FIX iOS swipe back — previne gestul de back in Safari
    document.addEventListener('touchstart', function(e) {
        if (e.touches[0].clientX < 20 || e.touches[0].clientX > window.innerWidth - 20) {
            e.preventDefault();
        }
    }, { passive: false });

    // Previne scroll accidental pe body
    document.body.addEventListener('touchmove', function(e) {
        if (e.target === document.body || e.target === document.documentElement) {
            e.preventDefault();
        }
    }, { passive: false });

    const tutorialDone = localStorage.getItem('vv_premium_tutorial_done');
    const accessKey = localStorage.getItem('vv_access_key');
    
    if (tutorialDone === 'DA' && accessKey) {
        document.getElementById('splash-screen').style.display = 'none';
        document.getElementById('tutorial-screen').style.display = 'none';
        showApp();
        silentLogin();
    } else {
        document.getElementById('splash-screen').style.display = 'flex';
    }
};

// ================= TOGGLE ACCEPT BUTTON =================
function toggleAcceptButton() {
    const cb = document.getElementById('tc-checkbox');
    const btn = document.getElementById('btn-accept');
    if (cb.checked) {
        btn.classList.remove('disabled');
    } else {
        btn.classList.add('disabled');
    }
}

// ================= BOOT SEQUENCE (după Accept) =================
function startBootSequence() {
    const key = document.getElementById('access-key').value.trim();
    if (!key) {
        showToast('Introdu cheia de acces!');
        return;
    }

    const btn = document.getElementById('btn-accept');
    btn.textContent = 'Se verifică...';
    btn.classList.add('disabled');

    // Verificăm cheia în Firestore colecția 'access_keys'
    db.collection('access_keys').where('key', '==', key).where('active', '==', true).get()
        .then(snap => {
            if (snap.empty) {
                showToast('Cheie invalidă sau expirată.');
                btn.textContent = 'Accept și Decriptez';
                btn.classList.remove('disabled');
                return;
            }

            // Cheie validă → salvăm în localStorage
            localStorage.setItem('vv_access_key', key);

            // Trecem la alias screen
            document.getElementById('splash-screen').style.display = 'none';
            document.getElementById('alias-screen').style.display = 'flex';
        })
        .catch(err => {
            console.log('Eroare verificare cheie:', err);
            showToast('Eroare de conexiune. Încearcă din nou.');
            btn.textContent = 'Accept și Decriptez';
            btn.classList.remove('disabled');
        });
}

// ================= CONFIRMARE ALIAS =================
function confirmAlias() {
    const alias = document.getElementById('user-alias-input').value.trim();
    if (!alias || alias.length < 2) {
        showToast('Introdu un nume de cod valid!');
        return;
    }

    localStorage.setItem('vv_alias', alias);

    // Creem contul anonim în Firebase
    auth.signInAnonymously().then(cred => {
        currentUser = cred.user;
        return db.collection('users').doc(cred.user.uid).set({
            alias: alias,
            balance: 100,
            rating: 5,
            joinedAt: firebase.firestore.FieldValue.serverTimestamp(),
            accessKey: localStorage.getItem('vv_access_key')
        });
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
function silentLogin() {
    auth.signInAnonymously().then(cred => {
        currentUser = cred.user;
        loadUserData();
    }).catch(err => console.log('Silent login err:', err));
}

// ================= LOAD USER DATA =================
function loadUserData() {
    const alias = localStorage.getItem('vv_alias') || 'INSIDER';
    document.getElementById('profile-main-name').textContent = alias;

    if (!currentUser) return;

    db.collection('users').doc(currentUser.uid).onSnapshot(doc => {
        if (doc.exists) {
            const data = doc.data();
            const balance = data.balance || 0;
            const lei = (balance * 0.5).toFixed(2);

            document.getElementById('hud-balance').textContent = balance + ' VV';
            document.getElementById('profile-vv-val').textContent = balance;
            document.getElementById('profile-lei-val').textContent = lei;
            document.getElementById('profile-main-name').textContent = data.alias || alias;

            // Update progress bar Onyx
            updateOnyxProgress(balance);
        }
    });

    // Ascultăm inbox-ul
    listenInbox();
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
        maxZoom: 19
    }).addTo(map);

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

            const name = el.tags?.name || el.tags?.['name:ro'] || el.tags?.brand || cat.label;
            const address = el.tags?.['addr:street']
                ? `${el.tags['addr:street']}${el.tags['addr:housenumber'] ? ' ' + el.tags['addr:housenumber'] : ''}`
                : '';
            const phone = el.tags?.phone || el.tags?.['contact:phone'] || '';
            const opening = el.tags?.opening_hours || '';
            const brand = el.tags?.brand || '';

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

// Pornire inițială
async function loadBucharestVenues() {
    await applyFilter('all');
}

// Funcție publică pentru pastile
function filterVenues(category) {
    applyFilter(category);
}


// ================= RADAR =================
function toggleRadar() {
    radarActive = !radarActive;
    const btn = document.getElementById('btn-radar');
    const banner = document.getElementById('radar-banner');

    if (radarActive) {
        btn.style.color = '#fff';
        btn.style.borderColor = 'rgba(255,255,255,0.4)';
        btn.style.background = 'rgba(255,255,255,0.15)';
        banner.style.display = 'block';
        loadMissionsOnMap();
        showToast('Radar Onyx Activat');
    } else {
        btn.style.color = '';
        btn.style.borderColor = '';
        btn.style.background = '';
        banner.style.display = 'none';
        radarLayers.forEach(l => map.removeLayer(l));
        radarLayers = [];
        showToast('Radar Oprit');
    }
}

// ================= MISIUNI PE HARTĂ =================
function loadMissionsOnMap() {
    if (!map) return;

    db.collection('missions').where('status', '==', 'open').get().then(snap => {
        snap.forEach(doc => {
            const m = doc.data();
            if (!m.lat || !m.lng) return;

            const icon = L.divIcon({
                className: '',
                html: `<div style="
                    background: rgba(255,255,255,0.1);
                    backdrop-filter: blur(10px);
                    border: 1px solid rgba(255,255,255,0.25);
                    border-radius: 50%;
                    width: 36px; height: 36px;
                    display: flex; align-items: center; justify-content: center;
                    font-size: 14px; color: #fff;
                    box-shadow: 0 0 15px rgba(255,255,255,0.1);
                ">📍</div>`,
                iconSize: [36, 36],
                iconAnchor: [18, 18]
            });

            const marker = L.marker([m.lat, m.lng], { icon }).addTo(map);

            marker.bindPopup(`
                <div style="padding:4px; min-width:180px;">
                    <div style="font-size:11px; color:rgba(255,255,255,0.5); margin-bottom:6px; letter-spacing:1px;">CONTRACT ACTIV</div>
                    <div style="font-size:13px; color:#fff; font-weight:700; margin-bottom:10px;">${m.description || 'Misiune'}</div>
                    <div style="font-size:12px; color:rgba(255,255,255,0.6); margin-bottom:12px;">Recompensă: <strong style="color:#fff;">${m.reward} VV</strong></div>
                    <button onclick="map.closePopup(); acceptMission('${doc.id}');"
                        style="background:rgba(255,255,255,0.9); color:#000; border:none; padding:10px; border-radius:10px; font-weight:800; font-size:12px; cursor:pointer; width:100%;">
                        ACCEPTĂ MISIUNEA
                    </button>
                </div>`, { closeButton: false, className: 'dark-popup' });

            radarLayers.push(marker);
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

function submitPinpointMission() {
    const desc = document.getElementById('mission-desc').value.trim();
    if (!desc) { showToast('Descrie misiunea!'); return; }
    if (!currentUser) { showToast('Nu ești conectat!'); return; }

    const launchBtn = document.getElementById('btn-launch-radar');
    launchBtn.textContent = 'SE LANSEAZĂ...';
    launchBtn.style.opacity = '0.6';

    // Verificăm dacă userul are destui VV
    db.collection('users').doc(currentUser.uid).get().then(doc => {
        const balance = doc.data()?.balance || 0;
        if (balance < selectedReward) {
            showToast('VV insuficienți!');
            launchBtn.textContent = 'LANSEAZĂ CONTRACTUL';
            launchBtn.style.opacity = '1';
            return;
        }

        // Scădem VV și creăm misiunea
        const batch = db.batch();

        const missionRef = db.collection('missions').doc();
        batch.set(missionRef, {
            description: desc,
            reward: selectedReward,
            lat: missionLat || 44.4325,
            lng: missionLng || 26.1038,
            createdBy: currentUser.uid,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
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
        showToast('Contract lansat! 🎯');
        loadMissionsOnMap();
        // Aratam bara de cautare Insider
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
            snap.forEach(doc => {
                const m = doc.data();
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
        uid: currentUser?.uid || 'anonim',
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

function takePicture() {
    const video = document.getElementById('real-camera-video');
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);

    // Watermark VV PROOF
    const now = new Date();
    const timeStr = now.toLocaleString('ro-RO');
    ctx.font = 'bold 18px -apple-system';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 6;
    ctx.fillText('VV PROOF · ' + timeStr, 14, canvas.height - 14);

    canvas.toBlob(blob => {
        capturedImageBlob = blob;
        // Preview
        const url = URL.createObjectURL(blob);
        document.getElementById('real-camera-video').style.display = 'none';
        const preview = document.createElement('img');
        preview.src = url;
        preview.style.cssText = 'width:100%; height:100%; object-fit:cover;';
        preview.id = 'preview-img';
        document.querySelector('.cam-viewfinder').appendChild(preview);
    }, 'image/jpeg', 0.88);

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

function uploadPhotoToCEO() {
    if (!capturedImageBlob) { showToast('Nu ai capturat nicio poză!'); return; }
    if (!currentUser) { showToast('Nu ești conectat!'); return; }

    const msg = document.getElementById('photo-msg').value.trim();
    const sendBtn = document.getElementById('send-btn');
    sendBtn.textContent = 'SE TRIMITE...';
    sendBtn.style.opacity = '0.6';

    const fileName = 'proofs/' + currentUser.uid + '_' + Date.now() + '.jpg';
    const ref = storage.ref(fileName);

    ref.put(capturedImageBlob).then(() => ref.getDownloadURL()).then(url => {
        return db.collection('inbox').add({
            to: 'CEO',
            from: currentUser.uid,
            alias: localStorage.getItem('vv_alias') || 'INSIDER',
            message: msg || 'Raport trimis',
            photoUrl: url,
            missionId: currentMissionId || null,
            reward: selectedReward,
            read: false,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    }).then(() => {
        showToast('Raport trimis cu succes! ✅');
        sendBtn.textContent = 'TRIMITE RAPORT';
        sendBtn.style.opacity = '1';
        document.getElementById('photo-msg').value = '';
        currentMissionId = null;
        closeCamera();
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

    // Aratam bara
    bar.style.display = 'block';
    bar.style.opacity = '0';
    bar.style.transform = 'translateY(10px)';
    setTimeout(() => {
        bar.style.transition = 'all 0.4s cubic-bezier(0.16,1,0.3,1)';
        bar.style.opacity = '1';
        bar.style.transform = 'translateY(0)';
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

    // Numaram Insideri activi din Firebase (online in ultimele 5 min)
    try {
        const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
        const snap = await db.collection('users')
            .where('lastSeen', '>', fiveMinAgo)
            .get();
        const activeCount = snap.size || Math.floor(Math.random() * 8) + 2;
        if (countText) countText.textContent = `${activeCount} Insideri activi în zonă`;
    } catch(e) {
        // Fallback cu numar random credibil
        const activeCount = Math.floor(Math.random() * 8) + 2;
        if (countText) countText.textContent = `${activeCount} Insideri activi în zonă`;
    }

    // Ascundem bara dupa 5 secunde
    clearTimeout(insiderSearchTimer);
    insiderSearchTimer = setTimeout(() => {
        hideInsiderSearch();
    }, 5000);
}

function hideInsiderSearch() {
    const bar = document.getElementById('insider-search-bar');
    if (!bar) return;
    bar.style.transition = 'all 0.3s ease';
    bar.style.opacity = '0';
    bar.style.transform = 'translateY(10px)';
    setTimeout(() => { bar.style.display = 'none'; }, 300);
}
