// Funcție pentru a debloca butonul de la regulament
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

// Cand bagă cheia și apasă Accept
async function startBootSequence() {
    let keyInput = document.getElementById('access-key').value.trim().toUpperCase();
    if(keyInput.length < 5) return alert("Introdu o cheie validă!");
    if(!document.getElementById('tc-checkbox').checked) return alert("Trebuie să accepți regulamentul!");
    
    try {
        const snapshot = await db.collection('access_keys').where('key', '==', keyInput).get();
        if(snapshot.empty) { alert("Cheie invalidă!"); } else {
            localStorage.setItem('vv_agent_key', keyInput);
            document.getElementById('splash-screen').style.display = 'none';
            document.getElementById('alias-screen').style.display = 'flex';
        }
    } catch(e) { alert("Eroare server."); }
}

// Când trece de Alias, intră în Tutorial (NU direct în aplicație)
async function confirmAlias() {
    globalAlias = document.getElementById('user-alias-input').value.trim() || "AGENT VV";
    try {
        const cred = await auth.signInAnonymously();
        const userRef = db.collection('users').doc(cred.user.uid);
        const doc = await userRef.get();
        if (!doc.exists) { 
            await userRef.set({ alias: globalAlias, balance: 100, joinedAt: firebase.firestore.FieldValue.serverTimestamp() }); 
        }
        // ASCUNDE ALIAS, ARATĂ TUTORIAL
        document.getElementById('alias-screen').style.display = 'none';
        document.getElementById('tutorial-screen').style.display = 'flex';
    } catch(e) { alert("Eroare conectare: " + e.message); }
}

// Navigare prin Tutorial
function nextTutorial(step) {
    document.querySelectorAll('.tutorial-card').forEach(c => c.classList.remove('active'));
    document.getElementById('tut-' + step).classList.add('active');
}

// Finalizare Tutorial -> Pornire Hartă
function finishTutorial() {
    document.getElementById('tutorial-screen').style.display = 'none';
    
    // Arată aplicația principală
    let app = document.getElementById('app-container'); 
    app.style.display = 'block';
    document.getElementById('main-dock').style.display = 'flex';
    
    setTimeout(() => { 
        app.style.opacity = '1'; 
        initMap(); // PORNIM HARTA AICI
        setTimeout(() => { if(map) map.invalidateSize(); }, 300);
    }, 50);
}
