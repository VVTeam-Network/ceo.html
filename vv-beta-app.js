// ================= FIREBASE CONFIG =================
const firebaseConfig = {
    apiKey: "AIzaSyDGv4kEClO0RHCLvXVLOT-vyPHw6bsxYVc",
    authDomain: "vv-ep-beta.firebaseapp.com",
    projectId: "vv-ep-beta",
    storageBucket: "vv-ep-beta.firebasestorage.app"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();
const storage = firebase.storage();

// ================= VARIABILE GLOBALE =================
let map = null; 
let currentStream = null;
let tempPhotoBlob = null;
let globalAlias = "AGENT VV";
let currentUserBalance = 0;
let currentLat = 44.4325; 
let currentLng = 26.1038;
let activeMissionId = null;
let selectedReward = 15;
let selectedTip = 0;
let pendingApprovalData = null;
let radarActive = false;
let radarLayers = [];
let targetMarker = null;
let targetMissionLat = null;
let targetMissionLng = null;

// ================= LOGICA DE INTRARE (SPLASH -> TUTORIAL) =================
function toggleAcceptButton() {
    const checkbox = document.getElementById('tc-checkbox');
    const btn = document.getElementById('btn-accept');
    if(checkbox.checked) {
        btn.classList.remove('disabled');
        btn.style.background = "#fff";
        btn.style.color = "#000";
    } else {
        btn.classList.add('disabled');
        btn.style.background = "#555";
        btn.style.color = "#888";
    }
}

async function startBootSequence() {
    let keyInput = document.getElementById('access-key').value.trim().toUpperCase();
    if(keyInput.length < 5) return alert("Introdu o cheie validă!");
    if(!document.getElementById('tc-checkbox').checked) return alert("Trebuie să accepți regulamentul intern!");
    
    try {
        const snapshot = await db.collection('access_keys').where('key', '==', keyInput).get();
        if(snapshot.empty) { 
            alert("Cheie invalidă!"); 
        } else {
            localStorage.setItem('vv_agent_key', keyInput);
            document.getElementById('splash-screen').style.display = 'none';
            document.getElementById('alias-screen').style.display = 'flex';
        }
    } catch(e) { alert("Eroare server: " + e.message); }
}

async function confirmAlias() {
    globalAlias = document.getElementById('user-alias-input').value.trim() || "AGENT VV";
    try {
        const cred = await auth.signInAnonymously();
        const userRef = db.collection('users').doc(cred.user.uid);
        const doc = await userRef.get();
        if (!doc.exists) { 
            await userRef.set({ alias: globalAlias, balance: 100, joinedAt: firebase.firestore.FieldValue.serverTimestamp() }); 
        }
        document.getElementById('alias-screen').style.display = 'none';
        document.getElementById('tutorial-screen').style.display = 'flex';
    } catch(e) { alert("Eroare conectare: " + e.message); }
}

function nextTutorial(step) {
    document.querySelectorAll('.tutorial-card').forEach(c => c.classList.remove('active'));
    document.getElementById('tut-' + step).classList.add('active');
}

function finishTutorial() {
    document.getElementById('tutorial-screen').style.display = 'none';
    loadMainApp();
}

function loadMainApp() {
    let app = document.getElementById('app-container'); 
    app.style.display = 'block';
    document.getElementById('main-dock').style.display = 'flex';
    
    setTimeout(() => { 
        app.style.opacity = '1'; 
        initMap(); 
        setTimeout(() => { if(map) map.invalidateSize(); }, 300);
        setTimeout(() => { if(map) map.invalidateSize(); }, 800);
    }, 50);
}

// ================= VERIFICARE SESIUNE =================
auth.onAuthStateChanged(user => {
    if (user && localStorage.getItem('vv_agent_key')) {
        document.getElementById('splash-screen').style.display = 'none';
        document.getElementById('alias-screen').style.display = 'none';
        document.getElementById('tutorial-screen').style.display = 'none';
        loadMainApp();
        
        db.collection('users').doc(user.uid).onSnapshot(snap => {
            if(snap.exists) {
                const data = snap.data();
                globalAlias = data.alias;
                currentUserBalance = data.balance || 0; 
                
                document.getElementById('hud-balance').innerText = currentUserBalance + " VV";
                document.getElementById('profile-main-name').innerText = globalAlias;
                document.getElementById('profile-vv-val').innerText = currentUserBalance;
                document.getElementById('profile-lei-val').innerText = currentUserBalance;
            }
        });

        db.collection('missions').where('creatorId', '==', user.uid).where('status', '==', 'pending_review').onSnapshot(snap => {
            let badge = document.getElementById('inbox-badge');
            if(snap.size > 0) { badge.style.display = 'flex'; badge.innerText = snap.size; } 
            else { badge.style.display = 'none'; }
        });
    }
});

// ================= NAVIGARE ȘI MENIURI =================
function switchTab(tab) {
    document.querySelectorAll('.dock-icon').forEach(i => i.classList.remove('active'));
    document.getElementById('tab-' + tab).classList.add('active');

    if(tab === 'map') {
        document.getElementById('profile-screen').style.display = 'none';
        document.getElementById('map-view').style.display = 'block';
        setTimeout(() => { if(map) map.invalidateSize(); }, 100);
    } else if (tab === 'profile') {
        document.getElementById('map-view').style.display = 'none';
        document.getElementById('profile-screen').style.display = 'flex';
    }
}

function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

function logoutAgent() {
    if(!confirm("Ești sigur că vrei să te deconectezi?")) return;
    auth.signOut().then(() => { localStorage.removeItem('vv_agent_key'); location.reload(); });
}

async function sendFeedback() {
    let msg = document.getElementById('feedback-msg-input').value.trim();
    if(!msg) return alert("Scrie un mesaj!");
    try {
        await db.collection('feedback').add({ agentId: auth.currentUser.uid, alias: globalAlias, message: msg, status: 'unread', timestamp: Date.now() });
        alert("Mesaj trimis către VVTeam!");
        closeModal('feedback-modal');
    } catch(e) { alert("Eroare la trimitere."); }
}

// ================= HARTA ȘI RADARUL =================
let isFirstLocation = true; 
function initMap() {
    if(!map) {
        map = L.map('map', {zoomControl: false}).setView([currentLat, currentLng], 12);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png').addTo(map);
        
        map.locate({setView: false, watch: true, maxZoom: 16, enableHighAccuracy: true});
        
        let userMarker = null;
        map.on('locationfound', function(e) {
            currentLat = e.latlng.lat; currentLng = e.latlng.lng;
            if(isFirstLocation) { map.setView(e.latlng, 15); isFirstLocation = false; }
            if(!userMarker) { 
                userMarker = L.circleMarker(e.latlng, { radius: 7, fillColor: "#fff", color: "rgba(255,255,255,0.25)", weight: 7, opacity: 1, fillOpacity: 1 }).addTo(map);
            } else { userMarker.setLatLng(e.latlng); }
        });

        map.on('click', function(e) {
            targetMissionLat = e.latlng.lat; targetMissionLng = e.latlng.lng;
            if(targetMarker) { map.removeLayer(targetMarker); }
            const crosshairIcon = L.divIcon({ className: 'target-crosshair', html: '<div class="crosshair-center"></div>', iconSize: [40, 40], iconAnchor: [20, 20] });
            targetMarker = L.marker(e.latlng, {icon: crosshairIcon}).addTo(map);
            
            let popupContent = `
                <div style="text-align:center; padding: 5px; min-width: 150px;">
                    <div style="font-size: 10px; color: #0A84FF; margin-bottom: 8px; font-weight: 800;">[ ZONĂ ȚINTĂ ]</div>
                    <button onclick="openModal('create-mission-modal'); map.closePopup();" style="background: #fff; color: #000; border: none; padding: 10px 15px; border-radius: 8px; font-weight: 700; font-size: 11px; cursor: pointer;">🎯 LANSEAZĂ CONTRACT</button>
                </div>`;
            targetMarker.bindPopup(popupContent, {closeButton: false, className: 'dark-popup'}).openPopup();
        });
    }
}

function toggleRadar() {
    radarActive = !radarActive;
    const btn = document.getElementById('btn-radar');
    const banner = document.getElementById('radar-banner');

    if(radarActive) {
        btn.classList.add('active'); banner.style.display = 'block'; activateRadarVisuals();
    } else {
        btn.classList.remove('active'); banner.style.display = 'none'; clearRadarVisuals();
    }
}

function activateRadarVisuals() {
    if(!map) return;
    let hotzone = L.circle([currentLat + 0.004, currentLng + 0.003], { color: '#ff2d55', fillColor: '#ff2d55', fillOpacity: 0.2, radius: 500, className: 'hotzone-pulse', weight: 2 }).addTo(map);
    radarLayers.push(hotzone);
    let agentZone = L.circle([currentLat - 0.002, currentLng - 0.005], { color: '#0A84FF', fillColor: '#0A84FF', fillOpacity: 0.15, radius: 300, weight: 1, dashArray: '5, 5' }).addTo(map);
    radarLayers.push(agentZone);
}

function clearRadarVisuals() {
    radarLayers.forEach(layer => map.removeLayer(layer));
    radarLayers = [];
}

// ================= MISIUNI ȘI CONTRACTE =================
function selectReward(val) {
    selectedReward = val;
    document.querySelectorAll('[id^="rew-btn-"]').forEach(b => b.classList.remove('active'));
    document.getElementById('rew-btn-' + val).classList.add('active');
}

async function submitPinpointMission() {
    let desc = document.getElementById('mission-desc').value.trim();
    if(!desc) return alert("Scrie ce trebuie verificat!");
    if(selectedReward > currentUserBalance) return alert("Fonduri insuficiente! Ai " + currentUserBalance + " VV.");
    
    try {
        const uid = auth.currentUser.uid;
        await db.collection('users').doc(uid).update({ balance: firebase.firestore.FieldValue.increment(-selectedReward) });
        await db.collection('missions').add({
            creatorId: uid, creatorAlias: globalAlias, description: desc,
            reward: selectedReward, lat: targetMissionLat, lng: targetMissionLng, status: 'active', timestamp: Date.now()
        });
        closeModal('create-mission-modal');
        alert(`Misiune plasată la țintă!`);
    } catch(e) { alert("Eroare: " + e.message); }
}

function openMissionsList() {
    openModal('missions-list-modal');
    const container = document.getElementById('missions-container');
    container.innerHTML = "<p style='color:#888; text-align:center;'>Caută contracte...</p>";

    db.collection('missions').where('status', '==', 'active').get().then(snap => {
        if(snap.empty) { container.innerHTML = "<p style='color:#888; text-align:center;'>Nicio misiune activă.</p>"; return; }
        let foundMissions = false; container.innerHTML = "";
        snap.forEach(doc => {
            let m = doc.data();
            if(m.creatorId === auth.currentUser.uid) return; 
            foundMissions = true;
            container.innerHTML += `
                <div class="mission-item-card">
                    <div style="display:flex; justify-content:space-between; margin-bottom:12px;">
                        <span style="color:#D4AF37; font-weight:700;">${m.reward} VV</span>
                        <span style="color:#888; font-size:10px;">${m.creatorAlias}</span>
                    </div>
                    <div style="color:#fff; font-size:13px; margin-bottom:15px;">${m.description}</div>
                    <button onclick="acceptMission('${doc.id}')" style="width:100%; padding:10px; background:#fff; color:#000; font-weight:700; border-radius:8px; border:none; cursor:pointer;">ACCEPTĂ CONTRACTUL</button>
                </div>`;
        });
        if(!foundMissions) container.innerHTML = "<p style='color:#888; text-align:center;'>Nicio misiune momentan.</p>";
    });
}

async function acceptMission(missionId) {
    try {
        const missionRef = db.collection('missions').doc(missionId);
        await db.runTransaction(async (transaction) => {
            const doc = await transaction.get(missionRef);
            if (!doc.exists) throw "Contractul a dispărut!";
            if (doc.data().status !== 'active') throw "Alt agent a luat deja contractul.";
            transaction.update(missionRef, { status: 'accepted', solverId: auth.currentUser.uid });
        });
        activeMissionId = missionId;
        closeModal('missions-list-modal');
        openCamera(); 
    } catch(e) { alert(e); }
}

// ================= INBOX & APROBARE =================
function openInbox() {
    openModal('inbox-modal');
    const container = document.getElementById('inbox-container');
    container.innerHTML = "<p style='color:#888; text-align:center;'>Se încarcă...</p>";

    db.collection('missions').where('creatorId', '==', auth.currentUser.uid).where('status', '==', 'pending_review').get().then(snap => {
        if(snap.empty) { container.innerHTML = "<p style='color:#888; text-align:center;'>Nu ai intel nou.</p>"; return; }
        container.innerHTML = "";
        snap.forEach(doc => {
            let m = doc.data();
            container.innerHTML += `
                <div class="mission-item-card">
                    <div style="font-size:10px; color:#888; margin-bottom:10px;">Cerere: ${m.description}</div>
                    <img src="${m.photoUrl}" style="width:100%; border-radius:10px; margin-bottom:15px; object-fit:cover;">
                    <div style="display:flex; gap:10px;">
                        <button onclick="triggerTipsModal('${doc.id}', '${m.solverId}', ${m.reward}, '${m.photoUrl}')" style="flex:1; padding:10px; background:#fff; color:#000; font-weight:700; border-radius:8px; border:none; cursor:pointer;">CONFIRMĂ</button>
                        <button onclick="reportFakeIntel('${doc.id}', '${m.photoUrl}')" style="flex:1; padding:10px; background:rgba(255,59,48,0.1); color:#ff3b30; border:1px solid rgba(255,59,48,0.3); font-weight:700; border-radius:8px; cursor:pointer;">REPORT</button>
                    </div>
                </div>`;
        });
    });
}

function triggerTipsModal(missionId, solverId, reward, photoUrl) {
    pendingApprovalData = { missionId, solverId, reward, photoUrl };
    closeModal('inbox-modal');
    setTimeout(() => { openModal('tips-modal'); }, 300); 
}

function selectTip(val) {
    selectedTip = val;
    document.querySelectorAll('[id^="tip-btn-"]').forEach(b => b.classList.remove('active'));
    if(document.getElementById('tip-btn-' + val)) document.getElementById('tip-btn-' + val).classList.add('active');
    document.getElementById('custom-tip').value = '';
}

async function finalizeApprovalWithTips() {
    if(!pendingApprovalData) return;
    let customVal = parseInt(document.getElementById('custom-tip').value);
    if(!isNaN(customVal) && customVal > 0) selectedTip = customVal;

    if(selectedTip > currentUserBalance) return alert("Fonduri insuficiente pentru Tips!");
    let { missionId, solverId, reward, photoUrl } = pendingApprovalData;
    
    try {
        await db.collection('missions').doc(missionId).update({ status: 'completed' });
        if (selectedTip > 0) { await db.collection('users').doc(auth.currentUser.uid).update({ balance: firebase.firestore.FieldValue.increment(-selectedTip) }); }
        
        let totalPayout = reward + selectedTip;
        await db.collection('users').doc(solverId).update({ balance: firebase.firestore.FieldValue.increment(totalPayout) });
        await db.collection('photos').add({ url: photoUrl, agentId: auth.currentUser.uid, message: `[CONTRACT FINALIZAT] Bază: ${reward} | Tips: ${selectedTip}`, flagged: false, timestamp: Date.now() });
        
        alert(`Plată trimisă! Total: ${totalPayout} VV Coins au fost livrați.`);
        closeModal('tips-modal'); pendingApprovalData = null; openInbox();
    } catch(e) { alert("Eroare tranzacție."); }
}

async function reportFakeIntel(missionId, photoUrl) {
    if(!confirm("Trimiți spre investigație VVTeam?")) return;
    try {
        await db.collection('missions').doc(missionId).update({ status: 'disputed' });
        await db.collection('photos').add({ url: photoUrl, agentId: auth.currentUser.uid, message: "[ALARMĂ FRAUDĂ] Verifică poza!", flagged: true, timestamp: Date.now() });
        alert("Raportat cu succes. Escrow-ul este în hold.");
        closeModal('inbox-modal');
    } catch(e) { alert("Eroare raport."); }
}

// ================= CAMERA VV PROOF =================
async function openCamera() {
    document.getElementById('camera-screen').style.display = 'flex';
    try {
        const constraints = { video: { facingMode: "environment" }, audio: false };
        currentStream = await navigator.mediaDevices.getUserMedia(constraints);
        document.getElementById('real-camera-video').srcObject = currentStream;
    } catch (err) { alert("Eroare cameră: " + err.message); }
}

function closeCamera() {
    document.getElementById('camera-screen').style.display = 'none';
    document.getElementById('shutter-container').style.display = 'flex';
    document.getElementById('post-photo-menu').style.display = 'none';
    if (currentStream) { currentStream.getTracks().forEach(track => track.stop()); currentStream = null; }
}

function takePicture() {
    const video = document.getElementById('real-camera-video');
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)"; ctx.font = "bold 30px sans-serif";
    ctx.fillText("VV PROOF | " + new Date().toLocaleTimeString(), 30, 50); 
    
    video.pause(); 
    canvas.toBlob((blob) => { tempPhotoBlob = blob; }, 'image/jpeg', 0.6);
    
    document.getElementById('shutter-container').style.display = 'none';
    document.getElementById('post-photo-menu').style.display = 'block';
}

function retakePhoto() { 
    document.getElementById('real-camera-video').play(); 
    document.getElementById('shutter-container').style.display = 'flex';
    document.getElementById('post-photo-menu').style.display = 'none';
}

async function uploadPhotoToCEO() {
    if(!tempPhotoBlob) return;
    let msg = document.getElementById('photo-msg').value.trim();
    const uid = auth.currentUser.uid;
    document.getElementById('send-btn').innerText = "SE TRIMITE...";
    
    try {
        const timestamp = Date.now();
        const photoRef = storage.ref(`missions_beta/${uid}/${timestamp}.jpg`);
        await photoRef.put(tempPhotoBlob);
        const url = await photoRef.getDownloadURL();
        
        if (activeMissionId) {
            await db.collection('missions').doc(activeMissionId).update({ status: 'pending_review', photoUrl: url, solverId: uid });
            alert("Raport trimis clientului!"); activeMissionId = null;
        } else {
            await db.collection('photos').add({ url: url, agentId: uid, message: msg, flagged: false, timestamp: timestamp });
            alert("Raport VV trimis la Global Feed!");
        }
        closeCamera(); document.getElementById('send-btn').innerText = "TRIMITE RAPORT";
    } catch(e) { alert("Eroare la trimitere."); closeCamera(); document.getElementById('send-btn').innerText = "TRIMITE RAPORT"; }
}
