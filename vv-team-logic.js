// ================= FIREBASE CONFIG =================
const firebaseConfig = {
    apiKey: "AIzaSyDGv4kEClO0RHCLvXVLOT-vyPHw6bsxYVc",
    authDomain: "vv-ep-beta.firebaseapp.com",
    projectId: "vv-ep-beta",
    storageBucket: "vv-ep-beta.firebasestorage.app"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

let isFirstDisputeLoad = true;
let audioContext = null;

let currentFeedPhotos = [];
let currentDisputePhotos = [];
let activeGalleryArray = [];
let activeGalleryIndex = 0;

// ================= LIGHTBOX LOGIC =================
function openLightbox(arrayType, index) {
    if(arrayType === 'feed') activeGalleryArray = currentFeedPhotos;
    else if (arrayType === 'dispute') activeGalleryArray = currentDisputePhotos;
    
    if(activeGalleryArray.length === 0) return;
    
    activeGalleryIndex = index;
    document.getElementById('lb-img').src = activeGalleryArray[activeGalleryIndex];
    document.getElementById('lightbox').style.display = 'flex';
}
function closeLightbox() { document.getElementById('lightbox').style.display = 'none'; }
function lbNext(event) {
    event.stopPropagation();
    if(activeGalleryArray.length === 0) return;
    activeGalleryIndex = (activeGalleryIndex + 1) % activeGalleryArray.length;
    document.getElementById('lb-img').src = activeGalleryArray[activeGalleryIndex];
}
function lbPrev(event) {
    event.stopPropagation();
    if(activeGalleryArray.length === 0) return;
    activeGalleryIndex = (activeGalleryIndex - 1 + activeGalleryArray.length) % activeGalleryArray.length;
    document.getElementById('lb-img').src = activeGalleryArray[activeGalleryIndex];
}

// ================= AUDIO PING =================
function playAlertSound() {
    try {
        if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(440, audioContext.currentTime + 0.1);
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.4);
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.4);
    } catch(e) { console.log("Audio nesuportat."); }
}

// ================= LOGIN =================
function checkLogin() {
    let pass = document.getElementById('ceo-pass').value;
    if(pass === "CEO2026") {
        if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
        document.getElementById('login-screen').style.opacity = '0';
        setTimeout(() => { 
            document.getElementById('login-screen').style.display = 'none'; 
            initDashboard();
        }, 500);
    } else { alert("Acces Respins."); }
}
document.getElementById("ceo-pass").addEventListener("keypress", function(event) { if (event.key === "Enter") checkLogin(); });

// ================= NAVIGATIE =================
function switchSection(id, element) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.getElementById(id + '-section').classList.add('active');
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    element.classList.add('active');
}

function initDashboard() {
    loadGlobalFeed();
    loadDisputes();
    loadLeaderboard(); 
    loadFeedback();
    loadKeys();
}

// ================= 1. FEED =================
function loadGlobalFeed() {
    db.collection('photos').orderBy('timestamp', 'desc').onSnapshot(snap => {
        const container = document.getElementById('feed-container');
        container.innerHTML = '';
        currentFeedPhotos = []; 
        let imgIndex = 0;

        if(snap.empty) { container.innerHTML = '<div style="color:var(--text-muted);">Niciun intel înregistrat.</div>'; return; }

        snap.forEach(doc => {
            let d = doc.data();
            currentFeedPhotos.push(d.url);
            
            let date = new Date(d.timestamp).toLocaleString('ro-RO', {hour: '2-digit', minute:'2-digit', day:'2-digit', month:'short'});
            let flagHtml = d.flagged ? `<div class="flag-badge"><i class="fas fa-exclamation-triangle"></i> ALERTĂ FRAUDĂ P2P</div>` : '';
            
            container.innerHTML += `
                <div class="photo-card">
                    <img src="${d.url}" class="photo-img" onclick="openLightbox('feed', ${imgIndex})" title="Click pentru Zoom">
                    <div class="photo-info">
                        ${flagHtml}
                        <div class="photo-msg">"${d.message}"</div>
                        <div class="photo-meta">
                            <span><i class="fas fa-clock"></i> ${date}</span>
                            <span>UID: ${d.agentId.substring(0,5)}</span>
                        </div>
                    </div>
                </div>
            `;
            imgIndex++;
        });
    });
}

// ================= 2. DISPUTE =================
function loadDisputes() {
    db.collection('missions').where('status', '==', 'disputed').onSnapshot(snap => {
        const container = document.getElementById('disputes-container');
        const badge = document.getElementById('dispute-badge');
        
        container.innerHTML = '';
        currentDisputePhotos = [];
        let imgIndex = 0;

        if(snap.size > 0) { badge.style.display = 'inline-block'; badge.innerText = snap.size; } 
        else { badge.style.display = 'none'; container.innerHTML = '<div style="color:var(--text-muted);">Nicio dispută activă. Sistem curat.</div>'; }

        if (!isFirstDisputeLoad) {
            let hasNew = false;
            snap.docChanges().forEach(change => { if (change.type === 'added') hasNew = true; });
            if (hasNew) playAlertSound();
        }
        isFirstDisputeLoad = false;

        snap.forEach(doc => {
            let m = doc.data();
            currentDisputePhotos.push(m.photoUrl);

            container.innerHTML += `
                <div class="photo-card" style="border-color: var(--danger);">
                    <img src="${m.photoUrl}" class="photo-img" onclick="openLightbox('dispute', ${imgIndex})" title="Click pentru Inspecție">
                    <div class="photo-info">
                        <div class="flag-badge">DISPUTĂ DESCHISĂ</div>
                        <div class="photo-msg" style="color:var(--text-muted); font-size:12px;">Cerere: <span style="color:#fff;">${m.description}</span></div>
                        <div class="photo-meta" style="margin-top:10px;">
                            <span>Recompensă: <strong style="color:var(--gold);">${m.reward} VV</strong></span>
                        </div>
                        <div class="action-row">
                            <button class="btn-approve" onclick="resolveDispute('${doc.id}', '${m.solverId}', ${m.reward}, true)">POZĂ OK</button>
                            <button class="btn-reject" onclick="resolveDispute('${doc.id}', '${m.creatorId}', ${m.reward}, false)">FAKE (Retur BANI)</button>
                        </div>
                    </div>
                </div>
            `;
            imgIndex++;
        });
    });
}

async function resolveDispute(missionId, targetUserId, amount, isApprove) {
    let msg = isApprove ? "Plătești AGENTULUI?" : "Returnezi banii CLIENTULUI?";
    if(!confirm(msg)) return;
    try {
        await db.collection('users').doc(targetUserId).update({ balance: firebase.firestore.FieldValue.increment(amount) });
        await db.collection('missions').doc(missionId).update({ status: isApprove ? 'completed' : 'cancelled_fraud' });
        alert("Dispută rezolvată.");
    } catch(e) { alert("Eroare: " + e.message); }
}

// ================= 3. LEADERBOARD & TOTAL BANI =================
function loadLeaderboard() {
    db.collection('users').onSnapshot(snap => {
        let users = [];
        let totalBankValue = 0; 

        snap.forEach(doc => {
            let data = doc.data();
            data.uid = doc.id;
            users.push(data);
            totalBankValue += (data.balance || 0); 
        });

        document.getElementById('total-vv-bank').innerText = totalBankValue.toLocaleString() + " VV";

        users.sort((a, b) => (b.balance || 0) - (a.balance || 0));
        const tbody = document.getElementById('leaderboard-body');
        tbody.innerHTML = '';

        if(users.length === 0) { tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--text-muted);">Niciun agent.</td></tr>'; return; }

        users.forEach((u, index) => {
            let rankHtml = index === 0 ? `<span class="rank-gold">#1</span>` : index === 1 ? `<span style="color:#C0C0C0; font-weight:bold;">#2</span>` : index === 2 ? `<span style="color:#CD7F32; font-weight:bold;">#3</span>` : `#${index + 1}`;
            let shortId = u.uid.substring(0,5).toUpperCase();
            let bal = u.balance || 0;
            let statusHtml = bal >= 1000 ? `<span class="badge-onyx"><i class="fas fa-check-circle"></i> ELIGIBIL ONYX</span>` : `<span style="color:var(--text-muted); font-size:11px;">ÎN PROGRES</span>`;

            tbody.innerHTML += `
                <tr>
                    <td>${rankHtml}</td>
                    <td><strong style="color:#fff;">${u.alias || "Agent"}</strong> <span style="color:#555; font-size:10px; margin-left:5px;">(${shortId})</span></td>
                    <td style="color:var(--safe-green); font-family:monospace; font-size:16px;">${bal} VV</td>
                    <td>${statusHtml}</td>
                </tr>
            `;
        });
    });
}

// ================= 4. FEEDBACK =================
function loadFeedback() {
    const tbody = document.getElementById('feedback-body');
    tbody.innerHTML = `
        <tr>
            <td><strong style="color:#fff;">Sistem Beta</strong></td>
            <td style="color:rgba(255,255,255,0.8);">Meniul este activ. Așteaptă mesaje din aplicație.</td>
            <td><span style="color:var(--safe-green); font-size:11px; font-weight:bold;">ONLINE</span></td>
            <td><button class="btn-reply" onclick="alert('Funcție de Reply pregătită.')">REPLY</button></td>
        </tr>
    `;
}

// ================= WIPE DATABASE =================
async function deleteAllBetaData() {
    let promptWord = prompt("ATENȚIE: Această acțiune va șterge TOATE pozele și misiunile din sistem! Scrie: RESET");
    if(promptWord !== "RESET") { alert("Procedură anulată."); return; }
    
    try {
        let photos = await db.collection('photos').get();
        photos.forEach(doc => doc.ref.delete());
        
        let missions = await db.collection('missions').get();
        missions.forEach(doc => doc.ref.delete());

        alert("Sistem curățat complet! Gata pentru un nou test.");
    } catch(e) { alert("Eroare la ștergere: " + e.message); }
}

// ================= 5. CHEI =================
function loadKeys() {
    db.collection('access_keys').orderBy('createdAt', 'desc').onSnapshot(snap => {
        const list = document.getElementById('keys-list');
        list.innerHTML = '';
        snap.forEach(doc => {
            const data = doc.data();
            const statusColor = data.active ? 'var(--safe-green)' : '#ff3b30';
            const statusText = data.active ? 'ACTIV ✓' : 'DEZACTIVAT';
            list.innerHTML += `
                <div class="key-item">
                    <span>${data.key}</span>
                    <div style="display:flex; align-items:center; gap:10px;">
                        <span class="key-status" style="color:${statusColor};">${statusText}</span>
                        <button onclick="toggleKey('${doc.id}', ${data.active})" style="
                            background: ${data.active ? 'rgba(255,59,48,0.15)' : 'rgba(52,199,89,0.15)'};
                            border: 1px solid ${data.active ? 'rgba(255,59,48,0.3)' : 'rgba(52,199,89,0.3)'};
                            color: ${data.active ? '#ff3b30' : '#34c759'};
                            padding: 4px 10px; border-radius: 6px; font-size: 11px;
                            font-weight: 700; cursor: pointer; letter-spacing: 0.5px;
                        ">${data.active ? 'DEZACTIVEAZĂ' : 'ACTIVEAZĂ'}</button>
                    </div>
                </div>`;
        });
    });
}

// ================= FIX: active: true la generare =================
async function generateKey() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let newKey = '';
    for(let i = 0; i < 6; i++) newKey += chars.charAt(Math.floor(Math.random() * chars.length));
    try {
        await db.collection('access_keys').add({
            key: newKey,
            active: true,        // ← FIX: câmpul care lipsea
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch(e) { alert("Eroare generare cheie."); }
}

// Activează / dezactivează o cheie existentă
async function toggleKey(docId, currentState) {
    try {
        await db.collection('access_keys').doc(docId).update({ active: !currentState });
    } catch(e) { alert("Eroare: " + e.message); }
}
