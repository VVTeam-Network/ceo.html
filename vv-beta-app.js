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
    const done = localStorage.getItem('vv_premium_tutorial_done');
    if (done === 'DA') {
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
    const alias = localStorage.getItem('vv_alias') || 'AGENT';
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
        }
    });

    // Ascultăm inbox-ul
    listenInbox();
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

    // Click pe hartă → lansează contract
    map.on('click', e => {
        if (targetMarker) map.removeLayer(targetMarker);

        const crosshairIcon = L.divIcon({
            className: 'target-crosshair',
            html: '<div class="crosshair-center"></div>',
            iconSize: [40, 40],
            iconAnchor: [20, 20]
        });

        targetMarker = L.marker(e.latlng, { icon: crosshairIcon }).addTo(map);

        const popupContent = `
            <div style="text-align:center; padding:4px; min-width:150px;">
                <div style="font-size:10px; color:rgba(255,255,255,0.4); margin-bottom:10px; font-weight:700; letter-spacing:2px;">ZONĂ ȚINTĂ</div>
                <button onclick="map.closePopup(); openCreateMissionModal(${e.latlng.lat}, ${e.latlng.lng});"
                    style="background:rgba(255,255,255,0.92); color:#000; border:none; padding:11px 16px; border-radius:10px; font-weight:800; font-size:12px; cursor:pointer; width:100%; letter-spacing:0.5px;">
                    LANSEAZĂ CONTRACT
                </button>
            </div>`;

        targetMarker.bindPopup(popupContent, {
            closeButton: false,
            className: 'dark-popup'
        }).openPopup();
    });

    // Încărcăm misiunile existente pe hartă
    loadMissionsOnMap();

    setTimeout(() => { if (map) map.invalidateSize(); }, 400);
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
function acceptMission(missionId) {
    if (!currentUser) { showToast('Nu ești conectat!'); return; }
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
        alias: localStorage.getItem('vv_alias') || 'AGENT',
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
            alias: localStorage.getItem('vv_alias') || 'AGENT',
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
