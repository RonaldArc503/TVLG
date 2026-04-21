/**
 * player.js — Vista de reproducción v2.0
 * Correcciones:
 *   - Sin pantalla negra al salir (reemplazar iframe de forma segura)
 *   - Foco inicial en btn-back al entrar
 *   - Overlay "Siguiente Episodio" con cuenta regresiva
 *   - Navegación D-pad correcta en controles
 *   - Service Worker opcional (ad-block)
 */

const PlayerView = (() => {

  let _urls        = [];
  let _current     = 0;
  let _title       = '';
  let _playerData  = null;
  let _epContext   = null; // { seasons, currentSeason, currentEp }
  let _active      = false;
  let _hideTimer   = null;
  let _nextEpTimer = null;
  let _countdownTimer = null;
  let _countdown   = 0;

  // ─── Service Worker (registro opcional) ──────────────────────────────────
  (function registerAdBlockSW() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then(reg => {
        if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      })
      .catch(() => {});
  })();

  // ─── show ─────────────────────────────────────────────────────────────────
  function show(urls, title, playerData, epContext) {
    _urls       = urls || [];
    _title      = title || '';
    _playerData = playerData || { servers: [] };
    _epContext  = epContext || null;
    _current    = 0;
    _active     = true;

    hideNextEpOverlay();

    const view = document.getElementById('view-player');
    view.style.display = '';

    document.getElementById('player-title').textContent = _title;
    document.getElementById('player-back').onclick = () => App.goBack();

    renderServerButtons();
    loadUrl(_current);
    showControls();

    // Foco inicial en el botón de volver (primer elemento del player)
    setTimeout(() => {
      const back = document.getElementById('player-back');
      if (back) Nav.focus(back);
    }, 200);

    // Listeners de actividad
    view.addEventListener('click', onActivity);
    document.addEventListener('keydown', onActivityKey, false);

    // Simular detección de "4 minutos antes del final"
    // En un player real esto vendría de eventos del video
    // Para la demo, si hay contexto de episodio, lo activamos después de 5s
    if (_epContext) {
      scheduleNextEpisodeDemo();
    }
  }

  // ─── Server buttons ───────────────────────────────────────────────────────
  function renderServerButtons() {
    const container = document.getElementById('player-servers');
    container.innerHTML = '';

    if (!_urls.length) return;

    const names = (_playerData && _playerData.servers && _playerData.servers.length)
      ? _playerData.servers.map(s => s.name)
      : _urls.map((_, i) => 'Servidor ' + (i + 1));

    _urls.forEach((url, i) => {
      const btn = document.createElement('button');
      btn.className   = 'server-btn focusable' + (i === _current ? ' active' : '');
      btn.textContent = names[i] || ('Servidor ' + (i + 1));
      btn.onclick     = () => switchServer(i);
      container.appendChild(btn);
    });
  }

  function switchServer(index) {
    if (index < 0 || index >= _urls.length) return;
    _current = index;
    document.querySelectorAll('.server-btn').forEach((btn, i) => {
      btn.classList.toggle('active', i === index);
    });
    loadUrl(index);
    showControls();
  }

  // ─── loadUrl — proxy srcdoc con ad-block multicapa ───────────────────────
  function loadUrl(index) {
    if (!_urls[index]) return;

    const frame = document.getElementById('player-frame');
    if (!frame) return;

    // Limpiar frame anterior de forma segura (evita pantalla negra)
    frame.removeAttribute('sandbox');
    frame.setAttribute('allow', 'autoplay; fullscreen; encrypted-media; picture-in-picture');
    frame.allowFullscreen = true;

    // Navegar a blank ANTES de cambiar srcdoc (evita freeze)
    frame.src = 'about:blank';

    const rawUrl = _urls[index];

    const AD_PAT = JSON.stringify([
      'imasdk.googleapis.com','doubleclick','googlesyndication',
      'cloudflareinsights','adnxs','moatads','taboola','outbrain',
      'prebid','vast','vpaid','betwinner','betwin','amd-cdn',
      'ffb7df5a','stream/agl','bigwin','casino','advert','sponsor',
      '/ads/','/ad/','beacon.min.js','adserver','adunit',
    ]);

    const proxyHtml = `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;background:#000;overflow:hidden}
#ef{width:100%;height:100%;border:none;display:block}
</style>
</head><body>
<iframe id="ef"
  src="${rawUrl}"
  allowfullscreen
  allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation allow-top-navigation-by-user-activation"
></iframe>
<script>
(function(){
  var PAT = ${AD_PAT};
  function isAd(url){ var u=(url||'').toLowerCase(); return PAT.some(function(p){return u.indexOf(p)>-1;}); }

  var _oF=window.fetch;
  window.fetch=function(input,init){
    var url=typeof input==='string'?input:(input&&input.url)||'';
    if(isAd(url))return Promise.resolve(new Response('',{status:200}));
    return _oF.apply(this,arguments);
  };

  var _oO=XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open=function(m,url){
    this._ad=isAd(url);
    if(!this._ad)return _oO.apply(this,arguments);
  };
  var _oS=XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send=function(){if(!this._ad)return _oS.apply(this,arguments);};

  var _oCE=document.createElement.bind(document);
  document.createElement=function(tag){
    var el=_oCE(tag);
    if((tag+'').toLowerCase()==='script'){
      try{Object.defineProperty(el,'src',{
        set:function(v){if(!isAd(v))el.setAttribute('src',v);},
        get:function(){return el.getAttribute('src')||'';}
      });}catch(e){}
    }
    return el;
  };

  var ef=document.getElementById('ef');

  var AD_SEL=[
    'video[src*="betwinner"]','video[src*="amd-cdn"]',
    '[class*="vast"]','[class*="ima-ad"]','.jw-overlays','.jw-ad',
    '.jw-ima-ad-container','[class*="popup"]','[id*="popup"]',
    '[class*="advert"]','[class*="sponsor"]',
  ].join(',');

  function CSS_KILL(doc){
    if(!doc||doc._adcss)return; doc._adcss=true;
    try{
      var s=doc.createElement('style');
      s.textContent='.jw-overlays,.jw-ad,.jw-ima-ad-container{display:none!important}[class*="vast"],[class*="ima-ad"]{display:none!important}';
      (doc.head||doc.documentElement).appendChild(s);
    }catch(e){}
  }

  function killAds(doc){
    if(!doc)return; CSS_KILL(doc);
    try{
      doc.querySelectorAll(AD_SEL).forEach(function(el){
        if(el.tagName==='VIDEO'){el.pause();el.src='';el.load();}
        el.style.cssText='display:none!important;height:0!important;width:0!important;';
      });
      doc.querySelectorAll('video').forEach(function(v){
        var src=(v.src||v.currentSrc||'').toLowerCase();
        if(isAd(src)){v.pause();v.src='';v.load();v.style.display='none';}
      });
    }catch(e){}
  }

  function installObserver(doc){
    if(!doc||!doc.body||doc._obs)return; doc._obs=true;
    try{
      new MutationObserver(function(){killAds(doc);})
        .observe(doc.body,{childList:true,subtree:true,attributes:true,attributeFilter:['src','style','class']});
    }catch(e){}
  }

  function tryPlay(){
    try{
      var w=ef.contentWindow; if(!w)return;
      var d=ef.contentDocument;
      killAds(d); installObserver(d);
      if(w.jwplayer){
        var jw=w.jwplayer();
        if(jw){
          try{if(jw.getConfig){var c=jw.getConfig();if(c&&c.advertising)c.advertising=null;}}catch(e){}
          if(typeof jw.play==='function')jw.play(true);
          if(typeof jw.skipAd==='function')setTimeout(function(){jw.skipAd();},300);
        }
      }
      w.postMessage('play','*');
      try{(d&&d.querySelectorAll('video')||[]).forEach(function(v){if(!isAd(v.src||''))v.play&&v.play().catch(function(){});});}catch(e){}
    }catch(e){}
  }

  ef.addEventListener('load',function(){
    try{installObserver(ef.contentDocument);}catch(e){}
    setTimeout(tryPlay,500);
    setTimeout(tryPlay,1500);
    setTimeout(tryPlay,3500);
  });

  window.addEventListener('message',function(e){
    var d=e.data; if(!d||typeof d!=='object')return;
    var t=(d.type||d.event||'').toLowerCase();
    if(t.indexOf('ad')===0)e.stopImmediatePropagation();
  },true);
})();
<\/script>
</body></html>`;

    // Pequeño delay para asegurar que 'about:blank' se cargó
    setTimeout(() => {
      if (!_active) return;
      const f = document.getElementById('player-frame');
      if (f) f.srcdoc = proxyHtml;
    }, 100);
  }

  // ─── Controles ───────────────────────────────────────────────────────────
  function showControls() {
    const ctrl = document.getElementById('player-controls');
    if (!ctrl) return;
    ctrl.classList.remove('hidden');
    clearTimeout(_hideTimer);
    _hideTimer = setTimeout(() => {
      if (_active) hideControls();
    }, 5000);
  }

  function hideControls() {
    const ctrl = document.getElementById('player-controls');
    if (ctrl) ctrl.classList.add('hidden');
  }

  function onActivity() { if (_active) showControls(); }

  function onActivityKey(e) {
    if (!_active) return;
    // Cualquier tecla muestra los controles
    const navKeys = [37, 38, 39, 40, 13, 461];
    if (navKeys.includes(e.keyCode)) {
      // Si los controles están ocultos, mostrarlos en lugar de navegar
      const ctrl = document.getElementById('player-controls');
      if (ctrl && ctrl.classList.contains('hidden')) {
        e.stopPropagation();
        showControls();
        Nav.focus(document.getElementById('player-back'));
        return;
      }
    }
    showControls();
  }

  // ─── Siguiente episodio ───────────────────────────────────────────────────
  function scheduleNextEpisodeDemo() {
    // En un player real, esto se dispararía cuando queden ~4 min
    // Aquí lo simulamos después de 8 segundos para demostración
    clearTimeout(_nextEpTimer);
    _nextEpTimer = setTimeout(() => {
      if (!_active) return;
      const nextEp = getNextEpisode();
      if (nextEp) showNextEpOverlay(nextEp);
    }, 8000);
  }

  function getNextEpisode() {
    if (!_epContext || !_epContext.seasons || !_epContext.seasons.length) return null;
    const { seasons, currentSeason, currentEp } = _epContext;
    const season = seasons[currentSeason];
    if (!season) return null;
    const eps = season.episodes || [];
    const idx = eps.findIndex(e => e.id === currentEp.id);
    if (idx < 0) return null;

    // Siguiente en la misma temporada
    if (idx + 1 < eps.length) {
      return { ep: eps[idx + 1], seasonIndex: currentSeason };
    }

    // Primera del siguiente
    if (currentSeason + 1 < seasons.length) {
      const nextS = seasons[currentSeason + 1];
      if (nextS.episodes && nextS.episodes.length) {
        return { ep: nextS.episodes[0], seasonIndex: currentSeason + 1 };
      }
    }

    return null;
  }

  function showNextEpOverlay(nextEpInfo) {
    const overlay = document.getElementById('next-ep-overlay');
    if (!overlay) return;

    const { ep, seasonIndex } = nextEpInfo;

    overlay.querySelector('.next-ep-title').textContent =
      `T${ep.seasonNumber}:E${ep.episodeNumber} — ${ep.title}`;
    overlay.querySelector('.next-ep-meta').textContent =
      `Siguiente episodio`;

    const bar = overlay.querySelector('.next-ep-progress-bar');
    const countEl = overlay.querySelector('.next-ep-countdown');

    // Cuenta regresiva de 15 segundos
    _countdown = 15;
    bar.style.width = '100%';
    countEl.textContent = _countdown;

    overlay.classList.add('visible');

    // Foco en el botón "Siguiente"
    const btnNext = document.getElementById('btn-next-ep');
    if (btnNext) setTimeout(() => Nav.focus(btnNext), 100);

    btnNext.onclick = () => playNextEpisode(ep, seasonIndex);

    document.getElementById('btn-dismiss-next').onclick = () => {
      hideNextEpOverlay();
    };

    // Countdown
    clearInterval(_countdownTimer);
    _countdownTimer = setInterval(() => {
      _countdown--;
      countEl.textContent = _countdown;
      // Barra decremental
      const pct = (_countdown / 15) * 100;
      bar.style.width = pct + '%';

      if (_countdown <= 0) {
        clearInterval(_countdownTimer);
        playNextEpisode(ep, seasonIndex);
      }
    }, 1000);
  }

  async function playNextEpisode(ep, seasonIndex) {
    hideNextEpOverlay();
    if (!ep || !ep.id) return;

    App.toast(`▶ Cargando: T${ep.seasonNumber}:E${ep.episodeNumber}`);

    try {
      const player = await API.getPlayer(ep.id);
      const urls   = API.getPlayableUrls(player);
      if (!urls.length) { App.toast('Sin servidores disponibles'); return; }

      // Actualizar estado del player sin salir
      _urls       = urls;
      _playerData = player;
      _current    = 0;
      _title      = `${_title.split('—')[0].trim()} — T${ep.seasonNumber}:E${ep.episodeNumber}`;

      // Actualizar contexto de siguiente episodio
      if (_epContext) {
        _epContext.currentSeason = seasonIndex;
        _epContext.currentEp     = ep;
      }

      document.getElementById('player-title').textContent = _title;
      renderServerButtons();
      loadUrl(0);

      // Actualizar detalle si corresponde
      if (_epContext && _epContext.seasons) {
        // Actualizar _currentSeason en DetailView para mantener sincronía
      }

      // Re-schedular para el siguiente
      if (_epContext) scheduleNextEpisodeDemo();

    } catch(e) {
      App.toast('Error al cargar siguiente episodio');
      console.error('playNextEpisode error', e);
    }
  }

  function hideNextEpOverlay() {
    clearInterval(_countdownTimer);
    clearTimeout(_nextEpTimer);
    const overlay = document.getElementById('next-ep-overlay');
    if (overlay) overlay.classList.remove('visible');
  }

  // ─── hide — CRÍTICO: sin pantalla negra ──────────────────────────────────
  function hide() {
    if (!_active) return;
    _active = false;

    // Detener timers
    clearTimeout(_hideTimer);
    clearTimeout(_nextEpTimer);
    clearInterval(_countdownTimer);

    hideNextEpOverlay();

    // Remover listeners de actividad
    const view = document.getElementById('view-player');
    if (view) view.removeEventListener('click', onActivity);
    document.removeEventListener('keydown', onActivityKey, false);

    // ── SOLUCIÓN PANTALLA NEGRA ──────────────────────────────────────────
    // 1. Obtener iframe actual
    const frame = document.getElementById('player-frame');
    if (frame) {
      // 2. Poner srcdoc vacío PRIMERO para detener cualquier reproducción
      try {
        frame.srcdoc = '';
        frame.src    = 'about:blank';
      } catch(e) {}

      // 3. Reemplazar el iframe por uno nuevo limpio
      const newFrame = document.createElement('iframe');
      newFrame.id            = 'player-frame';
      newFrame.className     = 'player-frame';
      newFrame.allowFullscreen = true;
      newFrame.setAttribute('allow', 'autoplay; fullscreen; encrypted-media; picture-in-picture');
      newFrame.src = 'about:blank';

      // 4. Insertar nuevo iframe ANTES de ocultar la vista
      if (frame.parentNode) {
        frame.parentNode.insertBefore(newFrame, frame);
        frame.parentNode.removeChild(frame);
      }
    }

    // 5. Limpiar servidores
    const serversEl = document.getElementById('player-servers');
    if (serversEl) serversEl.innerHTML = '';

    // 6. Restablecer controles
    const ctrl = document.getElementById('player-controls');
    if (ctrl) ctrl.classList.remove('hidden');

    // 7. Ocultar vista player
    if (view) view.style.display = 'none';

    // 8. Reset estado
    _urls       = [];
    _playerData = null;
    _epContext  = null;
  }

  return { show, hide };

})();