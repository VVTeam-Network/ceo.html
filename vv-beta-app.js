// ================================================================
// VV BETA — FOUNDER PATCH
// Adaugă după ultima linie din vv-beta-app.js
// ================================================================

// ── FOUNDER DATA — citit din Firebase la login ────────────────
var founderData = null; // { isFounder, founderNum, vvCoreId, vvId, alias }

// Apelat din loadUserData după ce citim documentul user
function loadFounderData(userData) {
  if (!userData || !userData.isFounder) return;
  founderData = {
    isFounder: true,
    founderNum: userData.founderNum || null,
    vvCoreId:   userData.vvCoreId   || null,
    vvId:       userData.vvId       || null,
    alias:      userData.alias      || localStorage.getItem('vv_alias') || 'INSIDER'
  };
  injectFounderUI();
}

// ── INJECT FOUNDER UI în profilul existent ────────────────────
function injectFounderUI() {
  if (!founderData) return;
  // Evităm dubluri
  if (document.getElementById('vv-founder-card')) return;

  // 1. Badge ⬡ lângă numele din profil
  var nameEl = document.getElementById('profile-main-name');
  if (nameEl && !nameEl.querySelector('.founder-badge-inline')) {
    var badge = document.createElement('span');
    badge.className = 'founder-badge-inline';
    badge.innerHTML = ' ⬡';
    badge.style.cssText = 'color:#D4AF37;font-size:0.75em;vertical-align:middle;text-shadow:0 0 8px rgba(212,175,55,0.5);';
    nameEl.appendChild(badge);
  }

  // 2. Card fondator în profil — inserat după hero card balanta
  var profileScreen = document.getElementById('profile-screen');
  if (!profileScreen) return;

  // Găsim primul child după profile-header
  var heroCard = profileScreen.querySelector('[style*="VV COINS"]');
  var insertAfter = heroCard ? heroCard.parentElement : null;

  var card = document.createElement('div');
  card.id = 'vv-founder-card';
  card.style.cssText = [
    'background:linear-gradient(135deg,rgba(212,175,55,0.1),rgba(212,175,55,0.03))',
    'border:1px solid rgba(212,175,55,0.3)',
    'border-radius:22px',
    'padding:22px 20px',
    'margin-bottom:16px',
    'position:relative',
    'overflow:hidden'
  ].join(';');

  card.innerHTML = [
    // Shine top
    '<div style="position:absolute;top:0;left:10%;right:10%;height:1px;background:linear-gradient(90deg,transparent,rgba(212,175,55,0.5),transparent);"></div>',

    // Header
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;">',
      '<div>',
        '<div style="font-size:9px;color:rgba(212,175,55,0.55);letter-spacing:3px;font-weight:700;margin-bottom:4px;">VV · INNER CIRCLE</div>',
        '<div style="font-size:20px;font-weight:900;color:#fff;letter-spacing:-0.5px;">',
          '⬡ ' + (founderData.alias || 'FONDATOR'),
        '</div>',
      '</div>',
      '<div style="background:rgba(212,175,55,0.1);border:1px solid rgba(212,175,55,0.25);border-radius:10px;padding:6px 12px;text-align:center;">',
        '<div style="font-size:9px;color:rgba(212,175,55,0.6);letter-spacing:2px;font-weight:700;">FONDATOR</div>',
        '<div style="font-size:18px;font-weight:900;color:#D4AF37;">#' + (founderData.founderNum || '—') + '</div>',
        '<div style="font-size:8px;color:rgba(212,175,55,0.4);">DIN 100</div>',
      '</div>',
    '</div>',

    // Divider
    '<div style="height:1px;background:linear-gradient(90deg,rgba(212,175,55,0.3),transparent);margin-bottom:14px;"></div>',

    // VV CORE ID
    '<div style="margin-bottom:10px;">',
      '<div style="font-size:8px;color:rgba(255,255,255,0.25);letter-spacing:2px;font-weight:700;margin-bottom:4px;">VV·CORE·ID</div>',
      '<div style="font-family:Courier New,monospace;font-size:18px;font-weight:700;color:#D4AF37;letter-spacing:2px;text-shadow:0 0 10px rgba(212,175,55,0.3);">',
        founderData.vvCoreId || 'VV·CORE·----',
      '</div>',
    '</div>',

    // VV ID
    '<div style="margin-bottom:16px;">',
      '<div style="font-size:8px;color:rgba(255,255,255,0.25);letter-spacing:2px;font-weight:700;margin-bottom:4px;">VV·ID</div>',
      '<div style="display:flex;align-items:center;gap:8px;">',
        '<div style="font-family:Courier New,monospace;font-size:15px;font-weight:700;color:rgba(255,255,255,0.6);letter-spacing:1px;">',
          founderData.vvId || 'VV·ID·------',
        '</div>',
        '<div style="background:rgba(52,199,89,0.08);border:1px solid rgba(52,199,89,0.2);border-radius:20px;padding:3px 10px;font-size:8px;font-weight:700;color:#34c759;letter-spacing:1px;">',
          'ÎN FORMARE',
        '</div>',
      '</div>',
      '<div style="font-size:10px;color:rgba(255,255,255,0.2);margin-top:4px;line-height:1.5;">',
        'Identitatea ta se formează din activitate — misiuni, locații, streak-uri.',
      '</div>',
    '</div>',

    // Buton salvare card
    '<button onclick="openFounderCardSave()" style="',
      'width:100%;padding:13px;',
      'background:rgba(212,175,55,0.1);',
      'border:1px solid rgba(212,175,55,0.25);',
      'border-radius:12px;',
      'color:#D4AF37;font-family:inherit;',
      'font-size:12px;font-weight:700;',
      'cursor:pointer;letter-spacing:1px;',
    '">⬡ SALVEAZĂ CARDUL VV·CORE</button>',

  ].join('');

  // Inserăm cardul în profil — după balanta hero
  var referenceNode = profileScreen.querySelector('#onyx-progress-card');
  if (referenceNode) {
    profileScreen.insertBefore(card, referenceNode);
  } else {
    profileScreen.appendChild(card);
  }
}

// ── DESCHIDE SAVE CARD din profil ────────────────────────────
function openFounderCardSave() {
  if (!founderData) return;
  // Refolosim logica din Inner Circle — generăm canvas direct
  showFounderCardOverlay();
}

function showFounderCardOverlay() {
  var old = document.getElementById('vv-founder-save-overlay');
  if (old) old.remove();

  var overlay = document.createElement('div');
  overlay.id = 'vv-founder-save-overlay';
  overlay.style.cssText = [
    'position:fixed;inset:0;background:#000;',
    'z-index:999999;display:flex;flex-direction:column;',
    'align-items:center;justify-content:center;padding:24px;gap:16px;'
  ].join('');

  var spinner = document.createElement('div');
  spinner.id = 'founder-spinner';
  spinner.style.cssText = 'width:44px;height:44px;border:2px solid rgba(212,175,55,0.2);border-top-color:rgba(212,175,55,0.8);border-radius:50%;animation:spin .8s linear infinite;';

  var img = document.createElement('img');
  img.id = 'founder-save-img';
  img.style.cssText = 'display:none;width:100%;max-width:340px;border-radius:24px;-webkit-user-select:none;user-select:none;box-shadow:0 0 40px rgba(212,175,55,0.15);';
  img.alt = 'VV CORE Card';

  var msgEl = document.createElement('div');
  msgEl.id = 'founder-save-msg';
  msgEl.style.cssText = 'font-size:14px;color:rgba(255,255,255,0.5);text-align:center;line-height:1.7;max-width:280px;';
  msgEl.textContent = 'Se generează cardul...';

  var closeBtn = document.createElement('button');
  closeBtn.style.cssText = 'padding:12px 36px;background:transparent;border:.5px solid rgba(255,255,255,0.12);border-radius:12px;color:rgba(255,255,255,0.35);font-size:12px;cursor:pointer;font-family:inherit;display:none;min-height:44px;';
  closeBtn.textContent = '✕ Închide';
  closeBtn.onclick = function() { overlay.remove(); };

  overlay.appendChild(spinner);
  overlay.appendChild(img);
  overlay.appendChild(msgEl);
  overlay.appendChild(closeBtn);
  document.body.appendChild(overlay);

  // Generăm canvas după 100ms
  setTimeout(function() { generateFounderCanvas(img, spinner, msgEl, closeBtn); }, 100);
}

function generateFounderCanvas(imgEl, spinnerEl, msgEl, closeBtn) {
  var W = 1080, H = 1920;
  var cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  var cx = cv.getContext('2d');

  // Fundal
  var bg = cx.createLinearGradient(0,0,W,H);
  bg.addColorStop(0,'#03030a'); bg.addColorStop(0.5,'#07070f'); bg.addColorStop(1,'#03030a');
  cx.fillStyle = bg; cx.fillRect(0,0,W,H);

  // Glow ambient
  var gl = cx.createRadialGradient(0,0,0,0,0,700);
  gl.addColorStop(0,'rgba(212,175,55,0.07)'); gl.addColorStop(1,'transparent');
  cx.fillStyle = gl; cx.fillRect(0,0,W,H);

  // Card centrat
  var CX=80, CY=500, CW=W-160, CH=920, CR=48;
  var cbg = cx.createLinearGradient(CX,CY,CX+CW,CY+CH);
  cbg.addColorStop(0,'rgba(255,255,255,0.07)');
  cbg.addColorStop(1,'rgba(212,175,55,0.06)');
  rrCanvas(cx,CX,CY,CW,CH,CR); cx.fillStyle=cbg; cx.fill();
  rrCanvas(cx,CX,CY,CW,CH,CR); cx.strokeStyle='rgba(212,175,55,0.35)'; cx.lineWidth=1.5; cx.stroke();

  // Shine top card
  var csh = cx.createLinearGradient(CX,0,CX+CW,0);
  csh.addColorStop(0,'transparent'); csh.addColorStop(0.5,'rgba(212,175,55,0.55)'); csh.addColorStop(1,'transparent');
  cx.fillStyle=csh; cx.fillRect(CX+CR,CY,CW-CR*2,2);

  var PL=CX+64, y=CY+90;

  // VV
  cx.font='900 110px -apple-system,sans-serif'; cx.fillStyle='#ffffff'; cx.letterSpacing='16px';
  cx.shadowColor='rgba(255,255,255,0.15)'; cx.shadowBlur=30;
  cx.fillText('VV',PL,y); cx.shadowBlur=0; y+=28;

  // Eco
  cx.font='700 22px -apple-system,sans-serif'; cx.fillStyle='rgba(212,175,55,0.6)'; cx.letterSpacing='5px';
  cx.fillText('HYBRID UNIVERS  ·  INNER CIRCLE',PL,y); y+=44;

  // Divider
  var dv=cx.createLinearGradient(PL,0,CX+CW-64,0);
  dv.addColorStop(0,'rgba(212,175,55,0.5)'); dv.addColorStop(1,'transparent');
  cx.strokeStyle=dv; cx.lineWidth=1;
  cx.beginPath(); cx.moveTo(PL,y); cx.lineTo(CX+CW-64,y); cx.stroke(); y+=40;

  // Label
  cx.font='700 20px -apple-system,sans-serif'; cx.fillStyle='rgba(255,255,255,0.3)'; cx.letterSpacing='5px';
  cx.fillText('IDENTITATE FONDATOR',PL,y); y+=54;

  // CORE ID
  cx.font='700 56px Courier New,monospace'; cx.fillStyle='#D4AF37'; cx.letterSpacing='3px';
  cx.shadowColor='rgba(212,175,55,0.5)'; cx.shadowBlur=24;
  cx.fillText(founderData.vvCoreId||'VV·CORE·----',PL,y); cx.shadowBlur=0; y+=36;

  // Founder num
  cx.font='600 22px -apple-system,sans-serif'; cx.fillStyle='rgba(212,175,55,0.55)'; cx.letterSpacing='3px';
  cx.fillText('FONDATOR #'+(founderData.founderNum||'—')+' DIN 100',PL,y); y+=44;

  // Alias
  cx.font='700 38px -apple-system,sans-serif'; cx.fillStyle='rgba(255,255,255,0.88)'; cx.letterSpacing='1px';
  cx.fillText(founderData.alias||'INSIDER',PL,y); y+=52;

  // VV ID
  cx.font='400 22px -apple-system,sans-serif'; cx.fillStyle='rgba(255,255,255,0.35)'; cx.letterSpacing='0';
  cx.fillText(founderData.vvId||'VV·ID·------',PL,y); y+=52;

  // Motto — linie aurie stânga
  cx.strokeStyle='rgba(212,175,55,0.45)'; cx.lineWidth=4;
  var motto = '"Ești parte din ce construim. Ești parte din noi."';
  var mlines = wrapCanvasTxt(cx, motto, CW-160, 26);
  cx.beginPath(); cx.moveTo(PL,y-24); cx.lineTo(PL,y+mlines.length*38-6); cx.stroke();
  cx.font='italic 26px -apple-system,sans-serif'; cx.fillStyle='rgba(255,255,255,0.45)';
  for(var li=0;li<mlines.length;li++){cx.fillText(mlines[li],PL+20,y+li*38);} y+=mlines.length*38+44;

  // Badge NUCLEU ACTIV
  var bx=PL, by=y, bw=270, bh=46;
  rrCanvas(cx,bx,by,bw,bh,23); cx.fillStyle='rgba(52,199,89,0.1)'; cx.fill();
  rrCanvas(cx,bx,by,bw,bh,23); cx.strokeStyle='rgba(52,199,89,0.35)'; cx.lineWidth=1; cx.stroke();
  cx.beginPath(); cx.arc(bx+26,by+bh/2,6,0,Math.PI*2); cx.fillStyle='#34c759'; cx.fill();
  cx.font='700 18px -apple-system,sans-serif'; cx.fillStyle='#34c759'; cx.letterSpacing='3px';
  cx.fillText('NUCLEU ACTIV',bx+42,by+bh/2+6);

  // Footer card
  var cfy=CY+CH-50;
  cx.strokeStyle='rgba(255,255,255,0.07)'; cx.lineWidth=1;
  cx.beginPath(); cx.moveTo(CX+40,cfy); cx.lineTo(CX+CW-40,cfy); cx.stroke();
  cx.font='400 18px -apple-system,sans-serif'; cx.fillStyle='rgba(255,255,255,0.12)'; cx.letterSpacing='0';
  cx.fillText('vv-technologies.github.io',PL,CY+CH-18);
  cx.font='400 16px -apple-system,sans-serif'; cx.fillStyle='rgba(255,255,255,0.08)'; cx.textAlign='right';
  cx.fillText('Contribuție voluntară · GDPR · UE 679/2016',CX+CW-64,CY+CH-18);
  cx.textAlign='left';

  // CTA jos
  var ctaY=CY+CH+80;
  cx.font='700 28px -apple-system,sans-serif'; cx.fillStyle='rgba(212,175,55,0.5)'; cx.letterSpacing='4px';
  cx.textAlign='center'; cx.fillText('VV HYBRID UNIVERS',W/2,ctaY); ctaY+=38;
  cx.font='400 22px -apple-system,sans-serif'; cx.fillStyle='rgba(255,255,255,0.25)'; cx.letterSpacing='2px';
  cx.fillText('100 fondatori · Inner Circle',W/2,ctaY); ctaY+=38;
  cx.font='400 20px -apple-system,sans-serif'; cx.fillStyle='rgba(255,255,255,0.15)'; cx.letterSpacing='1px';
  cx.fillText('vv-technologies.github.io/vv-nexus',W/2,ctaY);
  cx.textAlign='left';

  // Afișare
  var dataUrl = cv.toDataURL('image/png');
  imgEl.src = dataUrl;
  imgEl.style.display = 'block';
  spinnerEl.style.display = 'none';

  var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if(isIOS){
    msgEl.innerHTML = '<strong style="color:rgba(212,175,55,0.85);display:block;font-size:16px;margin-bottom:6px;">Ține apăsat pe imagine ↑</strong>apoi „Adaugă în Poze"';
  } else {
    var a=document.createElement('a');
    a.download='VV-CORE-'+(founderData.vvCoreId||'card')+'.png';
    a.href=dataUrl;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    msgEl.textContent='✓ Salvat în galerie!';
  }
  closeBtn.style.display='block';
}

// Helpers canvas
function rrCanvas(ctx,x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r);
  ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y); ctx.closePath();
}
function wrapCanvasTxt(ctx,text,maxW,fs){
  ctx.font='italic '+fs+'px -apple-system,sans-serif';
  var words=text.split(' '),lines=[],line='';
  for(var i=0;i<words.length;i++){
    var test=line+(line?' ':'')+words[i];
    if(ctx.measureText(test).width>maxW&&line){lines.push(line);line=words[i];}
    else line=test;
  }
  if(line)lines.push(line);
  return lines.slice(0,4);
}

// ── MARKER FONDATOR pe hartă ─────────────────────────────────
// Înlocuiește iconița misiunilor create de fondatori cu una distinctă
function getFounderMissionIcon(reward, isFounderMission) {
  var color = isFounderMission ? 'rgba(212,175,55,0.9)' : 'rgba(255,59,48,0.85)';
  var shadow = isFounderMission ? 'rgba(212,175,55,0.5)' : 'rgba(255,59,48,0.4)';
  var emoji = isFounderMission ? '⬡' : '🎯';
  var border = isFounderMission ? 'rgba(212,175,55,0.6)' : 'rgba(255,100,80,0.6)';

  return L.divIcon({
    className: '',
    html: '<div style="' +
      'background:' + color + ';' +
      'backdrop-filter:blur(10px);' +
      '-webkit-backdrop-filter:blur(10px);' +
      'border:2px solid ' + border + ';' +
      'border-radius:50%;' +
      'width:38px;height:38px;' +
      'display:flex;align-items:center;justify-content:center;' +
      'font-size:' + (isFounderMission ? '18px' : '16px') + ';' +
      'box-shadow:0 0 16px ' + shadow + ';' +
      'animation:missionPulse 2s infinite;' +
    '">' + emoji + '</div>',
    iconSize: [38,38],
    iconAnchor: [19,19]
  });
}

// ── PATCH loadUserData — injectăm citirea founderData ─────────
// Adăugăm un listener pe onSnapshot care verifică isFounder
var _origLoadUserData = loadUserData;
loadUserData = function() {
  _origLoadUserData.apply(this, arguments);
  // Citim și founder data separat dacă nu e deja injectat
  if (currentUser && !founderData) {
    db.collection('users').doc(currentUser.uid).get().then(function(doc) {
      if (doc.exists) loadFounderData(doc.data());
    }).catch(function(){});
  }
};
