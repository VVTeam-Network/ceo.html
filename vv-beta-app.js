// ================================================================
// VV NOD — PROXIMITY SCAN ULTRASONIC
// Adaugă la finalul vv-beta-app.js
// ================================================================

var _vvNodActive = false;
var _vvNodAudioCtx = null;
var _vvNodAnalyser = null;
var _vvNodMicStream = null;
var _vvNodOscillator = null;
var _vvNodTimer = null;
var _vvNodDetected = false;

// Frecvența unică VV — 18.5kHz, invizibilă pentru ureche umană
var VV_NOD_FREQ = 18500;
var VV_NOD_DURATION = 10000; // 10 secunde total
var VV_NOD_EMIT = 3000;      // 3 secunde emisie
var VV_NOD_THRESHOLD = 0.015; // prag detecție

// ── BUTON VV NOD — injectat în action-sidebar ─────────────────
function injectVVNodButton() {
    var sidebar = document.getElementById('action-hub');
    if (!sidebar || document.getElementById('fab-vv-nod')) return;

    var btn = document.createElement('div');
    btn.id = 'fab-vv-nod';
    btn.className = 'fab-btn';
    btn.title = 'VV NOD Scan';
    btn.style.cssText = 'order:-1;'; // apare primul în sidebar
    btn.innerHTML = '<span style="font-size:18px;color:rgba(255,255,255,0.8);line-height:1;">⬡</span>';
    btn.onclick = function() { startVVNodScan(); };

    // Inserăm primul în sidebar
    sidebar.insertBefore(btn, sidebar.firstChild);
}

// ── OVERLAY RADAR PREMIUM ─────────────────────────────────────
function showVVNodOverlay(phase) {
    var old = document.getElementById('vv-nod-overlay');
    if (old && phase === 'remove') { old.remove(); return; }
    if (old) { updateVVNodOverlay(phase); return; }

    var overlay = document.createElement('div');
    overlay.id = 'vv-nod-overlay';
    overlay.style.cssText = [
        'position:fixed;inset:0;z-index:99998;',
        'background:rgba(0,0,0,0.92);',
        'backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);',
        'display:flex;flex-direction:column;',
        'align-items:center;justify-content:center;',
        'padding:40px;',
        'animation:vvNodFadeIn .4s cubic-bezier(0.16,1,0.3,1);'
    ].join('');

    overlay.innerHTML = [
        // CSS animații
        '<style>',
        '@keyframes vvNodFadeIn{from{opacity:0}to{opacity:1}}',
        '@keyframes vvRing1{0%,100%{transform:scale(1);opacity:.5}50%{transform:scale(1.15);opacity:.15}}',
        '@keyframes vvRing2{0%,100%{transform:scale(1);opacity:.4}50%{transform:scale(1.2);opacity:.1}}',
        '@keyframes vvRing3{0%,100%{transform:scale(1);opacity:.3}50%{transform:scale(1.25);opacity:.06}}',
        '@keyframes vvRing4{0%,100%{transform:scale(1);opacity:.2}50%{transform:scale(1.3);opacity:.03}}',
        '@keyframes vvCorePulse{0%,100%{box-shadow:0 0 0 0 rgba(255,255,255,0.2)}50%{box-shadow:0 0 0 12px rgba(255,255,255,0)}}',
        '@keyframes vvScanLine{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}',
        '@keyframes vvDetected{0%{transform:scale(1)}50%{transform:scale(1.08)}100%{transform:scale(1)}}',
        '</style>',

        // Radar container
        '<div id="vv-nod-radar" style="',
            'position:relative;width:220px;height:220px;',
            'margin-bottom:40px;',
        '">',

            // Ring 4 — cel mai exterior
            '<div style="position:absolute;inset:-44px;border-radius:50%;',
                'background:transparent;border:1px solid rgba(255,255,255,0.04);',
                'animation:vvRing4 2.4s ease-in-out infinite .9s;"></div>',

            // Ring 3
            '<div style="position:absolute;inset:-22px;border-radius:50%;',
                'background:transparent;border:1px solid rgba(255,255,255,0.07);',
                'animation:vvRing3 2.4s ease-in-out infinite .6s;"></div>',

            // Ring 2
            '<div style="position:absolute;inset:0;border-radius:50%;',
                'background:transparent;border:1px solid rgba(255,255,255,0.1);',
                'animation:vvRing2 2.4s ease-in-out infinite .3s;"></div>',

            // Ring 1 — cel mai interior
            '<div style="position:absolute;inset:22px;border-radius:50%;',
                'background:transparent;border:1px solid rgba(255,255,255,0.15);',
                'animation:vvRing1 2.4s ease-in-out infinite;"></div>',

            // Linie de scan rotativă
            '<div id="vv-scan-line" style="',
                'position:absolute;inset:0;border-radius:50%;overflow:hidden;',
            '">',
                '<div style="',
                    'position:absolute;top:50%;left:50%;',
                    'width:50%;height:1px;',
                    'transform-origin:left center;',
                    'background:linear-gradient(90deg,rgba(255,255,255,0.4),transparent);',
                    'animation:vvScanLine 2s linear infinite;',
                '"></div>',
            '</div>',

            // Core central
            '<div id="vv-nod-core" style="',
                'position:absolute;inset:44px;border-radius:50%;',
                'background:rgba(255,255,255,0.06);',
                'border:1px solid rgba(255,255,255,0.2);',
                'display:flex;align-items:center;justify-content:center;',
                'animation:vvCorePulse 2s infinite;',
            '">',
                '<span style="font-size:28px;color:rgba(255,255,255,0.9);">⬡</span>',
            '</div>',

            // Puncte insideri detectați — apar dinamic
            '<div id="vv-nod-dots" style="position:absolute;inset:0;border-radius:50%;pointer-events:none;"></div>',

        '</div>',

        // Status text
        '<div id="vv-nod-title" style="',
            'font-size:11px;color:rgba(255,255,255,0.3);',
            'letter-spacing:4px;font-weight:700;',
            'margin-bottom:10px;text-align:center;',
        '">VV NOD · BETA</div>',

        '<div id="vv-nod-status" style="',
            'font-size:17px;font-weight:800;color:#fff;',
            'letter-spacing:.5px;margin-bottom:8px;',
            'text-align:center;min-height:26px;',
        '">Inițializare...</div>',

        '<div id="vv-nod-sub" style="',
            'font-size:12px;color:rgba(255,255,255,0.3);',
            'text-align:center;line-height:1.6;',
            'max-width:260px;margin-bottom:32px;',
        '">Se pregătește scanarea...</div>',

        // Progress bar
        '<div style="width:200px;height:2px;background:rgba(255,255,255,0.06);border-radius:2px;overflow:hidden;margin-bottom:32px;">',
            '<div id="vv-nod-progress" style="',
                'height:100%;width:0%;border-radius:2px;',
                'background:rgba(255,255,255,0.6);',
                'transition:width .3s linear;',
            '"></div>',
        '</div>',

        // Buton anulare
        '<div onclick="stopVVNodScan()" style="',
            'padding:12px 32px;',
            'background:transparent;',
            'border:1px solid rgba(255,255,255,0.1);',
            'border-radius:12px;',
            'font-size:12px;color:rgba(255,255,255,0.3);',
            'cursor:pointer;letter-spacing:1px;',
            'font-weight:600;',
            '-webkit-tap-highlight-color:transparent;',
        '">ANULEAZĂ</div>',

        // Notă legală discretă
        '<div style="',
            'position:absolute;bottom:calc(20px + env(safe-area-inset-bottom,0px));',
            'font-size:9px;color:rgba(255,255,255,0.12);',
            'text-align:center;letter-spacing:1px;',
            'max-width:280px;line-height:1.6;',
        '">',
            'Semnal audio ultrasonic · Fără înregistrare · Opt-in manual<br>',
            'Fază de testare Beta · VV NOD 1.0 în dezvoltare',
        '</div>',

    ].join('');

    document.body.appendChild(overlay);
}

function updateVVNodOverlay(phase) {
    var status = document.getElementById('vv-nod-status');
    var sub = document.getElementById('vv-nod-sub');
    var core = document.getElementById('vv-nod-core');
    var progress = document.getElementById('vv-nod-progress');
    var scanLine = document.getElementById('vv-scan-line');

    if (phase === 'emit') {
        if (status) status.textContent = 'Se emite semnal VV...';
        if (sub) sub.textContent = 'Frecvență ultrasonică activă · 18.5kHz';
        if (core) core.style.background = 'rgba(255,255,255,0.12)';
        if (progress) progress.style.width = '30%';
    } else if (phase === 'listen') {
        if (status) status.textContent = 'Se ascultă rețeaua...';
        if (sub) sub.textContent = 'Scanare proximitate · ~10 metri';
        if (core) core.style.background = 'rgba(255,255,255,0.06)';
        if (progress) progress.style.width = '65%';
    } else if (phase === 'found') {
        if (status) {
            status.textContent = 'Insider detectat ⬡';
            status.style.color = '#fff';
        }
        if (sub) sub.textContent = 'VV Network activ în proximitate';
        if (core) {
            core.style.background = 'rgba(255,255,255,0.15)';
            core.style.animation = 'vvDetected .6s ease-in-out 3, vvCorePulse 2s infinite';
            core.style.border = '1px solid rgba(255,255,255,0.5)';
        }
        if (scanLine) scanLine.style.opacity = '0.5';
        if (progress) progress.style.width = '100%';
        addNodDot();
    } else if (phase === 'notfound') {
        if (status) status.textContent = 'Niciun Insider în rază';
        if (sub) sub.textContent = 'Încearcă într-o zonă cu mai mulți Insideri VV';
        if (progress) progress.style.width = '100%';
    } else if (phase === 'done') {
        if (progress) progress.style.width = '100%';
        setTimeout(function() { showVVNodOverlay('remove'); }, 1500);
    }
}

function addNodDot() {
    var dotsEl = document.getElementById('vv-nod-dots');
    if (!dotsEl) return;
    // Adaugă un punct animat la poziție aleatorie pe cerc
    var angle = Math.random() * Math.PI * 2;
    var r = 65 + Math.random() * 25; // px de la centru
    var cx = 110 + Math.cos(angle) * r;
    var cy = 110 + Math.sin(angle) * r;
    var dot = document.createElement('div');
    dot.style.cssText = [
        'position:absolute;',
        'width:8px;height:8px;',
        'border-radius:50%;',
        'background:rgba(255,255,255,0.9);',
        'box-shadow:0 0 12px rgba(255,255,255,0.6),0 0 24px rgba(255,255,255,0.2);',
        'left:' + (cx-4) + 'px;top:' + (cy-4) + 'px;',
        'animation:vvCorePulse 1.5s infinite;',
        'transition:all .3s;'
    ].join('');
    dotsEl.appendChild(dot);
}

// ── START SCAN ────────────────────────────────────────────────
async function startVVNodScan() {
    if (_vvNodActive) return;
    _vvNodActive = true;
    _vvNodDetected = false;

    showVVNodOverlay('init');

    // Cerem permisiunea microfonului
    try {
        var stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        _vvNodMicStream = stream;
    } catch(e) {
        _vvNodActive = false;
        showVVNodOverlay('remove');
        showToast('🎙 Microfonul e necesar pentru VV NOD Scan.');
        return;
    }

    // Creăm AudioContext
    try {
        _vvNodAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch(e) {
        _vvNodActive = false;
        stopVVNodScan();
        showToast('AudioContext indisponibil pe acest dispozitiv.');
        return;
    }

    // ── FAZA 1: EMIT (0-3s) ──────────────────────────────────
    updateVVNodOverlay('emit');
    _vvNodOscillator = _vvNodAudioCtx.createOscillator();
    var gainNode = _vvNodAudioCtx.createGain();
    _vvNodOscillator.type = 'sine';
    _vvNodOscillator.frequency.setValueAtTime(VV_NOD_FREQ, _vvNodAudioCtx.currentTime);
    gainNode.gain.setValueAtTime(0.3, _vvNodAudioCtx.currentTime);
    _vvNodOscillator.connect(gainNode);
    gainNode.connect(_vvNodAudioCtx.destination);
    _vvNodOscillator.start();

    // Oprim emisie după 3 secunde
    _vvNodTimer = setTimeout(function() {
        if (_vvNodOscillator) {
            try { _vvNodOscillator.stop(); } catch(e) {}
            _vvNodOscillator = null;
        }
        // ── FAZA 2: LISTEN (3-10s) ──────────────────────────
        updateVVNodOverlay('listen');
        startListening();
    }, VV_NOD_EMIT);
}

function startListening() {
    if (!_vvNodAudioCtx || !_vvNodMicStream) return;

    var source = _vvNodAudioCtx.createMediaStreamSource(_vvNodMicStream);
    _vvNodAnalyser = _vvNodAudioCtx.createAnalyser();
    _vvNodAnalyser.fftSize = 8192;
    _vvNodAnalyser.smoothingTimeConstant = 0.8;
    source.connect(_vvNodAnalyser);

    var bufferLength = _vvNodAnalyser.frequencyBinCount;
    var dataArray = new Float32Array(bufferLength);

    var checkInterval = setInterval(function() {
        if (!_vvNodActive || !_vvNodAnalyser) { clearInterval(checkInterval); return; }
        _vvNodAnalyser.getFloatFrequencyData(dataArray);

        // Calculăm bin-ul pentru frecvența VV NOD
        var sampleRate = _vvNodAudioCtx.sampleRate;
        var binIndex = Math.round(VV_NOD_FREQ / (sampleRate / _vvNodAnalyser.fftSize));
        var binRange = 3; // ±3 bins în jurul frecvenței țintă
        var maxVal = -Infinity;
        for (var i = binIndex - binRange; i <= binIndex + binRange; i++) {
            if (i >= 0 && i < dataArray.length) {
                var linear = Math.pow(10, dataArray[i] / 20);
                if (linear > maxVal) maxVal = linear;
            }
        }

        if (maxVal > VV_NOD_THRESHOLD && !_vvNodDetected) {
            _vvNodDetected = true;
            clearInterval(checkInterval);
            updateVVNodOverlay('found');
            logVVNodEvent(true);
            setTimeout(function() {
                stopVVNodScan();
                showToast('⬡ Insider VV detectat în proximitate!');
            }, 2000);
        }
    }, 200);

    // Timeout total — 7 secunde de ascultare
    _vvNodTimer = setTimeout(function() {
        clearInterval(checkInterval);
        if (!_vvNodDetected) {
            updateVVNodOverlay('notfound');
            logVVNodEvent(false);
        }
        setTimeout(function() { stopVVNodScan(); }, 1800);
    }, VV_NOD_DURATION - VV_NOD_EMIT);
}

// ── STOP SCAN ─────────────────────────────────────────────────
function stopVVNodScan() {
    _vvNodActive = false;
    clearTimeout(_vvNodTimer);

    if (_vvNodOscillator) {
        try { _vvNodOscillator.stop(); } catch(e) {}
        _vvNodOscillator = null;
    }
    if (_vvNodMicStream) {
        _vvNodMicStream.getTracks().forEach(function(t) { t.stop(); });
        _vvNodMicStream = null;
    }
    if (_vvNodAudioCtx) {
        try { _vvNodAudioCtx.close(); } catch(e) {}
        _vvNodAudioCtx = null;
    }
    _vvNodAnalyser = null;
    showVVNodOverlay('remove');
}

// ── LOG EVENT în Firebase ─────────────────────────────────────
function logVVNodEvent(detected) {
    if (typeof db === 'undefined' || typeof currentUser === 'undefined' || !currentUser) return;
    db.collection('vvhi_dataset').add({
        action: 'VV_NOD_SCAN',
        context: {
            detected: detected,
            frequency: VV_NOD_FREQ,
            uid: currentUser.uid,
            alias: localStorage.getItem('vv_alias') || 'INSIDER'
        },
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(function() {});
}

// ── INIT — pornit când app e gata ────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(injectVVNodButton, 2000);
});
// Fallback dacă DOMContentLoaded deja a trecut
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(injectVVNodButton, 2000);
}
