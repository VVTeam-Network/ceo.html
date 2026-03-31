// ================= FIREBASE CONFIG =================
const firebaseConfig={apiKey:"AIzaSyDGv4kEClO0RHCLvXVLOT-vyPHw6bsxYVc",authDomain:"vv-ep-beta.firebaseapp.com",projectId:"vv-ep-beta",storageBucket:"vv-ep-beta.firebasestorage.app"};
if(!firebase.apps.length){firebase.initializeApp(firebaseConfig);}
const db=firebase.firestore();const auth=firebase.auth();const storage=firebase.storage();

// ================= VARIABILE GLOBALE =================
let map=null;let currentStream=null;let targetMarker=null;let currentUser=null;
let currentSpotId=null;let selectedReward=15;let selectedTip=0;let capturedImageBlob=null;
let userCurrentLat=null;let userCurrentLng=null;
let initialLocationSet=false;
let lastGPSTime=null;let lastGPSLat=null;let lastGPSLng=null;

// ================= HAVERSINE =================
function haversineDistance(lat1,lon1,lat2,lon2){
    const R=6371000;const toRad=(d)=>d*(Math.PI/180);
    const dLat=toRad(lat2-lat1);const dLon=toRad(lon2-lon1);
    const a=Math.sin(dLat/2)*Math.sin(dLat/2)+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)*Math.sin(dLon/2);
    return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}

// ================= ANTI-CHEAT: TELEPORT DETECTION =================
function isTeleporting(newLat,newLng){
    if(!lastGPSTime||!lastGPSLat)return false;
    var now=Date.now();var dt=(now-lastGPSTime)/1000;
    if(dt<1)return false;
    var dist=haversineDistance(lastGPSLat,lastGPSLng,newLat,newLng);
    var speed=dist/dt;
    if(speed>200){console.warn('[VV] TELEPORT: '+Math.round(speed)+' m/s');return true;}
    return false;
}

// ================= ANTI-CHEAT: DEVICE ID LOCK =================
function getDeviceFingerprint(){
    var fp=localStorage.getItem('vv_device_fp');
    if(fp)return fp;
    fp='VV-'+Date.now()+'-'+Math.random().toString(36).substr(2,9)+'-'+screen.width+'x'+screen.height;
    localStorage.setItem('vv_device_fp',fp);
    return fp;
}
async function checkDeviceLock(){
    if(!currentUser)return true;
    var fp=getDeviceFingerprint();
    try{
        var doc=await db.collection('users').doc(currentUser.uid).get();
        if(!doc.exists)return true;var data=doc.data();
        if(!data.deviceId){await db.collection('users').doc(currentUser.uid).update({deviceId:fp});return true;}
        if(data.deviceId!==fp){showToast('⚠️ Contul este legat de alt dispozitiv.');return false;}
        return true;
    }catch(e){return true;}
}

// ================= BOOT =================
window.onload=function(){
    document.addEventListener('touchstart',function(e){if(e.touches[0].clientX<20||e.touches[0].clientX>window.innerWidth-20)e.preventDefault();},{passive:false});
    document.body.addEventListener('touchmove',function(e){if(e.target===document.body||e.target===document.documentElement)e.preventDefault();},{passive:false});
    try{auth.signInAnonymously().catch(function(err){console.log('[VV] anon err:',err.code);});}catch(e){}
    try{auth.onAuthStateChanged(function(user){
        if(user){currentUser=user;
            var td=localStorage.getItem('vv_premium_tutorial_done');var ak=localStorage.getItem('vv_access_key');
            if(td==='DA'&&ak){document.getElementById('splash-screen').style.display='none';document.getElementById('tutorial-screen').style.display='none';showApp();loadUserData();}
            else{document.getElementById('splash-screen').style.display='flex';}
        }
    });}catch(e){}
};
function toggleAcceptButton(){}

// ================= BOOT SEQUENCE =================
async function startBootSequence(){
    var key=document.getElementById('access-key').value.trim().toUpperCase();
    var btn=document.getElementById('btn-accept');var cb=document.getElementById('tc-checkbox');
    var ex=document.getElementById('key-error-msg');if(ex)ex.remove();
    if(!cb||!cb.checked){showKeyError('Trebuie să accepți regulamentul.');return;}
    if(!key){showKeyError('Introdu codul de acces.');return;}
    btn.textContent='SE VERIFICĂ...';btn.style.opacity='0.7';btn.style.pointerEvents='none';
    try{
        var snap=await db.collection('access_keys').where('key','==',key).where('active','==',true).get();
        if(snap.empty){var s2=await db.collection('access_keys').where('key','==',key).get();throw new Error(s2.empty?'Cod invalid: '+key:'Cod dezactivat.');}
        localStorage.setItem('vv_access_key',key);
        if(!currentUser){btn.textContent='SE CONECTEAZĂ...';var cred=await auth.signInAnonymously();currentUser=cred.user;}
        btn.textContent='ACCES ACORDAT ✓';btn.style.background='rgba(52,199,89,0.9)';btn.style.color='#000';btn.style.opacity='1';
        setTimeout(function(){document.getElementById('splash-screen').style.display='none';document.getElementById('alias-screen').style.display='flex';},500);
    }catch(err){
        btn.textContent='VERIFICĂ & INTRĂ';btn.style.opacity='1';btn.style.pointerEvents='auto';btn.style.background='';btn.style.color='';
        showKeyError('❌ '+(err.message||JSON.stringify(err)));
    }
}
function showKeyError(msg){var ex=document.getElementById('key-error-msg');if(ex)ex.remove();var e=document.createElement('div');e.id='key-error-msg';e.style.cssText='color:#ff3b30;font-size:14px;text-align:center;margin-top:10px;margin-bottom:10px;font-weight:700;width:100%;max-width:390px;padding:10px 14px;background:rgba(255,59,48,0.1);border:1px solid rgba(255,59,48,0.3);border-radius:10px;line-height:1.4;word-break:break-all;';e.textContent='⚠️ '+msg;var ki=document.getElementById('access-key');if(ki&&ki.parentNode)ki.parentNode.insertBefore(e,ki.nextSibling);}

// ================= ALIAS =================
function confirmAlias(){
    var alias=document.getElementById('user-alias-input').value.trim();
    if(!alias||alias.length<2){showToast('Alege un nume de explorator valid!');return;}
    localStorage.setItem('vv_alias',alias);
    auth.signInAnonymously().then(async function(cred){
        currentUser=cred.user;var chars='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        var gk=function(){return Array.from({length:6},function(){return chars[Math.floor(Math.random()*chars.length)]}).join('');};
        var uKeys=[gk(),gk(),gk()];var fp=getDeviceFingerprint();
        await db.collection('users').doc(cred.user.uid).set({alias:alias,balance:100,stars:5.0,rating:5,joinedAt:firebase.firestore.FieldValue.serverTimestamp(),accessKey:localStorage.getItem('vv_access_key'),inviteKeys:uKeys,keysBalance:3,deviceId:fp});
        var batch=db.batch();uKeys.forEach(function(k){var r=db.collection('access_keys').doc();batch.set(r,{key:k,active:true,generatedBy:cred.user.uid,generatedByAlias:alias,createdAt:firebase.firestore.FieldValue.serverTimestamp(),used:false});});
        await batch.commit();
    }).then(function(){document.getElementById('alias-screen').style.display='none';document.getElementById('tutorial-screen').style.display='flex';})
    .catch(function(){document.getElementById('alias-screen').style.display='none';document.getElementById('tutorial-screen').style.display='flex';});
}

// ================= TUTORIAL =================
function nextTutorial(s){document.querySelectorAll('.tutorial-card').forEach(function(c){c.classList.remove('active');});var card=document.getElementById('tut-'+s);if(card)card.classList.add('active');}
function finishTutorial(){localStorage.setItem('vv_premium_tutorial_done','DA');document.getElementById('tutorial-screen').style.display='none';showApp();loadUserData();}

// ================= SHOW APP =================
function showApp(){var a=document.getElementById('app-container');var d=document.getElementById('main-dock');a.style.display='block';d.style.display='flex';setTimeout(function(){a.style.opacity='1';},50);initMap();}

// ================= SILENT LOGIN =================
var lastActiveUpdated=false;
function silentLogin(){var c=auth.currentUser;if(c){currentUser=c;if(!lastActiveUpdated){lastActiveUpdated=true;db.collection('users').doc(c.uid).update({lastActive:firebase.firestore.FieldValue.serverTimestamp()}).catch(function(){});}loadUserData();return;}auth.signInAnonymously().then(function(cr){currentUser=cr.user;if(!lastActiveUpdated){lastActiveUpdated=true;db.collection('users').doc(cr.user.uid).update({lastActive:firebase.firestore.FieldValue.serverTimestamp()}).catch(function(){});}loadUserData();}).catch(function(){});}

// ================= LOAD USER DATA =================
var userDataListener=null;
function loadUserData(){
    var alias=localStorage.getItem('vv_alias')||'EXPLORER';
    var ne=document.getElementById('profile-main-name');if(ne)ne.textContent=alias;
    var he=document.getElementById('hud-balance');if(he&&he.textContent==='— VV')he.textContent='... VV';
    if(!currentUser){setTimeout(loadUserData,1000);return;}
    checkDeviceLock();
    var uid=currentUser.uid;var uRef=db.collection('users').doc(uid);
    uRef.get().then(function(doc){if(!doc.exists)return uRef.set({alias:alias,balance:100,stars:5.0,rating:5,joinedAt:firebase.firestore.FieldValue.serverTimestamp(),accessKey:localStorage.getItem('vv_access_key')||'',lastActive:firebase.firestore.FieldValue.serverTimestamp(),deviceId:getDeviceFingerprint()});})
    .then(function(){
        if(userDataListener){userDataListener();userDataListener=null;}
        userDataListener=uRef.onSnapshot(function(doc){
            if(!doc.exists)return;var d=doc.data();var bal=typeof d.balance==='number'?d.balance:0;
            var stars=typeof d.stars==='number'?d.stars:5.0;
            var h2=document.getElementById('hud-balance');var vv=document.getElementById('profile-vv-val');var le=document.getElementById('profile-lei-val');var n2=document.getElementById('profile-main-name');
            if(h2)h2.textContent=bal+' VV';if(vv)vv.textContent=bal;if(le)le.textContent=(bal*0.5).toFixed(2);if(n2)n2.textContent=d.alias||alias;
            var starsEl=document.getElementById('profile-stars');if(starsEl)starsEl.textContent='★ '+stars.toFixed(1);
            updateOnyxProgress(bal);
        },function(err){if(err.code==='permission-denied')setTimeout(loadUserData,3000);});
    }).catch(function(){setTimeout(loadUserData,2000);});
    listenInbox();loadInviteKeys();loadLeaderboard();
}

// ================= LEADERBOARD =================
function loadLeaderboard(){db.collection('users').orderBy('balance','desc').limit(10).onSnapshot(function(snap){var c=document.getElementById('leaderboard-container');if(!c)return;c.innerHTML='';var r=1;snap.forEach(function(doc){var u=doc.data();var me=doc.id===(currentUser?currentUser.uid:null);var medals=['🥇','🥈','🥉'];var medal=r<=3?medals[r-1]:'#'+r;var stars=typeof u.stars==='number'?u.stars:5.0;c.innerHTML+='<div style="display:flex;align-items:center;gap:12px;padding:12px 16px;background:'+(me?'rgba(212,175,55,0.08)':'rgba(255,255,255,0.03)')+';border:1px solid '+(me?'rgba(212,175,55,0.2)':'rgba(255,255,255,0.06)')+';border-radius:12px;margin-bottom:8px;"><span style="font-size:18px;width:28px;text-align:center;">'+medal+'</span><div style="flex:1;"><div style="font-size:13px;font-weight:700;color:'+(me?'#D4AF37':'#fff')+';">'+(u.alias||'EXPLORER')+(me?' · Tu':'')+'</div><div style="font-size:10px;color:rgba(255,255,255,0.3);margin-top:2px;">★ '+stars.toFixed(1)+'</div></div><div style="font-size:14px;font-weight:900;color:'+(me?'#D4AF37':'rgba(255,255,255,0.6)')+';">'+u.balance+' VV</div></div>';r++;});});}

// ================= INVITE KEYS =================
function loadInviteKeys(){if(!currentUser)return;db.collection('users').doc(currentUser.uid).get().then(function(doc){if(!doc.exists)return;var keys=doc.data().inviteKeys||[];var c=document.getElementById('invite-keys-container');if(!c)return;if(keys.length===0){c.innerHTML='<div style="font-size:12px;color:rgba(255,255,255,0.3);">Nicio acreditare disponibilă.</div>';return;}c.innerHTML=keys.map(function(k){return'<div style="display:flex;justify-content:space-between;align-items:center;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px 16px;margin-bottom:8px;"><span style="font-family:monospace;font-size:16px;font-weight:700;color:#fff;letter-spacing:2px;">'+k+'</span><button onclick="copyKey(\''+k+'\')" style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:6px 12px;color:rgba(255,255,255,0.6);font-size:11px;font-weight:700;cursor:pointer;">COPIAZĂ</button></div>';}).join('');});}
function copyKey(k){navigator.clipboard.writeText(k).then(function(){showToast('Acreditare copiată! 🎯');}).catch(function(){showToast('Cod: '+k);});}

// ================= ONYX PROGRESS =================
function updateOnyxProgress(bal){var ms=[500,1000,1500];var nm=ms.find(function(m){return bal<m;})||1500;var pm=nm===500?0:ms[ms.indexOf(nm)-1];var p=Math.min(((bal-pm)/(nm-pm))*100,100);var bar=document.getElementById('onyx-progress-bar');var lab=document.getElementById('onyx-progress-label');if(bar)bar.style.width=p+'%';if(lab)lab.textContent=bal+' / '+nm+' VV';ms.forEach(function(m){var ch=document.getElementById('check-'+m);var mi=document.getElementById('milestone-'+m);if(!ch||!mi)return;if(bal>=m){ch.textContent='✅';ch.style.color='#34c759';mi.style.opacity='1';}else if(m===nm){ch.textContent=Math.round(p)+'%';ch.style.color='#D4AF37';mi.style.opacity='1';}else{ch.textContent='—';ch.style.color='rgba(212,175,55,0.3)';mi.style.opacity='0.5';}});}

// ================= MAP — EXPLORATION MODE (FREE) =================
function initMap(){
    if(map)return;
    map=L.map('map',{zoomControl:false}).setView([44.4325,26.1038],14);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{attribution:'',maxZoom:19,detectRetina:true}).addTo(map);
    var rb=L.latLngBounds(L.latLng(43.5,20.0),L.latLng(48.5,30.5));map.setMaxBounds(rb);map.options.minZoom=6;
    map.locate({setView:false,enableHighAccuracy:true,watch:true});
    var userMarker=null;
    map.on('locationfound',function(e){
        var nLat=e.latlng.lat;var nLng=e.latlng.lng;
        if(isTeleporting(nLat,nLng)){showToast('⚠️ GPS instabil.');return;}
        lastGPSTime=Date.now();lastGPSLat=nLat;lastGPSLng=nLng;
        userCurrentLat=nLat;userCurrentLng=nLng;
        if(!userMarker){userMarker=L.circleMarker(e.latlng,{radius:8,fillColor:"#fff",color:"rgba(255,255,255,0.25)",weight:10,opacity:1,fillOpacity:1}).addTo(map);}
        else{userMarker.setLatLng(e.latlng);}
        if(!initialLocationSet){initialLocationSet=true;map.setView(e.latlng,15,{animate:true});}
    });
    map.on('locationerror',function(err){console.warn('[VV] GPS:',err.message);});
    map.on('click',async function(e){
        if(targetMarker)map.removeLayer(targetMarker);
        var ci=L.divIcon({className:'target-crosshair',html:'<div class="crosshair-center"></div>',iconSize:[40,40],iconAnchor:[20,20]});
        targetMarker=L.marker(e.latlng,{icon:ci}).addTo(map);
        targetMarker.bindPopup('<div style="text-align:center;padding:4px;min-width:160px;"><div style="font-size:10px;color:rgba(255,255,255,0.3);letter-spacing:2px;font-weight:700;">SE SCANEAZĂ...</div></div>',{closeButton:false,className:'dark-popup'}).openPopup();
        var locName='Locație necunoscută';
        try{var r=await fetch('https://nominatim.openstreetmap.org/reverse?format=json&lat='+e.latlng.lat+'&lon='+e.latlng.lng,{headers:{'Accept-Language':'ro'}});var d=await r.json();if(d&&d.address)locName=d.address.road||d.address.pedestrian||d.address.neighbourhood||d.address.suburb||d.display_name||'Locație necunoscută';}catch(er){}
        targetMarker.getPopup().setContent('<div style="text-align:center;padding:4px;min-width:160px;"><div style="font-size:9px;color:rgba(255,255,255,0.35);margin-bottom:5px;font-weight:700;letter-spacing:2px;">SPOT NOU</div><div style="font-size:13px;color:#fff;font-weight:800;margin-bottom:10px;line-height:1.3;">'+locName+'</div><button onclick="map.closePopup();openCreateSpotModal('+e.latlng.lat+','+e.latlng.lng+');" style="background:rgba(255,255,255,0.92);color:#000;border:none;padding:11px 16px;border-radius:10px;font-weight:800;font-size:12px;cursor:pointer;width:100%;">LANSEAZĂ SPOT</button></div>');
    });
    loadSpotsOnMap();initSearchBar();
    setTimeout(function(){if(map)map.invalidateSize();},400);
}

// ================= SEARCH BAR =================
var searchDebounceTimer=null;
function initSearchBar(){var inp=document.getElementById('vv-search-input');var cb=document.getElementById('vv-search-clear');if(!inp)return;inp.addEventListener('input',function(){var q=this.value.trim();if(cb)cb.style.display=q.length>0?'flex':'none';clearTimeout(searchDebounceTimer);if(q.length<3){hideSearchResults();return;}searchDebounceTimer=setTimeout(function(){searchNominatim(q);},400);});document.addEventListener('click',function(e){var c=document.getElementById('vv-search-container');if(c&&!c.contains(e.target))hideSearchResults();});}
async function searchNominatim(q){var re=document.getElementById('vv-search-results');var lo=document.getElementById('vv-search-loading');if(!re)return;re.style.display='none';if(lo)lo.style.display='block';try{var r=await fetch('https://nominatim.openstreetmap.org/search?format=json&q='+encodeURIComponent(q)+'&limit=5&countrycodes=ro&addressdetails=1&accept-language=ro',{headers:{'Accept-Language':'ro'}});var d=await r.json();if(lo)lo.style.display='none';if(!d||d.length===0){re.innerHTML='<div style="padding:20px;text-align:center;font-size:12px;color:rgba(255,255,255,0.3);">Nicio locație găsită</div>';re.style.display='block';return;}re.innerHTML=d.map(function(i){var n=i.address?(i.address.road||i.address.pedestrian||i.address.neighbourhood||i.name||i.display_name.split(',')[0]):i.display_name.split(',')[0];var a=i.display_name.split(',').slice(0,3).join(',');var sn=n.replace(/'/g,"\\'").replace(/"/g,'&quot;');return'<div class="vv-search-result-item" onclick="selectSearchResult('+i.lat+','+i.lon+',\''+sn+'\')"><div class="vv-search-result-icon"><i class="fas fa-map-pin"></i></div><div class="vv-search-result-text"><div class="vv-search-result-name">'+n+'</div><div class="vv-search-result-address">'+a+'</div></div></div>';}).join('');re.style.display='block';}catch(er){if(lo)lo.style.display='none';re.innerHTML='<div style="padding:20px;text-align:center;font-size:12px;color:rgba(255,255,255,0.3);">Eroare conexiune</div>';re.style.display='block';}}
function selectSearchResult(lat,lng,name){hideSearchResults();var inp=document.getElementById('vv-search-input');if(inp)inp.value=name;var cb=document.getElementById('vv-search-clear');if(cb)cb.style.display='flex';if(targetMarker)map.removeLayer(targetMarker);map.flyTo([lat,lng],17,{duration:1.5,easeLinearity:0.25});setTimeout(function(){var ci=L.divIcon({className:'target-crosshair',html:'<div class="crosshair-center"></div>',iconSize:[40,40],iconAnchor:[20,20]});targetMarker=L.marker([lat,lng],{icon:ci}).addTo(map);targetMarker.bindPopup('<div style="text-align:center;padding:4px;min-width:160px;"><div style="font-size:9px;color:rgba(255,255,255,0.35);margin-bottom:5px;font-weight:700;letter-spacing:2px;">SPOT NOU</div><div style="font-size:13px;color:#fff;font-weight:800;margin-bottom:10px;line-height:1.3;">'+name+'</div><button onclick="map.closePopup();openCreateSpotModal('+lat+','+lng+');" style="background:rgba(255,255,255,0.92);color:#000;border:none;padding:11px 16px;border-radius:10px;font-weight:800;font-size:12px;cursor:pointer;width:100%;">LANSEAZĂ SPOT</button></div>',{closeButton:false,className:'dark-popup'}).openPopup();},1600);}
function clearSearch(){var i=document.getElementById('vv-search-input');var c=document.getElementById('vv-search-clear');if(i)i.value='';if(c)c.style.display='none';hideSearchResults();}
function hideSearchResults(){var r=document.getElementById('vv-search-results');var l=document.getElementById('vv-search-loading');if(r)r.style.display='none';if(l)l.style.display='none';}

// ================= SPOTS ON MAP =================
var spotMarkers={};var spotsListenerActive=false;
function loadSpotsOnMap(){if(!map||spotsListenerActive)return;spotsListenerActive=true;var now=new Date();
db.collection('missions').where('status','==','open').onSnapshot(function(snap){snap.docChanges().forEach(function(ch){var doc=ch.doc;var m=doc.data();
if(ch.type==='removed'){if(spotMarkers[doc.id]){try{map.removeLayer(spotMarkers[doc.id]);}catch(e){}delete spotMarkers[doc.id];}return;}
if(ch.type==='modified'&&spotMarkers[doc.id]){try{map.removeLayer(spotMarkers[doc.id]);}catch(e){}delete spotMarkers[doc.id];}
if(m.status!=='open'||!m.lat||!m.lng)return;if(m.expiresAt&&m.expiresAt.toDate()<now)return;
var ml=m.expiresAt?Math.max(0,Math.round((m.expiresAt.toDate()-now)/60000)):null;
var icon=L.divIcon({className:'',html:'<div style="background:rgba(255,59,48,0.85);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border:2px solid rgba(255,100,80,0.6);border-radius:50%;width:38px;height:38px;display:flex;align-items:center;justify-content:center;font-size:16px;box-shadow:0 0 16px rgba(255,59,48,0.4);animation:missionPulse 2s infinite;">📍</div>',iconSize:[38,38],iconAnchor:[19,19]});
var marker=L.marker([m.lat,m.lng],{icon:icon,zIndexOffset:1000}).addTo(map);
var isMine=m.createdBy===(currentUser?currentUser.uid:null);
if(isMine){marker.bindPopup('<div style="padding:4px;min-width:200px;"><div style="font-size:10px;color:#D4AF37;margin-bottom:5px;letter-spacing:2px;font-weight:700;">SPOT-UL TĂU</div><div style="font-size:14px;color:#fff;font-weight:800;margin-bottom:6px;">'+(m.description||'Vibe Check')+'</div><div style="display:flex;justify-content:space-between;margin-bottom:12px;"><span style="font-size:12px;color:rgba(255,255,255,0.5);">Recompensă</span><span style="font-size:13px;color:#fff;font-weight:900;">'+m.reward+' VV</span></div><div style="background:rgba(52,199,89,0.1);border:1px solid rgba(52,199,89,0.2);border-radius:8px;padding:8px;text-align:center;margin-bottom:10px;"><span style="font-size:11px;color:#34c759;">⏳ Se caută explorator...</span></div><button onclick="map.closePopup();cancelMySpot(\''+doc.id+'\','+m.reward+');" style="background:rgba(255,59,48,0.1);color:#ff3b30;border:1px solid rgba(255,59,48,0.3);padding:10px;border-radius:10px;font-weight:700;font-size:12px;cursor:pointer;width:100%;">ANULEAZĂ & RECUPEREAZĂ '+m.reward+' VV</button></div>',{closeButton:false,className:'dark-popup'});}
else{marker.bindPopup('<div style="padding:4px;min-width:190px;"><div style="font-size:10px;color:rgba(255,59,48,0.8);margin-bottom:6px;letter-spacing:2px;font-weight:700;">SPOT ACTIV</div><div style="font-size:14px;color:#fff;font-weight:800;margin-bottom:8px;">'+(m.description||'Vibe Check cerut')+'</div><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;"><span style="font-size:13px;color:#fff;font-weight:900;">'+m.reward+' VV</span>'+(ml!==null?'<span style="font-size:11px;color:rgba(255,255,255,0.4);">⏱ '+ml+' min</span>':'')+'</div><button onclick="map.closePopup();acceptSpot(\''+doc.id+'\');" style="background:rgba(255,255,255,0.92);color:#000;border:none;padding:12px;border-radius:10px;font-weight:800;font-size:12px;cursor:pointer;width:100%;">ACCEPTĂ SPOT</button></div>',{closeButton:false,className:'dark-popup'});}
spotMarkers[doc.id]=marker;});});}

// ================= CREATE SPOT =================
var spotLat=null,spotLng=null;
function openCreateSpotModal(lat,lng){spotLat=lat;spotLng=lng;openModal('create-mission-modal');}
function selectReward(v){selectedReward=v;document.querySelectorAll('.reward-btn[id^="rew-btn"]').forEach(function(b){b.classList.remove('active');});var b=document.getElementById('rew-btn-'+v);if(b)b.classList.add('active');}

// ================= SUBMIT SPOT — 100m MIN =================
async function submitPinpointMission(){
    var desc=document.getElementById('mission-desc').value.trim();
    if(!desc){showToast('Descrie ce vrei să afli!');return;}
    if(!currentUser){try{var cr=await auth.signInAnonymously();currentUser=cr.user;}catch(e){showToast('Eroare.');return;}}
    var lb=document.getElementById('btn-launch-radar');lb.textContent='SE VERIFICĂ GPS...';lb.style.opacity='0.6';lb.style.pointerEvents='none';
    try{
        var fp=await new Promise(function(resolve,reject){if(navigator.geolocation){navigator.geolocation.getCurrentPosition(function(p){resolve({lat:p.coords.latitude,lng:p.coords.longitude});},function(er){if(userCurrentLat!==null)resolve({lat:userCurrentLat,lng:userCurrentLng});else reject(er);},{enableHighAccuracy:true,timeout:8000,maximumAge:5000});}else if(userCurrentLat!==null)resolve({lat:userCurrentLat,lng:userCurrentLng});else reject(new Error('GPS'));});
        var tLat=parseFloat(spotLat)||44.4325;var tLng=parseFloat(spotLng)||26.1038;
        var dist=haversineDistance(fp.lat,fp.lng,tLat,tLng);
        if(dist<100){showToast('⚠️ Prea aproape ('+Math.round(dist)+'m). Min: 100m.');lb.textContent='LANSEAZĂ SPOT';lb.style.opacity='1';lb.style.pointerEvents='auto';return;}
    }catch(ge){}
    lb.textContent='SE LANSEAZĂ...';var exMin=Math.round((selectedReward*1.5)+5);var exAt=new Date(Date.now()+exMin*60*1000);
    try{
        var doc=await db.collection('users').doc(currentUser.uid).get();var bal=(doc.data()?doc.data().balance:0)||0;
        if(bal<selectedReward){showToast('VV insuficienți! Ai '+bal+' VV.');lb.textContent='LANSEAZĂ SPOT';lb.style.opacity='1';lb.style.pointerEvents='auto';return;}
        var batch=db.batch();var mRef=db.collection('missions').doc();lastCreatedSpotId=mRef.id;
        batch.set(mRef,{description:desc,reward:selectedReward,lat:spotLat||44.4325,lng:spotLng||26.1038,createdBy:currentUser.uid,createdAt:firebase.firestore.FieldValue.serverTimestamp(),expiresAt:firebase.firestore.Timestamp.fromDate(exAt),expiryMinutes:exMin,status:'open'});
        batch.update(db.collection('users').doc(currentUser.uid),{balance:firebase.firestore.FieldValue.increment(-selectedReward)});
        await batch.commit();closeModal('create-mission-modal');document.getElementById('mission-desc').value='';lb.textContent='LANSEAZĂ SPOT';lb.style.opacity='1';lb.style.pointerEvents='auto';showExplorerSearch(selectedReward);
    }catch(err){showToast('Eroare.');lb.textContent='LANSEAZĂ SPOT';lb.style.opacity='1';lb.style.pointerEvents='auto';}
}

// ================= SPOTS LIST =================
function openMissionsList(){openModal('missions-list-modal');var c=document.getElementById('missions-container');c.innerHTML='<div style="color:rgba(255,255,255,0.3);text-align:center;padding:30px;font-size:13px;">Se încarcă...</div>';db.collection('missions').where('status','==','open').limit(20).get().then(function(snap){if(snap.empty){c.innerHTML='<div style="color:rgba(255,255,255,0.3);text-align:center;padding:30px;font-size:13px;">Niciun spot activ.</div>';return;}c.innerHTML='';var now=new Date();snap.forEach(function(doc){var m=doc.data();if(m.expiresAt&&m.expiresAt.toDate()<now)return;var d=document.createElement('div');d.style.cssText='background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:16px;margin-bottom:12px;cursor:pointer;';d.innerHTML='<div style="font-size:13px;color:#fff;font-weight:700;margin-bottom:6px;">'+(m.description||'Spot activ')+'</div><div style="display:flex;justify-content:space-between;"><span style="font-size:12px;color:rgba(255,255,255,0.4);">Recompensă</span><span style="font-size:14px;color:#fff;font-weight:800;">'+m.reward+' VV</span></div>';d.onclick=function(){acceptSpot(doc.id);};c.appendChild(d);});}).catch(function(){c.innerHTML='<div style="color:rgba(255,255,255,0.3);text-align:center;padding:30px;">Eroare.</div>';});}

// ================= CANCEL SPOT =================
var isCancelling=false;var lastCreatedSpotId=null;
async function cancelMySpot(mid,rew){if(!currentUser||isCancelling)return;if(!confirm('Anulezi spot-ul și recuperezi '+rew+' VV?'))return;isCancelling=true;try{var b=db.batch();b.delete(db.collection('missions').doc(mid));b.update(db.collection('users').doc(currentUser.uid),{balance:firebase.firestore.FieldValue.increment(rew)});await b.commit();if(spotMarkers[mid]){try{map.removeLayer(spotMarkers[mid]);}catch(e){}delete spotMarkers[mid];}showToast('✅ +'+rew+' VV recuperați.');}catch(e){showToast('Eroare: '+e.message);}finally{isCancelling=false;}}

// ================= SPOT RESULT =================
async function openMissionResult(mid){try{var snap=await db.collection('inbox').where('missionId','==',mid).limit(1).get();var modal=document.createElement('div');modal.id='mission-result-modal';modal.style.cssText='position:fixed;inset:0;z-index:99998;background:rgba(0,0,0,0.85);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);display:flex;align-items:center;justify-content:center;';var ph='<div style="color:rgba(255,255,255,0.3);text-align:center;padding:30px;">Se procesează...</div>';if(!snap.empty){var d=snap.docs[0].data();if(d.photoUrl)ph='<img src="'+d.photoUrl+'" style="width:100%;border-radius:12px;" />';}modal.innerHTML='<div style="background:rgba(10,10,14,0.98);border:1px solid rgba(255,255,255,0.1);border-radius:24px;padding:24px;width:90%;max-width:360px;"><div style="font-size:16px;font-weight:800;color:#fff;margin-bottom:16px;">VV PROOF</div>'+ph+'<button onclick="document.getElementById(\'mission-result-modal\').remove();" style="width:100%;margin-top:16px;padding:14px;border-radius:12px;background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.5);border:1px solid rgba(255,255,255,0.08);font-weight:700;cursor:pointer;">ÎNCHIDE</button></div>';document.body.appendChild(modal);}catch(e){showToast('Eroare.');}}

// ================= ACCEPT SPOT =================
async function acceptSpot(mid){if(!currentUser){showToast('Conectează-te!');return;}if(currentSpotId){showToast('⚠️ Termină spot-ul activ!');return;}try{var md=await db.collection('missions').doc(mid).get();if(md.exists&&md.data().createdBy===currentUser.uid){showToast('❌ Nu poți accepta spot-uri proprii!');return;}}catch(e){}currentSpotId=mid;closeModal('missions-list-modal');showToast('Spot acceptat! Trimite dovada 📸');openCamera();}

// ================= INBOX + REPORT =================
function openInbox(){openModal('inbox-modal');}
function listenInbox(){if(!currentUser)return;db.collection('inbox').where('to','==',currentUser.uid).limit(20).onSnapshot(function(snap){var badge=document.getElementById('inbox-badge');var unread=0;var c=document.getElementById('inbox-container');c.innerHTML='';if(snap.empty){c.innerHTML='<div style="color:rgba(255,255,255,0.3);text-align:center;padding:30px;font-size:13px;">Niciun mesaj.</div>';badge.textContent='0';badge.style.display='none';return;}
snap.forEach(function(doc){var msg=doc.data();if(msg.status==='reported')return;if(!msg.read)unread++;var div=document.createElement('div');div.style.cssText='background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:16px;margin-bottom:12px;';var btns='';if(msg.reward){btns='<button onclick="approveUpdate(\''+doc.id+'\','+msg.reward+',\''+msg.from+'\');" style="background:rgba(255,255,255,0.9);color:#000;border:none;padding:10px;border-radius:10px;font-weight:800;font-size:12px;cursor:pointer;width:100%;">APROBĂ +'+msg.reward+' VV</button><button class="btn-report-fake" onclick="reportFake(\''+doc.id+'\','+msg.reward+');">🚩 RAPORTEAZĂ FAKE</button>';}div.innerHTML='<div style="font-size:11px;color:rgba(255,255,255,0.3);margin-bottom:6px;letter-spacing:1px;">UPDATE SPOT</div><div style="font-size:13px;color:#fff;margin-bottom:8px;">'+(msg.message||'')+'</div>'+(msg.photoUrl?'<img src="'+msg.photoUrl+'" style="width:100%;border-radius:10px;margin-bottom:8px;" />':'')+btns;c.appendChild(div);doc.ref.update({read:true});});badge.textContent=unread;badge.style.display=unread>0?'flex':'none';});}
async function approveUpdate(iid,rew,fid){if(!currentUser)return;try{await db.collection('users').doc(fid).update({balance:firebase.firestore.FieldValue.increment(rew)});await db.collection('inbox').doc(iid).update({reward:0,status:'approved'});showToast('+'+rew+' VV trimis! ✅');}catch(e){showToast('Eroare.');}}
async function reportFake(iid,rew){if(!currentUser)return;if(!confirm('Raportezi ca FAKE? Recuperezi '+rew+' VV.'))return;try{var b=db.batch();b.update(db.collection('users').doc(currentUser.uid),{balance:firebase.firestore.FieldValue.increment(rew)});b.update(db.collection('inbox').doc(iid),{status:'reported',reportedAt:firebase.firestore.FieldValue.serverTimestamp(),reportedBy:currentUser.uid,reward:0});await b.commit();showToast('🚩 Raportat! +'+rew+' VV.');}catch(e){showToast('Eroare.');}}

// ================= TIPS — SISTEM 3-6-9 =================
function selectTip(v){selectedTip=v;document.querySelectorAll('.reward-btn[id^="tip-btn"]').forEach(function(b){b.classList.remove('active');});var b=document.getElementById('tip-btn-'+v);if(b)b.classList.add('active');}
function finalizeApprovalWithTips(){var ct=parseInt(document.getElementById('custom-tip').value)||selectedTip;showToast('Tip de '+ct+' VV trimis!');closeModal('tips-modal');}

// ================= SETTINGS =================
function openSettings(){openModal('settings-modal');}
function logoutUser(){localStorage.removeItem('vv_premium_tutorial_done');localStorage.removeItem('vv_access_key');localStorage.removeItem('vv_alias');auth.signOut().then(function(){location.reload();});}

// ================= CLEAN BETA (ADMIN) =================
async function cleanBetaData(){var pw=prompt("Scrie: RESET");if(pw!=="RESET"){showToast('Anulat.');return;}showToast('Se curăță...');try{var cols=['missions','photos','inbox'];for(var i=0;i<cols.length;i++){var s=await db.collection(cols[i]).get();var b=db.batch();s.forEach(function(d){b.delete(d.ref);});if(!s.empty)await b.commit();}if(spotMarkers){Object.values(spotMarkers).forEach(function(m){try{map.removeLayer(m);}catch(e){}});Object.keys(spotMarkers).forEach(function(k){delete spotMarkers[k];});}showToast('✅ Curat!');setTimeout(function(){location.reload();},2000);}catch(e){showToast('Eroare.');}}

// ================= TABS =================
function switchTab(t){var mv=document.getElementById('map-view');var pv=document.getElementById('profile-screen');var tm=document.getElementById('tab-map');var tp=document.getElementById('tab-profile');if(t==='map'){mv.style.display='block';pv.style.display='none';tm.classList.add('active');tp.classList.remove('active');setTimeout(function(){if(map)map.invalidateSize();},100);}else{mv.style.display='none';pv.style.display='block';tm.classList.remove('active');tp.classList.add('active');}}

// ================= MODALS =================
function openModal(id){var m=document.getElementById(id);if(m)m.style.display='flex';}
function closeModal(id){var m=document.getElementById(id);if(m)m.style.display='none';}

// ================= TOAST =================
function showToast(msg){var t=document.getElementById('vv-toast');if(!t){t=document.createElement('div');t.id='vv-toast';t.style.cssText='position:fixed;bottom:110px;left:50%;transform:translateX(-50%) translateY(10px);background:rgba(255,255,255,0.12);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,0.15);color:#fff;padding:12px 22px;border-radius:30px;font-size:13px;font-weight:600;z-index:999999;opacity:0;transition:all 0.3s cubic-bezier(0.16,1,0.3,1);white-space:nowrap;pointer-events:none;max-width:90vw;overflow:hidden;text-overflow:ellipsis;';document.body.appendChild(t);}t.textContent=msg;t.style.opacity='1';t.style.transform='translateX(-50%) translateY(0)';clearTimeout(t._timeout);t._timeout=setTimeout(function(){t.style.opacity='0';t.style.transform='translateX(-50%) translateY(10px)';},3200);}

// ================= EXPLORER SEARCH OVERLAY =================
var explorerSearchTimer=null;
async function showExplorerSearch(rew){var bar=document.getElementById('insider-search-bar');var st=document.getElementById('insider-search-text');var ct=document.getElementById('insider-count-text');var rt=document.getElementById('insider-reward-text');if(!bar)return;bar.style.display='flex';bar.style.opacity='0';setTimeout(function(){bar.style.transition='opacity 0.3s ease';bar.style.opacity='1';},50);if(rt)rt.textContent=rew+' VV';var msgs=['SE CAUTĂ EXPLORATOR...','SE SCANEAZĂ ZONA...','CONNECTING...','EXPLORATOR GĂSIT! 🎯'];var mi=0;var mt=setInterval(function(){if(st&&mi<msgs.length-1){mi++;st.textContent=msgs[mi];}else clearInterval(mt);},1200);try{var fma=new Date(Date.now()-15*60*1000);var snap=await db.collection('users').where('lastActive','>',fma).get();if(snap.size>=2){if(ct)ct.textContent=snap.size+' exploratori activi';}else{if(ct)ct.textContent='Se caută exploratori...';}}catch(e){if(ct)ct.textContent='Se caută...';}clearTimeout(explorerSearchTimer);explorerSearchTimer=setTimeout(function(){hideExplorerSearch();},6000);}
async function cancelFromSearchOverlay(){hideExplorerSearch();if(!lastCreatedSpotId){showToast('Nimic de anulat.');return;}var mid=lastCreatedSpotId;lastCreatedSpotId=null;try{var md=await db.collection('missions').doc(mid).get();var rew=selectedReward;if(md.exists)rew=md.data().reward||selectedReward;var b=db.batch();b.delete(db.collection('missions').doc(mid));b.update(db.collection('users').doc(currentUser.uid),{balance:firebase.firestore.FieldValue.increment(rew)});await b.commit();if(spotMarkers[mid]){try{map.removeLayer(spotMarkers[mid]);}catch(e){}delete spotMarkers[mid];}showToast('✅ +'+rew+' VV recuperați.');}catch(e){showToast('Eroare.');}}
function hideExplorerSearch(){var b=document.getElementById('insider-search-bar');if(!b)return;b.style.transition='opacity 0.3s ease';b.style.opacity='0';setTimeout(function(){b.style.display='none';},300);clearTimeout(explorerSearchTimer);}

// ================= CAMERA — LIVE ONLY, ZERO GALERIE =================
function openCamera(){var cam=document.getElementById('camera-screen');cam.style.display='flex';document.getElementById('post-photo-menu').style.display='none';document.getElementById('shutter-container').style.display='flex';capturedImageBlob=null;capturedGPS=null;var op=document.getElementById('preview-img');if(op)op.remove();var v=document.getElementById('real-camera-video');if(v)v.style.display='block';if(navigator.geolocation){navigator.geolocation.getCurrentPosition(function(p){capturedGPS={lat:p.coords.latitude,lng:p.coords.longitude};},function(){capturedGPS=null;});}navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'},audio:false}).then(function(s){currentStream=s;document.getElementById('real-camera-video').srcObject=s;}).catch(function(e){showToast('Cameră indisponibilă: '+e.message);cam.style.display='none';});}
function closeCamera(){document.getElementById('camera-screen').style.display='none';if(currentStream){currentStream.getTracks().forEach(function(t){t.stop();});currentStream=null;}}
var capturedGPS=null;
function takePicture(){var v=document.getElementById('real-camera-video');var c=document.createElement('canvas');c.width=v.videoWidth||640;c.height=v.videoHeight||480;var ctx=c.getContext('2d');ctx.drawImage(v,0,0);var now=new Date();var ts=now.toLocaleString('ro-RO');var gs=capturedGPS?capturedGPS.lat.toFixed(5)+', '+capturedGPS.lng.toFixed(5):'GPS N/A';ctx.fillStyle='rgba(0,0,0,0.55)';ctx.fillRect(0,c.height-70,c.width,70);ctx.font='bold 15px -apple-system';ctx.fillStyle='#fff';ctx.shadowColor='rgba(0,0,0,0.9)';ctx.shadowBlur=4;ctx.fillText('VV PROOF',14,c.height-46);ctx.font='12px -apple-system';ctx.fillStyle='rgba(255,255,255,0.75)';ctx.fillText('GPS: '+gs,14,c.height-28);ctx.fillText(ts,14,c.height-10);c.toBlob(function(blob){capturedImageBlob=blob;var url=URL.createObjectURL(blob);document.getElementById('real-camera-video').style.display='none';var p=document.createElement('img');p.src=url;p.style.cssText='width:100%;height:100%;object-fit:cover;';p.id='preview-img';document.querySelector('.cam-viewfinder').appendChild(p);},'image/jpeg',0.92);document.getElementById('shutter-container').style.display='none';document.getElementById('post-photo-menu').style.display='block';}
function retakePhoto(){capturedImageBlob=null;var p=document.getElementById('preview-img');if(p)p.remove();document.getElementById('real-camera-video').style.display='block';document.getElementById('shutter-container').style.display='flex';document.getElementById('post-photo-menu').style.display='none';}

// ================= UPLOAD — CHECK 50m + ANTI-TELEPORT =================
async function uploadPhotoToCEO(){
    if(!capturedImageBlob){showToast('Fă o poză mai întâi!');return;}
    if(!currentUser){try{var cr=await auth.signInAnonymously();currentUser=cr.user;}catch(e){showToast('Eroare.');return;}}
    var msg=document.getElementById('photo-msg').value.trim();var sb=document.getElementById('send-btn');
    function rb(){sb.textContent='TRIMITE UPDATE';sb.style.opacity='1';sb.style.pointerEvents='auto';}
    sb.textContent='SE VERIFICĂ...';sb.style.opacity='0.6';sb.style.pointerEvents='none';
    if(currentSpotId){try{var md=await db.collection('missions').doc(currentSpotId).get();if(md.exists){var mD=md.data();
    var fp=await new Promise(function(res,rej){if(navigator.geolocation){navigator.geolocation.getCurrentPosition(function(p){res({lat:p.coords.latitude,lng:p.coords.longitude});},function(e){if(capturedGPS)res(capturedGPS);else if(userCurrentLat!==null)res({lat:userCurrentLat,lng:userCurrentLng});else rej(e);},{enableHighAccuracy:true,timeout:8000});}else if(capturedGPS)res(capturedGPS);else if(userCurrentLat!==null)res({lat:userCurrentLat,lng:userCurrentLng});else rej(new Error('GPS'));});
    if(isTeleporting(fp.lat,fp.lng)){showToast('⚠️ GPS suspect.');rb();return;}
    var dt=haversineDistance(fp.lat,fp.lng,mD.lat,mD.lng);
    if(dt>50){showToast('📍 Prea departe ('+Math.round(dt)+'m). Max: 50m.');rb();return;}}}catch(ge){}}
    sb.textContent='SE TRIMITE...';var fn='proofs/'+currentUser.uid+'_'+Date.now()+'.jpg';var ref=storage.ref(fn);
    try{await ref.put(capturedImageBlob);var url=await ref.getDownloadURL();var alias=localStorage.getItem('vv_alias')||'EXPLORER';var uid=currentUser.uid;var gLat=(capturedGPS&&capturedGPS.lat)?capturedGPS.lat:null;var gLng=(capturedGPS&&capturedGPS.lng)?capturedGPS.lng:null;var mid=currentSpotId||null;var now=firebase.firestore.FieldValue.serverTimestamp();
    var batch=db.batch();batch.set(db.collection('inbox').doc(),{to:'CEO',from:uid,alias:alias,message:msg||'Update trimis',photoUrl:url,missionId:mid,reward:selectedReward||0,read:false,createdAt:now});
    batch.set(db.collection('photos').doc(),{url:url,message:msg||'Captură VV',explorerId:uid,alias:alias,missionId:mid,gpsLat:gLat,gpsLng:gLng,timestamp:Date.now(),createdAt:now,flagged:false,approved:false});
    if(mid){try{var mDoc=await db.collection('missions').doc(mid).get();if(mDoc.exists){var mData=mDoc.data();var cid=mData.createdBy||'';if(cid&&cid!==uid){batch.set(db.collection('inbox').doc(),{to:cid,from:uid,alias:alias,message:msg||'Exploratorul a completat spot-ul tău!',photoUrl:url,missionId:mid,reward:mData.reward||0,read:false,type:'spot_result',createdAt:now});batch.update(db.collection('missions').doc(mid),{status:'completed',photoUrl:url,solverId:uid,solvedAt:now});}}}catch(e){}}
    await batch.commit();rb();showToast('Update trimis! ✅');document.getElementById('photo-msg').value='';currentSpotId=null;capturedImageBlob=null;capturedGPS=null;closeCamera();setTimeout(function(){switchTab('map');},1500);
    }catch(err){showToast('Eroare: '+(err.message||''));}finally{rb();}
}
