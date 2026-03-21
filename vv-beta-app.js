// ================= FIREBASE CONFIG =================
const firebaseConfig = {
    apiKey: "AIzaSyDGv4kEClO0RHCLvXVLOT-vyPHw6bsxYVc",
    authDomain: "vv-ep-beta.firebaseapp.com",
    projectId: "vv-ep-beta",
    storageBucket: "vv-ep-beta.firebasestorage.app"
};
// Inițializăm Firebase doar dacă nu a fost deja inițializat
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

// ================= PAZNICUL: VERIFICARE LA INTRARE =================
window.onload = () => {
    const hasCompletedTutorial = localStorage.getItem('vv_premium_tutorial_done');
    
    if (hasCompletedTutorial === 'DA') {
        // E user vechi -> Ascunde tot onboarding-ul și arată direct harta
        document.getElementById('splash-screen').style.display = 'none';
        document.getElementById('tutorial-screen').style.display = 'none';
        
        let app = document.getElementById('app-container');
        app.style.display = 'block';
        // Fade-in fin
        setTimeout(() => { app.style.opacity = '1'; }, 50);
        
        initMap();
        // Conectare silențioasă în fundal
        auth.signInAnonymously().catch(err => console.log("Eroare Auth:", err));
    } else {
        // E user nou -> Rămâne pe Splash Screen
        document.getElementById('splash-screen').style.display = 'flex';
    }
};

// ================= ONBOARDING & TUTORIAL =================
function toggleAcceptButton() {
    const checkbox = document.getElementById('tc-checkbox');
    const btn = document.getElementById('btn-accept');
    if(checkbox.checked) {
        btn.classList.remove('disabled');
        btn.style.background = "#D4AF37"; // Butonul se face auriu Premium
        btn.style.color = "#000";
    } else {
        btn.classList.add('disabled');
        btn.style.background = "#fff";
        btn.style.color = "#000";
    }
}

function startTutorial() {
    if(!document.getElementById('tc-checkbox').checked) return;
    
    // Trecem la Tutorial
    document.getElementById('splash-screen').style.display = 'none';
    document.getElementById('tutorial-screen').style.display = 'flex';
}

function nextTutorial(step) {
    // Ascundem toate slide-urile
    document.querySelectorAll('.tutorial-slide').forEach(c => c.classList.remove('active'));
    // Afișăm slide-ul cerut
    document.getElementById('tut-' + step).classList.add('active');
}

function finishTutorial() {
    // 1. Punem ștampila invizibilă în telefon
    localStorage.setItem('vv_premium_tutorial_done', 'DA');
    
    // 2. Ascundem tutorialul
    document.getElementById('tutorial-screen').style.display = 'none';
    
    // 3. Arătăm harta cu efect de fade-in
    let app = document.getElementById('app-container');
    app.style.display = 'block';
    
    setTimeout(() => { 
        app.style.opacity = '1'; 
        initMap(); 
    }, 50);

    // 4. Creăm ID-ul secret în fundal pentru BAN system
    auth.signInAnonymously().then(cred => {
        const userRef = db.collection('users').doc(cred.user.uid);
        userRef.get().then(doc => {
            if (!doc.exists) { 
                userRef.set({ alias: "AGENT_NOU", balance: 100, rating: 5, joinedAt: firebase.firestore.FieldValue.serverTimestamp() }); 
            }
        });
    }).catch(err => console.log("Eroare creare cont:", err));
}

// ================= HARTA LEAFLET (PREMIUM DARK) =================
function initMap() {
    if(!map) {
        // Centrat pe București pentru test
        map = L.map('map', {zoomControl: false}).setView([44.4325, 26.1038], 14);
        
        // Harta neagră
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png').addTo(map);
        
        // GPS Locație Live
        map.locate({setView: true, maxZoom: 16, enableHighAccuracy: true});
        
        let userMarker = null;
        map.on('locationfound', function(e) {
            if(!userMarker) { 
                userMarker = L.circleMarker(e.latlng, { radius: 7, fillColor: "#D4AF37", color: "rgba(212, 175, 55, 0.3)", weight: 8, opacity: 1, fillOpacity: 1 }).addTo(map);
            } else { 
                userMarker.setLatLng(e.latlng); 
            }
        });

        // Click pe hartă pentru a plasa contract (Pop-up reparat, Premium)
        map.on('click', function(e) {
            if(targetMarker) { map.removeLayer(targetMarker); }
            const crosshairIcon = L.divIcon({ className: 'target-crosshair', html: '<div class="crosshair-center"></div>', iconSize: [40, 40], iconAnchor: [20, 20] });
            targetMarker = L.marker(e.latlng, {icon: crosshairIcon}).addTo(map);
            
            let popupContent = `
                <div style="text-align:center; padding: 5px; min-width: 140px;">
                    <div style="font-size: 10px; color: #D4AF37; margin-bottom: 8px; font-weight: 800; letter-spacing: 1px;">ZONĂ ȚINTĂ</div>
                    <button onclick="map.closePopup(); alert('Contract Inițiat (Test)');" style="background: #D4AF37; color: #000; border: none; padding: 10px 15px; border-radius: 8px; font-weight: 800; font-size: 11px; cursor: pointer; width: 100%;">LANSEAZĂ CONTRACT</button>
                </div>`;
            targetMarker.bindPopup(popupContent, {closeButton: false, className: 'dark-popup'}).openPopup();
        });
    }
    
    // Rezolvare bug de afișare pe ecrane mici
    setTimeout(() => { if(map) map.invalidateSize(); }, 400);
}

// ================= RADAR / CAMERA (Placeholder pentru interfață) =================
function toggleRadar() {
    radarActive = !radarActive;
    if(radarActive) { alert("Radar Onyx Activat!"); } else { alert("Radar Oprit."); }
}

function openCamera() {
    document.getElementById('camera-screen').style.display = 'flex';
    try {
        const constraints = { video: { facingMode: "environment" }, audio: false };
        navigator.mediaDevices.getUserMedia(constraints).then(stream => {
            currentStream = stream;
            document.getElementById('real-camera-video').srcObject = stream;
        });
    } catch (err) { alert("Eroare cameră: " + err.message); }
}

function closeCamera() {
    document.getElementById('camera-screen').style.display = 'none';
    if (currentStream) { currentStream.getTracks().forEach(track => track.stop()); currentStream = null; }
}

function takePicture() {
    alert("Dovadă capturată! (Test)");
}

function openMissionsList() {
    alert("Bursa de contracte se va deschide aici.");
}
