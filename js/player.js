/**
 * player.js - Reproductor optimizado para TV v2.2
 * Mejoras v2.2:
 *   - Integración real con JW Player API via postMessage ({method:'play'} etc.)
 *   - Escucha eventos del iframe: jwplayer time/complete/adImpression
 *   - Detección de fin de video para lanzar "siguiente episodio"
 *   - Bloqueo de popups/ventanas emergentes del iframe
 *   - Registro de Service Worker para bloqueo de anuncios
 */

const PlayerView = (() => {
  const AUTOHIDE_MS     = 4500;
  const NEXT_EP_COUNTDOWN = 15;
  const HLS_JS_URL      = 'https://cdn.jsdelivr.net/npm/hls.js@latest/dist/hls.min.js';

  let _urls          = [];
  let _current       = 0;
  let _title         = '';
  let _playerData    = null;
  let _epContext     = null;
  let _active        = false;
  let _controlsVisible = true;
  let _mutedAutoplay = false;
  let _hideTimer     = null;
  let _nextEpTimer   = null;
  let _countdownTimer = null;
  let _countdown     = 0;
  let _loadToken     = 0;
  let _mode          = 'iframe';
  let _hlsInstance   = null;
  let _jwReadyPolls  = 0;

  // ─── Service Worker (bloqueo de anuncios) ─────────────────────────────────
  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      console.log('[REX] Service Worker registrado:', reg.scope);
    } catch (e) {
      console.warn('[REX] Service Worker no disponible:', e.message);
    }
  }

  // ─── Bloqueo de popups del iframe ─────────────────────────────────────────
  function installPopupBlocker() {
    // Bloquear window.open globalmente — los popups de ads lo usan
    if (!window._rexPopupBlocked) {
      window._rexPopupBlocked = true;
      const _origOpen = window.open;
      window.open = function(url, target, features) {
        // Permitir si el target es el mismo origen o es una herramienta interna
        if (url && (url.startsWith('/') || url.includes('allcalidad'))) {
          return _origOpen.call(window, url, target, features);
        }
        console.log('[REX] Popup bloqueado:', url);
        return null;
      };
    }
  }

  // ─── JW Player API via postMessage ────────────────────────────────────────
  // JW Player 8+ acepta mensajes en el formato: { method: 'play' | 'pause' | 'seek', ... }
  // Referencia: https://developer.jwplayer.com/jwplayer/docs/jw8-javascript-api-reference

  function jwPost(method, params = {}) {
    const frame = document.getElementById('player-frame');
    if (!frame || !frame.contentWindow) return;
    try {
      // Formato JW Player 8 postMessage
      frame.contentWindow.postMessage(
        JSON.stringify({ method, params }),
        '*'
      );
      // Formato alternativo que usan algunos embeds custom
      frame.contentWindow.postMessage({ method, ...params }, '*');
      // Formato legacy JW7
      frame.contentWindow.postMessage(method, '*');
    } catch (_) {}
  }

  function jwPlay()  { jwPost('play');  }
  function jwPause() { jwPost('pause'); }

  // Intentar llamar directamente a jwplayer() si el iframe es accesible (same-origin)
  function tryDirectJwPlay() {
    const frame = document.getElementById('player-frame');
    if (!frame) return false;
    try {
      const cw = frame.contentWindow;
      if (cw && typeof cw.jwplayer === 'function') {
        cw.jwplayer().play();
        return true;
      }
      // Buscar también en el documento del iframe
      const cd = frame.contentDocument || (frame.contentWindow && frame.contentWindow.document);
      if (cd) {
        const scripts = cd.querySelectorAll('script');
        // Si tiene jwplayer en su window, usarlo
        if (cw && cw.jwplayer) {
          cw.jwplayer().play(true);
          return true;
        }
      }
    } catch (_) {
      // Cross-origin, no se puede acceder directamente
    }
    return false;
  }

  // Poll periódico para conectar con JW Player una vez cargado el iframe
  function startJwReadyPoll() {
    _jwReadyPolls = 0;
    clearInterval(window._jwPollTimer);
    window._jwPollTimer = setInterval(() => {
      if (!_active || _mode !== 'iframe') {
        clearInterval(window._jwPollTimer);
        return;
      }
      _jwReadyPolls++;
      // Intentar play directo (funciona si es same-origin)
      if (tryDirectJwPlay()) {
        clearInterval(window._jwPollTimer);
        console.log('[REX] JW Player conectado directamente');
        return;
      }
      // Fallback: postMessage
      jwPlay();
      // Dejar de intentar después de 12s
      if (_jwReadyPolls > 12) clearInterval(window._jwPollTimer);
    }, 1000);
  }

  // ─── Escuchar eventos del iframe (JW Player + custom) ─────────────────────
  function setupIframeMessageListener() {
    if (window._rexMsgListenerActive) return;
    window._rexMsgListenerActive = true;

    window.addEventListener('message', (event) => {
      if (!_active) return;

      let data = event.data;

      // Parsear string JSON si viene así
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch (_) { return; }
      }

      if (!data || typeof data !== 'object') return;

      // ── Eventos JW Player ──
      const ev = data.event || data.type || data.method || '';

      switch (ev) {
        case 'ready':
        case 'jwplayer:ready':
          // Player listo — enviar play
          console.log('[REX] JW Player: ready');
          setTimeout(() => jwPlay(), 200);
          setOverlay('hidden');
          break;

        case 'play':
        case 'playing':
        case 'jwplayer:play':
          console.log('[REX] JW Player: reproduciendo');
          setOverlay('hidden');
          clearInterval(window._jwPollTimer);
          break;

        case 'pause':
        case 'jwplayer:pause':
          // No hacemos nada — el usuario puede pausar desde el player
          break;

        case 'time':
        case 'jwplayer:time': {
          // Actualizar progreso y lanzar overlay de siguiente episodio si queda poco
          const pos      = data.position  || data.currentTime || 0;
          const duration = data.duration  || 0;
          if (duration > 30 && (duration - pos) < 90 && (duration - pos) > 0) {
            maybeShowNextEpOverlay();
          }
          break;
        }

        case 'complete':
        case 'jwplayer:complete':
        case 'ended':
          console.log('[REX] Video completado');
          handleVideoComplete();
          break;

        case 'adImpression':
        case 'adStarted':
        case 'jwplayer:adImpression':
          // Hay un anuncio — intentar saltar/omitir
          console.log('[REX] Anuncio detectado — intentando saltar');
          setTimeout(() => skipAd(), 1500);
          break;

        case 'adComplete':
        case 'adSkipped':
          // Anuncio terminó/saltado — reproducir
          setTimeout(() => jwPlay(), 300);
          break;

        case 'error':
        case 'jwplayer:error':
          console.warn('[REX] JW Player error:', data.message || data.code || '');
          break;
      }
    });
  }

  // Intentar saltar anuncio
  function skipAd() {
    // JW Player: método skip via postMessage
    jwPost('skipAd');
    // Direct access
    try {
      const cw = document.getElementById('player-frame') && document.getElementById('player-frame').contentWindow;
      if (cw && cw.jwplayer) cw.jwplayer().skipAd();
    } catch (_) {}
    // Click en botón "skip" si existe en el iframe DOM
    try {
      const cd = document.getElementById('player-frame') && document.getElementById('player-frame').contentDocument;
      if (cd) {
        const skipBtn = cd.querySelector('.jw-skip, .skip-button, [class*="skip"], [id*="skip"]');
        if (skipBtn) skipBtn.click();
      }
    } catch (_) {}
  }

  // ─── Fin de video ──────────────────────────────────────────────────────────
  let _videoCompleteFired = false;

  function handleVideoComplete() {
    if (_videoCompleteFired) return;
    _videoCompleteFired = true;
    const next = getNextEpisode();
    if (next) showNextEpOverlay(next);
  }

  let _nextEpOverlayShown = false;
  function maybeShowNextEpOverlay() {
    if (_nextEpOverlayShown) return;
    const next = getNextEpisode();
    if (!next) return;
    _nextEpOverlayShown = true;
    showNextEpOverlay(next);
  }

  // ─── Inicialización ────────────────────────────────────────────────────────
  function show(urls, title, playerData, epContext) {
    _urls      = Array.isArray(urls) ? urls.filter(Boolean) : [];
    _title     = title || '';
    _playerData = playerData || { servers: [] };
    _epContext  = epContext || null;
    _current   = 0;
    _active    = true;
    _controlsVisible = true;
    _mutedAutoplay   = false;
    _mode      = 'iframe';
    _videoCompleteFired  = false;
    _nextEpOverlayShown  = false;

    clearRuntimeState();
    resetSurfaces();

    // Registrar SW la primera vez
    registerServiceWorker();
    installPopupBlocker();
    setupIframeMessageListener();

    const view = document.getElementById('view-player');
    view.style.display = '';

    document.getElementById('player-title').textContent = _title;
    document.getElementById('player-back').onclick   = () => App.goBack();
    document.getElementById('player-retry').onclick  = () => retryPlayback(true);
    document.getElementById('player-play').onclick   = () => triggerPlay();
    document.getElementById('player-mute-toggle').onclick = () => {
      _mutedAutoplay = !_mutedAutoplay;
      updateMuteButton();
      if (_mode === 'native') retryPlayback(false);
    };

    bindVideoEvents();
    renderServerButtons();
    updateMuteButton();
    showControls();

    setOverlay('loading', 'Cargando reproductor...');
    loadUrl(_current, { userInitiated: false });

    setTimeout(() => {
      const back = document.getElementById('player-back');
      if (back) Nav.focus(back);
    }, 120);

    view.addEventListener('click', onActivity);
    document.addEventListener('keydown', onActivityKey, false);
  }

  // ─── Limpieza de estado ────────────────────────────────────────────────────
  function clearRuntimeState() {
    clearTimeout(_hideTimer);
    clearTimeout(_nextEpTimer);
    clearInterval(_countdownTimer);
    clearInterval(window._jwPollTimer);
    hideNextEpOverlay();
    updateMeta('');
    destroyHls();
    _videoCompleteFired = false;
    _nextEpOverlayShown = false;
  }

  function destroyHls() {
    if (_hlsInstance) {
      try { _hlsInstance.destroy(); } catch (_) {}
      _hlsInstance = null;
    }
  }

  // ─── Resetear superficies de video ────────────────────────────────────────
  function resetSurfaces() {
    const frame = document.getElementById('player-frame');
    const video = document.getElementById('player-video');

    if (frame) {
      frame.onload = null;
      frame.src = 'about:blank';
      frame.style.display = '';
      frame.style.visibility = 'visible';
      frame.style.opacity = '1';
      frame.style.zIndex  = '1';
    }

    if (video) {
      destroyHls();
      video.pause();
      video.removeAttribute('src');
      video.load();
      video.classList.remove('active');
      video.style.display = 'none';
      video.style.zIndex  = '0';
    }
  }

  // ─── Eventos del elemento <video> ─────────────────────────────────────────
  function bindVideoEvents() {
    const video = document.getElementById('player-video');
    if (!video || video.dataset.bound === '1') return;
    video.dataset.bound = '1';

    video.addEventListener('loadedmetadata', () => {
      if (!_active || _mode !== 'native') return;
      setOverlay('hidden');
    });

    video.addEventListener('playing', () => {
      if (!_active || _mode !== 'native') return;
      setOverlay('hidden');
      updateStatus('Reproduciendo');
    });

    video.addEventListener('ended', () => {
      if (!_active || _mode !== 'native') return;
      handleVideoComplete();
    });

    video.addEventListener('error', (e) => {
      if (!_active || _mode !== 'native') return;
      console.warn('video error, fallback to iframe', e);
      fallbackToIframe(_current, { userInitiated: true });
    });

    video.addEventListener('stalled', () => {
      if (!_active || _mode !== 'native') return;
      updateStatus('Buffering...');
    });

    // Detectar último 90 segundos para overlay de siguiente episodio
    video.addEventListener('timeupdate', () => {
      if (!_active || _mode !== 'native') return;
      const remaining = video.duration - video.currentTime;
      if (remaining < 90 && remaining > 0 && video.duration > 30) {
        maybeShowNextEpOverlay();
      }
    });
  }

  // ─── Botones de servidor ───────────────────────────────────────────────────
  function renderServerButtons() {
    const container = document.getElementById('player-servers');
    container.innerHTML = '';
    if (!_urls.length) return;

    const names = (_playerData && _playerData.servers && _playerData.servers.length)
      ? _playerData.servers.map(s => s.name)
      : _urls.map((_, i) => 'Servidor ' + (i + 1));

    _urls.forEach((_, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'server-btn focusable' + (i === _current ? ' active' : '');
      btn.textContent = names[i] || 'Servidor ' + (i + 1);
      btn.onclick = () => switchServer(i);
      container.appendChild(btn);
    });
  }

  function switchServer(index) {
    if (index < 0 || index >= _urls.length || index === _current) return;
    _current = index;
    document.querySelectorAll('.server-btn').forEach((btn, i) => {
      btn.classList.toggle('active', i === index);
    });
    retryPlayback(true);
  }

  // ─── Reproducir / reintentar ───────────────────────────────────────────────
  function retryPlayback(userInitiated) {
    if (!_urls[_current]) return;
    _videoCompleteFired = false;
    _nextEpOverlayShown = false;
    loadUrl(_current, { userInitiated: !!userInitiated });
    showControls();
  }

  // Botón "▶ Reproducir"
  function triggerPlay() {
    if (_mode === 'native') {
      const video = document.getElementById('player-video');
      if (video) {
        video.muted = false;
        video.play().catch(() => {});
      }
    } else {
      // 1. Intento directo same-origin
      if (!tryDirectJwPlay()) {
        // 2. postMessage JW Player
        jwPlay();
        // 3. Recargar iframe con user gesture (última opción)
        retryPlayback(true);
      }
    }
    showControls();
  }

  // ─── Carga principal de URL ────────────────────────────────────────────────
  async function loadUrl(index, options = {}) {
    const url = _urls[index];
    if (!url) {
      setOverlay('hidden');
      App.toast('⚠ Sin URL disponible para este servidor');
      return;
    }

    _loadToken += 1;
    const token = _loadToken;

    updateStatus(options.userInitiated ? 'Reintentando...' : 'Cargando...');

    if (!options.userInitiated) {
      setOverlay('loading', 'Conectando con el servidor...');
    }

    const directSource = await resolveDirectSource(url);
    if (!_active || token !== _loadToken) return;

    if (directSource) {
      loadNativeStream(directSource, token);
      return;
    }

    fallbackToIframe(index, options, token);
  }

  // ─── Resolución de stream directo ─────────────────────────────────────────
  async function resolveDirectSource(rawUrl) {
    if (looksDirectStream(rawUrl)) return rawUrl;

    if (rawUrl.includes('vimeos.net/embed') || rawUrl.includes('goodstream.one/embed')) {
      try {
        const res = await fetch(rawUrl, {
          headers: { 'Referer': 'https://allcalidad.re/' },
          signal: AbortSignal.timeout(5000)
        });
        const html = await res.text();
        const m3u8Match = html.match(/["'](https?:\/\/[^"']*\.m3u8[^"']*)['"]/);
        if (m3u8Match) return m3u8Match[1];
      } catch (_) {}
    }

    return '';
  }

  function looksDirectStream(url) {
    return /\.m3u8(\?|$)/i.test(url) ||
           /\.mp4(\?|$)/i.test(url)  ||
           /\.webm(\?|$)/i.test(url);
  }

  // ─── Reproducción nativa ───────────────────────────────────────────────────
  async function loadNativeStream(source, token) {
    const video = document.getElementById('player-video');
    const frame = document.getElementById('player-frame');
    if (!video || !_active || token !== _loadToken) return;

    _mode = 'native';

    if (frame) {
      frame.src = 'about:blank';
      frame.style.display = 'none';
    }
    video.style.display = '';
    video.classList.add('active');
    video.style.zIndex  = '2';
    video.muted      = _mutedAutoplay;
    video.controls   = false;
    video.playsInline = true;

    destroyHls();

    const isHLS = /\.m3u8/i.test(source);

    if (isHLS && !video.canPlayType('application/vnd.apple.mpegurl')) {
      await ensureHlsJs();
      if (!_active || token !== _loadToken) return;

      if (window.Hls && window.Hls.isSupported()) {
        _hlsInstance = new window.Hls({
          enableWorker: true,
          lowLatencyMode: false,
          maxBufferLength: 30,
        });
        _hlsInstance.loadSource(source);
        _hlsInstance.attachMedia(video);
        _hlsInstance.on(window.Hls.Events.MANIFEST_PARSED, () => {
          if (!_active || token !== _loadToken) return;
          setOverlay('hidden');
          video.play().catch(() => {
            setOverlay('hidden');
            showPlayPrompt();
          });
        });
        _hlsInstance.on(window.Hls.Events.ERROR, (_, data) => {
          if (!_active || token !== _loadToken) return;
          if (data.fatal) {
            console.warn('HLS fatal error, fallback iframe');
            fallbackToIframe(_current, { userInitiated: true }, token);
          }
        });
        return;
      }
    }

    video.src = source;
    video.load();
    video.play()
      .then(() => { if (_active && token === _loadToken) setOverlay('hidden'); })
      .catch(() => {
        if (!_active || token !== _loadToken) return;
        setOverlay('hidden');
        showPlayPrompt();
      });
  }

  function ensureHlsJs() {
    if (window.Hls) return Promise.resolve();
    return new Promise((resolve) => {
      const s = document.createElement('script');
      s.src     = HLS_JS_URL;
      s.onload  = resolve;
      s.onerror = resolve;
      document.head.appendChild(s);
    });
  }

  // ─── Fallback a iframe ─────────────────────────────────────────────────────
  function fallbackToIframe(index, options = {}, token = _loadToken) {
    const url   = _urls[index];
    const frame = document.getElementById('player-frame');
    const video = document.getElementById('player-video');
    if (!url || !frame || !_active || token !== _loadToken) return;

    _mode = 'iframe';
    destroyHls();

    if (video) {
      video.pause();
      video.removeAttribute('src');
      video.load();
      video.classList.remove('active');
      video.style.display = 'none';
      video.style.zIndex  = '0';
    }

    frame.style.display    = '';
    frame.style.visibility = 'visible';
    frame.style.opacity    = '1';
    frame.style.zIndex     = '1';

    frame.setAttribute('allow',
      'autoplay; fullscreen; encrypted-media; picture-in-picture; clipboard-write; web-share'
    );
    frame.setAttribute('allowfullscreen', '');

    // Ocultar overlay rápido para que se vea el player del iframe
    setTimeout(() => {
      if (_active && token === _loadToken) setOverlay('hidden');
    }, 800);

    frame.onload = () => {
      if (!_active || token !== _loadToken) return;
      setOverlay('hidden');
      updateStatus('Reproductor cargado');
      // Iniciar polling para conectar con JW Player
      startJwReadyPoll();
    };

    const builtUrl = buildAutoplayUrl(url, _mutedAutoplay);
    frame.src = builtUrl;

    setTimeout(() => {
      if (_active && token === _loadToken) setOverlay('hidden');
    }, 4000);
  }

  // ─── Construir URL con params de autoplay ─────────────────────────────────
  function buildAutoplayUrl(rawUrl, muted) {
    try {
      const url = new URL(rawUrl, window.location.href);
      url.searchParams.set('autoplay', '1');
      url.searchParams.set('autoPlay', '1');
      setIfMissing(url, 'muted',      muted ? '1' : '0');
      setIfMissing(url, 'playsinline', '1');

      const host = url.hostname.toLowerCase();
      if (host.includes('vimeo')) {
        setIfMissing(url, 'background', muted ? '1' : '0');
        setIfMissing(url, 'autopause',  '0');
      }
      if (host.includes('youtube') || host.includes('youtu.be')) {
        url.searchParams.set('enablejsapi', '1');
        setIfMissing(url, 'rel', '0');
      }
      return url.toString();
    } catch (_) {
      return rawUrl;
    }
  }

  function setIfMissing(url, key, value) {
    if (!url.searchParams.has(key)) url.searchParams.set(key, value);
  }

  // ─── Overlay de "click para reproducir" ──────────────────────────────────
  function showPlayPrompt() {
    const overlay = document.getElementById('player-overlay');
    if (!overlay) return;
    overlay.classList.remove('is-hidden');
    overlay.dataset.mode = 'play-prompt';
    updateStatus('Presiona ▶ Reproducir o OK para iniciar');
    showControls();
  }

  // ─── Overlay ───────────────────────────────────────────────────────────────
  function setOverlay(mode, text) {
    const overlay = document.getElementById('player-overlay');
    if (!overlay) return;
    overlay.classList.toggle('is-hidden', mode === 'hidden');
    overlay.dataset.mode = mode;
    if (typeof text === 'string') updateStatus(text);
  }

  function updateStatus(text) {
    const el = document.getElementById('player-status');
    if (el) el.textContent = text || '';
  }

  function updateMeta(text) {
    const el = document.getElementById('player-meta');
    if (el) el.textContent = text || '';
  }

  function updateMuteButton() {
    const btn = document.getElementById('player-mute-toggle');
    if (!btn) return;
    btn.textContent = _mutedAutoplay ? '🔇 Silenciado' : '🔊 Con Audio';
    btn.classList.toggle('active', _mutedAutoplay);
  }

  // ─── Controles ─────────────────────────────────────────────────────────────
  function showControls() {
    const controls = document.getElementById('player-controls');
    if (!controls) return;
    controls.classList.remove('hidden');
    _controlsVisible = true;
    clearTimeout(_hideTimer);
    _hideTimer = setTimeout(() => {
      if (_active) hideControls();
    }, AUTOHIDE_MS);
  }

  function hideControls() {
    const controls = document.getElementById('player-controls');
    if (!controls) return;
    controls.classList.add('hidden');
    _controlsVisible = false;
  }

  function onActivity() {
    if (_active) showControls();
  }

  function onActivityKey(e) {
    if (!_active) return;
    const navKeys = [37, 38, 39, 40, 13, 461];
    if (navKeys.includes(e.keyCode) && !_controlsVisible) {
      e.stopPropagation();
      showControls();
      Nav.focus(document.getElementById('player-back'));
      return;
    }
    showControls();
  }

  // ─── Siguiente episodio ────────────────────────────────────────────────────
  function getNextEpisode() {
    if (!_epContext || !_epContext.seasons || !_epContext.seasons.length) return null;
    const { seasons, currentSeason, currentEp } = _epContext;
    const season   = seasons[currentSeason];
    if (!season) return null;
    const episodes = season.episodes || [];
    const index    = episodes.findIndex(ep => ep.id === currentEp.id);
    if (index < 0) return null;
    if (index + 1 < episodes.length)
      return { ep: episodes[index + 1], seasonIndex: currentSeason };
    if (currentSeason + 1 < seasons.length) {
      const nextSeason = seasons[currentSeason + 1];
      if (nextSeason.episodes && nextSeason.episodes.length)
        return { ep: nextSeason.episodes[0], seasonIndex: currentSeason + 1 };
    }
    return null;
  }

  function showNextEpOverlay(nextEpInfo) {
    const overlay = document.getElementById('next-ep-overlay');
    if (!overlay) return;
    const { ep, seasonIndex } = nextEpInfo;
    overlay.querySelector('.next-ep-title').textContent =
      `T${ep.seasonNumber}:E${ep.episodeNumber} - ${ep.title}`;
    overlay.querySelector('.next-ep-meta').textContent = 'Siguiente episodio';

    const bar      = overlay.querySelector('.next-ep-progress-bar');
    const countEl  = overlay.querySelector('.next-ep-countdown');
    const btnNext  = document.getElementById('btn-next-ep');
    const btnDismiss = document.getElementById('btn-dismiss-next');

    _countdown = NEXT_EP_COUNTDOWN;
    bar.style.width       = '100%';
    countEl.textContent   = _countdown;
    overlay.classList.add('visible');

    if (btnNext) {
      btnNext.onclick = () => playNextEpisode(ep, seasonIndex);
      setTimeout(() => Nav.focus(btnNext), 80);
    }
    if (btnDismiss) btnDismiss.onclick = () => hideNextEpOverlay();

    clearInterval(_countdownTimer);
    _countdownTimer = setInterval(() => {
      _countdown -= 1;
      countEl.textContent = _countdown;
      bar.style.width = `${(_countdown / NEXT_EP_COUNTDOWN) * 100}%`;
      if (_countdown <= 0) {
        clearInterval(_countdownTimer);
        playNextEpisode(ep, seasonIndex);
      }
    }, 1000);
  }

  async function playNextEpisode(ep, seasonIndex) {
    hideNextEpOverlay();
    if (!ep || !ep.id) return;
    App.toast(`Cargando T${ep.seasonNumber}:E${ep.episodeNumber}`);
    try {
      const player = await API.getPlayer(ep.id);
      const urls   = API.getPlayableUrls(player);
      if (!urls.length) { App.toast('Sin servidores disponibles'); return; }

      _urls       = urls;
      _playerData = player;
      _current    = 0;
      _title      = `${_title.split('—')[0].trim()} — T${ep.seasonNumber}:E${ep.episodeNumber}`;
      _videoCompleteFired = false;
      _nextEpOverlayShown = false;

      if (_epContext) { _epContext.currentSeason = seasonIndex; _epContext.currentEp = ep; }
      document.getElementById('player-title').textContent = _title;
      renderServerButtons();
      loadUrl(0, { userInitiated: true });
    } catch (e) {
      App.toast('Error al cargar siguiente episodio');
      console.error('playNextEpisode error', e);
    }
  }

  function hideNextEpOverlay() {
    clearTimeout(_nextEpTimer);
    clearInterval(_countdownTimer);
    const overlay = document.getElementById('next-ep-overlay');
    if (overlay) overlay.classList.remove('visible');
  }

  // ─── Ocultar / limpiar ────────────────────────────────────────────────────
  function hide() {
    if (!_active) return;
    _active = false;
    clearRuntimeState();

    const view = document.getElementById('view-player');
    if (view) view.removeEventListener('click', onActivity);
    document.removeEventListener('keydown', onActivityKey, false);

    resetSurfaces();

    const serversEl = document.getElementById('player-servers');
    if (serversEl) serversEl.innerHTML = '';

    const controls = document.getElementById('player-controls');
    if (controls) controls.classList.remove('hidden');

    setOverlay('hidden');
    updateStatus('');
    updateMeta('');

    if (view) view.style.display = 'none';

    _urls       = [];
    _playerData = null;
    _epContext  = null;
  }

  return { show, hide };
})();