const firebaseConfig = {
    apiKey: "AIzaSyDGv4kEClO0RHCLvXVLOT-vyPHw6bsxYVc",
    authDomain: "vv-ep-beta.firebaseapp.com",
    projectId: "vv-ep-beta",
    storageBucket: "vv-ep-beta.firebasestorage.app"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// ======= CONFIGURARE =======
const ADMIN_EMAIL = 'EMAILUL_TAU_PERSONAL@gmail.com'; // <--- PUNE EMAIL-UL TĂU REAL AICI!

auth.onAuthStateChanged(user => {
    const login = document.getElementById('login-screen');
    const ui = document.getElementById('vv-app-ui');
    if (user && user.email === ADMIN_EMAIL) {
        login.style.display = 'none';
        ui.style.display = 'flex';
        initTeamDashboard();
    } else {
        login.style.display = 'flex';
        ui.style.display = 'none';
    }
});

async function loginTeam() {
    const email = document.getElementById('auth-email').value;
    const pass = document.getElementById('auth-pass').value;
    try { await auth.signInWithEmailAndPassword(email, pass); } 
    catch(e) { document.getElementById('login-error').style.display = 'block'; }
}

function logoutTeam() { auth.signOut(); location.reload(); }

function switchSection(id, el) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.getElementById(id + '-section').classList.add('active');
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    el.classList.add('active');
}

function initTeamDashboard() {
    // 1. Feed poze
    db.collection('photos').orderBy('timestamp', 'desc').onSnapshot(snap => {
        const container = document.getElementById('feed-container');
        container.innerHTML = '';
        snap.forEach(doc => {
            let d = doc.data();
            container.innerHTML += `
                <div class="photo-card">
                    <img src="${d.url}" class="photo-img" onclick="openLightbox('${d.url}')">
                    <div class="photo-info">
                        <div style="margin-bottom:8px;">"${d.message}"</div>
                        <div style="font-size:9px; color:#555;">UID: ${d.agentId.substring(0,6)}</div>
                    </div>
                </div>`;
        });
    });

    // 2. Leaderboard & Bani
    db.collection('users').orderBy('balance', 'desc').onSnapshot(snap => {
        let total = 0;
        const body = document.getElementById('agents-body');
        body.innerHTML = '';
        let rank = 1;
        snap.forEach(doc => {
            let u = doc.data();
            total += u.balance;
            body.innerHTML += `
                <tr>
                    <td>#${rank++}</td>
                    <td><strong style="color:#fff;">${u.alias}</strong></td>
                    <td style="color:var(--safe); font-weight:700;">${u.balance.toLocaleString()} VV</td>
                    <td>${u.balance >= 1000 ? '<span style="color:var(--vv-blue)">ONYX</span>' : 'AGENT'}</td>
                </tr>`;
        });
        document.getElementById('total-vv-bank').innerText = total.toLocaleString() + " VV";
    });
}

function openLightbox(url) {
    document.getElementById('lb-img').src = url;
    document.getElementById('lightbox').style.display = 'flex';
}

async function resetBetaData() {
    if(confirm("ȘTERGI TOATE POZELE?")) {
        let snap = await db.collection('photos').get();
        snap.forEach(d => d.ref.delete());
        alert("Sistem resetat.");
    }
}
