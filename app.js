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

let map = null; 
let currentStream = null;
let tempPhotoBlob = null;

let globalAlias = "AGENT VV";
let currentUserBalance = 0;
let isInitialLoad = true;
let currentLat = 44.4325; 
let currentLng = 26.1038;
let activeMissionId = null;

let selectedReward = 15;
let selectedTip = 0;
let pendingApprovalData = null;

let radarActive = false;
let radarLayers = [];
let proofMarker = null; 

// VARIABILE NOI PENTRU PINPOINT (TAP TO DROP)
let targetMarker = null;
let targetMissionLat = null;
let targetMissionLng = null;

auth.onAuthStateChanged(user => {
    if (user && localStorage.getItem('vv_agent_key') && isInitialLoad) {
        document.getElementById('splash-screen').style.display = 'none';
        document.getElementById('alias-screen').style.display = 'none';
        let app = document.getElementById('app-container'); 
        app.style.display = 'block';
        document.getElementById('main-dock').style.display = 'flex';
        
        setTimeout(() => { 
            app.style.opacity = '1'; 
            initMap(); 
            setTimeout(() => { if(map) map.invalidateSize(); }, 300);
            setTimeout(() => { if(map) map.invalidateSize(); }, 800);
        }, 50);
        
        db.collection('users').doc(user.uid).onSnapshot(snap => {
            if(snap.exists) {
                const data = snap.data();
                globalAlias = data.alias;
                currentUserBalance = data.balance; 
                
                document.getElementById('hud-balance').innerText = data.balance + " VV";
                document.getElementById('profile-main-name').innerText = data.alias;
                document.getElementById('profile-vv-val').innerText = data.balance;
                document.getElementById('profile-lei-val').innerText = data.balance;
            }
        });

        db.collection('missions')
            .where('creatorId', '==', user.uid)
            .where('status', '==', 'pending_review')
            .onSnapshot(snap => {
                let badge = document.getElementById('inbox-badge');
                if(snap.size > 0) {
                    badge.style.display = 'flex';
                    badge.innerText = snap.size;
                } else {
                    badge.style.display = 'none';
                }
            });
    }
    isInitialLoad = false;
});

function switchTab(tab) {
    document.querySelectorAll('.dock-icon').forEach(i => i.classList.remove('active'));
    document.getElementById('tab-' + tab).classList.add('active');

    if(tab === 'map') {
        document.getElementById('profile-screen').style.opacity = '0';
        document.getElementById('map-view').style.opacity = '1';
        
        setTimeout(() => { 
            document.getElementById('profile-screen').style.display = 'none'; 
            let actionHub = document.getElementById('action-hub');
            actionHub.style.display = 'flex';
            actionHub.style.pointerEvents = 'auto';
            setTimeout(() => { actionHub.style.opacity = '1'; }, 50);
            if(map) map.invalidateSize();
        }, 400);
    } else if (tab === 'profile') {
        let actionHub = document.getElementById('action-hub');
        actionHub.style.opacity = '0';
        actionHub.style.pointerEvents = 'none';
        document.getElementById('map-view').style.opacity = '0';
        
        setTimeout(() => {
            actionHub.style.display = 'none'; 
            document.getElementById('profile-screen').style.display = 'flex';
            setTimeout(() => { document.getElementById('profile-screen').style.opacity = '1'; }, 50);
        }, 400);
    }
}

function toggleRadar() {
    radarActive = !radarActive;
    const btn = document.getElementById('btn-radar');
    const banner = document.getElementById('radar-banner');

    if(radarActive) {
        btn.classList.add('active');
        banner.style.display = 'block';
        activateRadarVisuals();
    } else {
        btn.classList.remove('active');
        banner.style.display = 'none';
        clearRadarVisuals();
    }
}

function activateRadarVisuals() {
    if(!map) return;
    let hotzone = L.circle([currentLat + 0.004, currentLng + 0.003], {
        color: '#ff2d55', fillColor: '#ff2d55', fillOpacity: 0.2, radius: 500, className: 'hotzone-pulse', weight: 2
    }).addTo(map);
    radarLayers.push(hotzone);

    let agentZone = L.circle([currentLat - 0.002, currentLng - 0.005], {
        color: '#0A84FF', fillColor: '#0A84FF', fillOpacity: 0.15, radius: 300, weight: 1, dashArray: '5, 5'
    }).addTo(map);
    radarLayers.push(agentZone);
}

function clearRadarVisuals() {
    radarLayers.forEach(layer => map.removeLayer(layer));
    radarLayers = [];
    if(proofMarker) { map.removeLayer(proofMarker); proofMarker = null; }
}

function openFeedbackModal() {
    document.getElementById('feedback-msg-input').value = '';
    openModal('feedback-modal');
}

async function sendFeedback() {
    let msg = document.getElementById('feedback-msg-input').value.trim();
    if(!msg) return alert("Scrie un mesaj înainte să trimiți!");

    let btn = document.getElementById('btn-send-feedback');
    btn.innerText = "SE TRIMITE...";
    btn.style.pointerEvents = "none";

    try {
        await db.collection('feedback').add({ agentId: auth.currentUser.uid, alias: globalAlias, message: msg, status: 'unread', timestamp: Date.now() });
        alert("Mesaj trimis cu succes către VVTeam!");
        closeModal('feedback-modal');
    } catch(e) { alert("Eroare la trimitere: " + e.message); } finally {
        btn.innerText = "TRIMITE MESAJUL"; btn.style.pointerEvents = "auto";
    }
}

function openSettings() { openModal('settings-modal'); }

function logoutAgent() {
    if(!confirm("Ești sigur că vrei să te deconectezi?")) return;
    auth.signOut().then(() => { localStorage.removeItem('vv_agent_key'); location.reload(); }).catch(err => alert("Eroare la deconectare."));
}

function selectReward(val) {
    selectedReward = val;
    document.querySelectorAll('[id^="rew-btn-"]').forEach(b => b.classList.remove('active'));
    document.getElementById('rew-btn-' + val).classList.add('active');
}

window.openTargetMissionModal = function() {
    if(targetMarker) { map.removeLayer(targetMarker); targetMarker = null; }
    openModal('create-mission-modal');
}

async function submitPinpointMission() {
    let desc = document.getElementById('mission-desc').value.trim();
    if(!desc) return alert("Scrie ce trebuie verificat!");
    if(selectedReward > currentUserBalance) return alert("Fonduri insuficiente! Ai " + currentUserBalance + " VV.");
    if(!targetMissionLat || !targetMissionLng) return alert("Eroare locație țintă.");

    let btnLaunch = document.getElementById('btn-launch-radar');
    let btnCancel = document.getElementById('btn-cancel-radar');
    
    btnLaunch.innerHTML = "SCANARE PERIMETRU... <div class='uber-loader' style='display:block;'><div class='uber-loader-bar'></div></div>";
    btnLaunch.style.background = "rgba(255,255,255,0.05)";
    btnLaunch.style.color = "#fff"; btnLaunch.style.pointerEvents = "none";
    btnCancel.style.display = "none";

    setTimeout(async () => {
        try {
            const uid = auth.currentUser.uid;
            await db.collection('users').doc(uid).update({ balance: firebase.firestore.FieldValue.increment(-selectedReward) });
            await db.collection('missions').add({
                creatorId: uid, creatorAlias: globalAlias, description: desc,
                reward: selectedReward, lat: targetMissionLat, lng: targetMissionLng, status: 'active', timestamp: Date.now()
            });
            
            resetRadarUI(); closeModal('create-mission-modal');
            alert(`Misiune plasată exact la țintă! Cine acceptă va lua cei ${selectedReward} VV.`);
        } catch(e) { alert("Eroare: " + e.message); resetRadarUI(); }
    }, 2000);
}

function resetRadarUI() {
    let btnLaunch = document.getElementById('btn-launch-radar');
    let btnCancel = document.getElementById('btn-cancel-radar');
    btnLaunch.innerHTML = "LANSEAZĂ CONTRACTUL";
    btnLaunch.style.background = "#fff"; btnLaunch.style.color = "#000";
    btnLaunch.style.pointerEvents = "auto"; btnCancel.style.display = "block";
    document.getElementById('mission-desc').value = '';
}

function openMissionsList() {
    openModal('missions-list-modal');
    const container = document.getElementById('missions-container');
    container.innerHTML = "<p style='color:var(--text-muted); text-align:center; font-size:12px; padding-top:20px;'>Caută contracte...</p>";

    db.collection('missions').where('status', '==', 'active').get().then(snap => {
        if(snap.empty) { container.innerHTML = "<p style='color:var(--text-muted); text-align:center; font-size:12px; padding-top:20px;'>Nicio misiune activă.</p>"; return; }
        let foundMissions = false; container.innerHTML = "";
        snap.forEach(doc => {
            let m = doc.data();
            if(m.creatorId === auth.currentUser.uid) return; 
            foundMissions = true;
            container.innerHTML += `
                <div class="mission-item-card">
                    <div style="display:flex; justify-content:space-between; margin-bottom:12px; align-items: center;">
                        <span style="color:#fff; font-weight:700; font-size:16px;">${m.reward} VV</span>
                        <span style="color:var(--text-muted); font-size:10px; text-transform:uppercase; letter-spacing:1.5px; font-weight:600;">${m.creatorAlias}</span>
                    </div>
                    <div style="color:rgba(255,255,255,0.85); font-size:13px; margin-bottom:20px; line-height:1.5; font-weight:400;">${m.description}</div>
                    <button onclick="acceptMission('${doc.id}')" style="width:100%; padding:15px; background:#fff; color:#000; font-weight:700; font-size:11px; letter-spacing:1.5px; border:none; border-radius:12px; cursor:pointer; text-transform:uppercase;">ACCEPTĂ CONTRACTUL</button>
                </div>
            `;
        });
        if(!foundMissions) container.innerHTML = "<p style='color:var(--text-muted); text-align:center; font-size:12px; padding-top:20px;'>Nicio misiune momentan.</p>";
    });
}

async function acceptMission(missionId) {
    try {
        await db.collection('missions').doc(missionId).update({ status: 'accepted', solverId: auth.currentUser.uid });
        activeMissionId = missionId;
        closeModal('missions-list-modal');
        document.getElementById('camera-status-text').innerText = `AUTENTIFICARE LOCAȚIE`;
        document.getElementById('camera-status-text').style.color = "var(--gold)";
        openCamera(); 
    } catch(e) { alert("Eroare la acceptare."); }
}

function openInbox() {
    openModal('inbox-modal');
    const container = document.getElementById('inbox-container');
    container.innerHTML = "<p style='color:var(--text-muted); text-align:center; font-size:12px; padding-top:20px;'>Se încarcă intel...</p>";

    db.collection('missions')
        .where('creatorId', '==', auth.currentUser.uid)
        .where('status', '==', 'pending_review')
        .get().then(snap => {
            if(snap.empty) { container.innerHTML = "<p style='color:var(--text-muted); text-align:center; font-size:12px; padding-top:20px;'>Nu ai intel nou.</p>"; return; }
            container.innerHTML = "";
            snap.forEach(doc => {
                let m = doc.data();
                let targetLat = m.solverLat || m.lat;
                let targetLng = m.solverLng || m.lng;

                container.innerHTML += `
                    <div class="mission-item-card" style="padding:18px;">
                        <div style="font-size:10px; color:var(--text-muted); text-transform:uppercase; letter-spacing:1.5px; margin-bottom:12px; font-weight:600;">Cerere: ${m.description}</div>
                        <img src="${m.photoUrl}" style="width:100%; border-radius:14px; margin-bottom:18px; border:1px solid rgba(255,255,255,0.05); box-shadow: 0 5px 15px rgba(0,0,0,0.3);">
                        
                        <button onclick="viewPhotoLocation(${targetLat}, ${targetLng})" style="width:100%; padding:12px; background:rgba(10, 132, 255, 0.1); color:var(--vv-blue); border:1px solid rgba(10, 132, 255, 0.3); font-weight:800; font-size:11px; letter-spacing:1px; border-radius:12px; cursor:pointer; text-transform:uppercase; margin-bottom: 12px; transition: 0.3s;"><i class="fas fa-map-marker-alt"></i> VERIFICĂ LOCAȚIA GPS</button>
                        
                        <div style="display:flex; gap:12px;">
                            <button onclick="triggerTipsModal('${doc.id}', '${m.solverId}', ${m.reward}, '${m.photoUrl}')" style="flex:1; padding:15px; background:#fff; color:#000; font-weight:700; font-size:11px; letter-spacing:1px; border:none; border-radius:12px; cursor:pointer; text-transform:uppercase;">CONFIRMĂ</button>
                            <button onclick="reportFakeIntel('${doc.id}', '${m.photoUrl}')" style="flex:1; padding:15px; background:rgba(255,59,48,0.08); color:var(--danger); border:1px solid rgba(255,59,48,0.2); font-weight:700; font-size:11px; letter-spacing:1px; border-radius:12px; cursor:pointer; text-transform:uppercase;">REPORT</button>
                        </div>
                    </div>
                `;
            });
        });
}

function viewPhotoLocation(lat, lng) {
    if(!lat || !lng) return alert("Eroare: Locația GPS nu a putut fi extrasă.");
    closeModal('inbox-modal');
    
    map.flyTo([lat, lng], 17, { animate: true, duration: 1.5 });
    
    if(proofMarker) map.removeLayer(proofMarker);
    
    proofMarker = L.circleMarker([lat, lng], {
        radius: 10, fillColor: "#0A84FF", color: "#fff", weight: 3, opacity: 1, fillOpacity: 0.8, className: 'hotzone-pulse'
    }).addTo(map);

    proofMarker.bindPopup("<div style='text-align:center;'><b style='color:#000; font-size:12px;'>LOCAȚIE VALIDATĂ</b><br><span style='color:#555; font-size:10px;'>Amprentă GPS confirmată.</span></div>").openPopup();
}

function triggerTipsModal(missionId, solverId, reward, photoUrl) {
    pendingApprovalData = { missionId, solverId, reward, photoUrl };
    closeModal('inbox-modal');
    setTimeout(() => { selectTip(0); openModal('tips-modal'); }, 400); 
}

function selectTip(val) {
    selectedTip = val;
    document.querySelectorAll('[id^="tip-btn-"]').forEach(b => b.classList.remove('active'));
    if(document.getElementById('tip-btn-' + val)) document.getElementById('tip-btn-' + val).classList.add('active');
    document.getElementById('custom-tip').value = '';
}

function customTipInput() {
    document.querySelectorAll('[id^="tip-btn-"]').forEach(b => b.classList.remove('active'));
    let val = parseInt(document.getElementById('custom-tip').value);
    selectedTip = isNaN(val) ? 0 : val;
}

async function finalizeApprovalWithTips() {
    if(!pendingApprovalData) return;
    if(selectedTip > currentUserBalance) return alert("Nu ai suficienți VV Coins pentru a lăsa acest Tips! :)");

    let { missionId, solverId, reward, photoUrl } = pendingApprovalData;
    
    try {
        await db.collection('missions').doc(missionId).update({ status: 'completed' });
        if (selectedTip > 0) { await db.collection('users').doc(auth.currentUser.uid).update({ balance: firebase.firestore.FieldValue.increment(-selectedTip) }); }
        
        let totalAgentPayout = reward + selectedTip;
        await db.collection('users').doc(solverId).update({ balance: firebase.firestore.FieldValue.increment(totalAgentPayout) });
        let msgToCEO = `[CONTRACT APROBAT] Recompensă Bază: ${reward} VV | Tips Lăsat: ${selectedTip} VV.`;
        await db.collection('photos').add({ url: photoUrl, agentId: auth.currentUser.uid, message: msgToCEO, flagged: false, timestamp: Date.now(), lat: currentLat, lng: currentLng });
        
        if(proofMarker) { map.removeLayer(proofMarker); proofMarker = null; }
        alert("Misiune finalizată! " + totalAgentPayout + " VV în total.");
        closeModal('tips-modal');
        pendingApprovalData = null;
    } catch(e) { alert("Eroare la tranzacție: " + e.message); }
}

async function reportFakeIntel(missionId, photoUrl) {
    if(!confirm("Trimitem poza catre VVTeam pentru investigație de fraudă?")) return;
    try {
        await db.collection('missions').doc(missionId).update({ status: 'disputed' });
        await db.collection('photos').add({ url: photoUrl, agentId: auth.currentUser.uid, message: "[ALARMĂ FRAUDĂ - P2P] Vezi poza raportată!", flagged: true, timestamp: Date.now(), lat: currentLat, lng: currentLng });
        if(proofMarker) { map.removeLayer(proofMarker); proofMarker = null; }
        alert("Raportul a fost trimis. Durata de returnare a fondurilor poate varia ca timp.");
        closeModal('inbox-modal');
    } catch(e) { alert("Eroare la raportare."); }
}

let isFirstLocation = true; 

function initMap() {
    if(!map) {
        map = L.map('map', {zoomControl: false}).setView([currentLat, currentLng], 12);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png').addTo(map);
        
        map.locate({setView: false, watch: true, maxZoom: 16, enableHighAccuracy: true, timeout: 10000});
        
        let userMarker = null;
        map.on('locationfound', function(e) {
            currentLat = e.latlng.lat; currentLng = e.latlng.lng;
            
            if(isFirstLocation) {
                map.setView(e.latlng, 15);
                isFirstLocation = false;
            }

            if(!userMarker) { 
                userMarker = L.circleMarker(e.latlng, { radius: 7, fillColor: "#fff", color: "rgba(255,255,255,0.25)", weight: 7, opacity: 1, fillOpacity: 1 }).addTo(map);
            } else { 
                userMarker.setLatLng(e.latlng); 
            }
        });

        map.on('click', function(e) {
            targetMissionLat = e.latlng.lat;
            targetMissionLng = e.latlng.lng;

            if(targetMarker) {
                map.removeLayer(targetMarker);
            }

            const crosshairIcon = L.divIcon({
                className: 'target-crosshair',
                html: '<div class="crosshair-center"></div>',
                iconSize: [40, 40],
                iconAnchor: [20, 20]
            });

            targetMarker = L.marker(e.latlng, {icon: crosshairIcon}).addTo(map);

            let popupContent = `
                <div style="text-align:center; padding: 5px; min-width: 150px;">
                    <div id="dynamic-address" style="font-size: 10px; color: var(--vv-blue); margin-bottom: 8px; letter-spacing: 1px; font-weight: 800;">[ EXTRAGERE DATE... ]</div>
                    <button onclick="openTargetMissionModal()" style="background: var(--vv-purple); color: #fff; border: none; padding: 10px 15px; border-radius: 8px; font-weight: 700; font-size: 11px; cursor: pointer; text-transform: uppercase; letter-spacing: 1px; box-shadow: 0 5px 15px rgba(191, 90, 242, 0.4);">🎯 LANSEAZĂ CONTRACT</button>
                </div>
            `;

            targetMarker.bindPopup(popupContent, {closeButton: false, className: 'dark-popup'}).openPopup();

            fetch(`https://nominatim.openstreetmap.org/reverse?lat=${targetMissionLat}&lon=${targetMissionLng}&format=json`)
                .then(response => response.json())
                .then(data => {
                    let addressText = "ZONĂ NECUNOSCUTĂ";
                    if(data && data.address) {
                        let road = data.address.road || data.address.pedestrian || "";
                        let house = data.address.house_number || "";
                        let suburb = data.address.suburb || data.address.neighbourhood || data.address.city || "";
                        
                        if(road) {
                            addressText = `${road} ${house}`.trim().toUpperCase();
                        } else if (suburb) {
                            addressText = `${suburb}`.toUpperCase();
                        } else {
                            addressText = `LAT: ${targetMissionLat.toFixed(4)} | LNG: ${targetMissionLng.toFixed(4)}`;
                        }
                    }
                    const addressElement = document.getElementById('dynamic-address');
                    if(addressElement) {
                        addressElement.innerText = addressText;
                        addressElement.style.color = "#888";
                    }
                })
                .catch(err => {
                    const addressElement = document.getElementById('dynamic-address');
                    if(addressElement) {
                        addressElement.innerText = `LAT: ${targetMissionLat.toFixed(4)} | LNG: ${targetMissionLng.toFixed(4)}`;
                        addressElement.style.color = "#888";
                    }
                });
        });
    }
    setTimeout(() => { if(map) map.invalidateSize(); }, 500); 
}

async function startBootSequence() {
    let keyInput = document.getElementById('access-key').value.trim().toUpperCase();
    if(keyInput.length < 5) return alert("Introdu o cheie validă!");
    try {
        const snapshot = await db.collection('access_keys').where('key', '==', keyInput).get();
        if(snapshot.empty) { alert("Cheie invalidă!"); } else {
            localStorage.setItem('vv_agent_key', keyInput);
            document.getElementById('splash-screen').style.display = 'none';
            document.getElementById('alias-screen').style.display = 'flex';
            setTimeout(() => { document.getElementById('alias-screen').style.opacity = '1'; }, 50);
        }
    } catch(e) { alert("Eroare server."); }
}

async function confirmAlias() {
    if(!document.getElementById('tc-checkbox').checked) return alert("Bifează Regulamentul!");
    globalAlias = document.getElementById('user-alias-input').value.trim() || "AGENT VV";
    try {
        const cred = await auth.signInAnonymously();
        const userRef = db.collection('users').doc(cred.user.uid);
        const doc = await userRef.get();
        if (!doc.exists) { await userRef.set({ alias: globalAlias, balance: 100, joinedAt: firebase.firestore.FieldValue.serverTimestamp() }); }
        location.reload(); 
    } catch(e) { alert("Eroare conectare: " + e.message); }
}

function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

async function openCamera() {
    document.getElementById('camera-screen').style.display = 'flex';
    setTimeout(() => { document.getElementById('camera-screen').style.opacity = '1'; }, 50);
    try {
        const constraints = { video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false };
        currentStream = await navigator.mediaDevices.getUserMedia(constraints);
        document.getElementById('real-camera-video').srcObject = currentStream;
    } catch (err) { alert("Eroare la accesarea camerei: " + err.message); }
}

function closeCamera() {
    document.getElementById('camera-screen').style.opacity = '0';
    setTimeout(() => { document.getElementById('camera-screen').style.display = 'none'; resetCameraUI(); }, 300);
    if (currentStream) { currentStream.getTracks().forEach(track => track.stop()); currentStream = null; }
}

function takePicture() {
    const video = document.getElementById('real-camera-video');
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth; 
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.font = "bold 26px -apple-system, sans-serif";
    ctx.shadowColor = "rgba(0,0,0,0.8)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 2;
    let timeString = new Date().toLocaleTimeString();
    ctx.fillText("VV PROOF | " + timeString, 30, 50); 
    
    video.pause(); 
    canvas.toBlob((blob) => { tempPhotoBlob = blob; }, 'image/jpeg', 0.6);
    
    document.getElementById('shutter-container').style.display = 'none';
    document.getElementById('post-photo-menu').style.display = 'flex';
    setTimeout(() => { document.getElementById('post-photo-menu').classList.add('active'); }, 50);
}

function retakePhoto() { document.getElementById('real-camera-video').play(); resetCameraUI(); }

function resetCameraUI() {
    document.getElementById('post-photo-menu').classList.remove('active');
    setTimeout(() => {
        document.getElementById('post-photo-menu').style.display = 'none';
        document.getElementById('shutter-container').style.display = 'flex';
        document.getElementById('photo-msg').value = "";
        document.getElementById('send-btn').innerText = "TRIMITE RAPORT";
        document.getElementById('send-btn').style.pointerEvents = 'auto';
        document.getElementById('retake-btn').style.display = 'block';
        if(!activeMissionId) { 
            document.getElementById('camera-status-text').innerText = "Sistem Validare VV"; 
            document.getElementById('camera-status-text').style.color = "#fff"; 
        }
    }, 300);
}

async function uploadPhotoToCEO() {
    if(!tempPhotoBlob) return;
    let msg = document.getElementById('photo-msg').value.trim();
    const uid = auth.currentUser.uid;
    
    document.getElementById('send-btn').innerText = "SE TRIMITE...";
    document.getElementById('send-btn').style.pointerEvents = 'none';
    document.getElementById('retake-btn').style.display = 'none';

    try {
        const timestamp = Date.now();
        const photoRef = storage.ref(`missions_beta/${uid}/${timestamp}.jpg`);
        await photoRef.put(tempPhotoBlob);
        const downloadUrl = await photoRef.getDownloadURL();
        
        if (activeMissionId) {
            await db.collection('missions').doc(activeMissionId).update({
                status: 'pending_review',
                photoUrl: downloadUrl,
                solverId: uid,
                solverLat: currentLat,
                solverLng: currentLng
            });
            alert("Raport validat și trimis către client!");
            activeMissionId = null;
        } else {
            await db.collection('photos').add({
                url: downloadUrl, agentId: uid, message: msg, flagged: false, timestamp: timestamp, lat: currentLat, lng: currentLng 
            });
            alert("✅ Raport trimis către VVTeam!");
        }
        closeCamera();
    } catch(e) { alert("Eroare la trimitere."); closeCamera(); }
}
