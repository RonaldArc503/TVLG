/**
 * app.js — Router principal v2.0
 * Correcciones:
 *   - Transiciones de vista suaves (sin pantalla negra)
 *   - Restauración de foco correcta al hacer goBack()
 *   - Búsqueda mejorada con debounce
 *   - Teclado virtual TV optimizado
 */

const App = (() => {

  // Pila de navegación: ['home', 'detail', 'player', ...]
  const _stack = [];
  let _currentView = '';
  let _searchDebounce = null;

  // ─── Boot ─────────────────────────────────────────────────────────────────
  function init() {
    updateClock();
    setInterval(updateClock, 30000);

    // Navbar botones
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.classList.add('focusable');
      btn.addEventListener('click', () => {
        const view = btn.dataset.view;
        if (view === 'home')   showHome();
        if (view === 'search') showSearch();
      });
    });

    buildKeyboard();
    initSearchInput();
    hideSplash();
    showHome();
  }

  function hideSplash() {
    const splash = document.getElementById('splash');
    setTimeout(() => {
      splash.style.opacity = '0';
      setTimeout(() => {
        splash.style.display = 'none';
        document.getElementById('app').style.display = '';
      }, 600);
    }, 1000);
  }

  // ─── Transición entre vistas ──────────────────────────────────────────────
  // Muestra una vista de forma segura, ocultando las demás
  // "from" se oculta DESPUÉS de que "to" es visible, evitando flash negro
  function transition(toId, fromId) {
    const toEl   = document.getElementById('view-' + toId);
    const fromEl = fromId ? document.getElementById('view-' + fromId) : null;

    // 1. Mostrar destino inmediatamente
    if (toEl) {
      toEl.style.display  = '';
      toEl.style.opacity  = '0';
      toEl.style.transition = 'opacity 0.3s ease';
      // Force reflow
      void toEl.offsetHeight;
      toEl.style.opacity = '1';
    }

    // 2. Ocultar origen CON delay para evitar pantalla negra
    if (fromEl) {
      setTimeout(() => {
        fromEl.style.display = 'none';
        fromEl.style.opacity = '';
        fromEl.style.transition = '';
      }, 50);
    }

    // 3. Ocultar cualquier otra vista que pueda estar visible
    ['home', 'search', 'detail', 'player'].forEach(v => {
      if (v !== toId && v !== fromId) {
        const el = document.getElementById('view-' + v);
        if (el) el.style.display = 'none';
      }
    });
  }

  // ─── Router ────────────────────────────────────────────────────────────────
  function showHome() {
    const prev = _currentView;
    _stack.length = 0;
    _stack.push('home');
    _currentView = 'home';

    document.getElementById('navbar').style.display = '';
    setNavActive('home');
    transition('home', prev !== 'home' ? prev : null);
    HomeView.show();
  }

  function showSearch() {
    const prev = _currentView;
    _stack.push(_currentView || 'home');
    _currentView = 'search';

    document.getElementById('navbar').style.display = '';
    setNavActive('search');
    transition('search', prev);

    setTimeout(() => {
      const firstKey = document.querySelector('.key');
      if (firstKey) Nav.focus(firstKey);
    }, 100);
  }

  function showDetail(item) {
    const prev = _currentView;
    _stack.push(_currentView);
    _currentView = 'detail';

    if (prev === 'home') HomeView.hide();
    else if (prev === 'search') {
      Nav.saveFocusForView('search');
    }

    document.getElementById('navbar').style.display = 'none';
    transition('detail', prev !== 'player' ? prev : null);
    DetailView.show(item);
  }

  function showPlayer(urls, title, playerData, epContext) {
    const prev = _currentView;
    _stack.push(_currentView);
    _currentView = 'player';

    document.getElementById('navbar').style.display = 'none';
    transition('player', null); // No ocultar detail todavía — PlayerView.show lo maneja
    // Ocultar detail después de que player esté listo
    setTimeout(() => {
      if (_currentView === 'player') {
        const det = document.getElementById('view-detail');
        if (det) det.style.display = 'none';
      }
    }, 150);

    PlayerView.show(urls, title, playerData, epContext);
  }

  function goBack() {
    if (_currentView === 'player') {
      // CRÍTICO: ocultar player sin pantalla negra
      const prev = _stack.pop() || 'detail';

      // 1. Primero hacer visible la vista destino
      const destEl = document.getElementById('view-' + prev);
      if (destEl) {
        destEl.style.display = '';
        destEl.style.opacity = '0';
        void destEl.offsetHeight;
      }

      // 2. Luego ocultar player (que limpia el iframe)
      PlayerView.hide();

      // 3. Animar entrada de la vista anterior
      if (destEl) {
        destEl.style.transition = 'opacity 0.3s ease';
        void destEl.offsetHeight;
        destEl.style.opacity = '1';
        setTimeout(() => {
          destEl.style.transition = '';
          destEl.style.opacity = '';
        }, 350);
      }

      _currentView = prev;

      // Mostrar navbar si corresponde
      if (prev === 'home' || prev === 'search') {
        document.getElementById('navbar').style.display = '';
        setNavActive(prev);
      } else {
        document.getElementById('navbar').style.display = 'none';
      }

      // Restaurar foco
      setTimeout(() => {
        if (prev === 'detail') {
          // Foco en el botón de reproducir o en el primer episodio
          const btn = document.getElementById('btn-play');
          if (btn && btn.style.display !== 'none') Nav.focus(btn);
          else {
            const ep = document.querySelector('#ep-list .ep-item');
            if (ep) Nav.focus(ep);
            else Nav.focus(document.getElementById('detail-back'));
          }
        } else if (prev === 'home') {
          if (!Nav.restoreFocusForView('home')) {
            Nav.focusFirst(document.getElementById('view-home'));
          }
        } else if (prev === 'search') {
          if (!Nav.restoreFocusForView('search')) {
            Nav.focusFirst(document.getElementById('view-search'));
          }
        }
      }, 120);
      return;
    }

    if (_currentView === 'detail') {
      const prev = _stack.pop() || 'home';
      DetailView.hide();
      _currentView = prev;

      document.getElementById('navbar').style.display = '';
      setNavActive(prev === 'search' ? 'search' : 'home');
      transition(prev, 'detail');

      if (prev === 'home') {
        HomeView.show();
      } else if (prev === 'search') {
        document.getElementById('view-search').style.display = '';
        setTimeout(() => {
          if (!Nav.restoreFocusForView('search')) {
            Nav.focusFirst(document.getElementById('view-search'));
          }
        }, 100);
      } else {
        showHome();
      }
      return;
    }

    if (_currentView === 'search') {
      showHome();
      return;
    }

    // Ya en home — salir de la app en webOS
    if (window.webOSSystem) window.webOSSystem.hide();
  }

  function setNavActive(view) {
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === view);
    });
  }

  // ─── Búsqueda ─────────────────────────────────────────────────────────────
  function initSearchInput() {
    const input = document.getElementById('search-input');
    const clear = document.getElementById('search-clear');

    input.addEventListener('input', () => {
      const q = input.value.trim();
      clear.style.display = q ? '' : 'none';
      clearTimeout(_searchDebounce);
      if (q.length >= 2) {
        _searchDebounce = setTimeout(() => doSearch(q), 600);
      } else if (!q) {
        clearSearchResults();
      }
    });

    clear.onclick = () => {
      input.value = '';
      clear.style.display = 'none';
      clearSearchResults();
      // Regresar foco al teclado virtual
      const firstKey = document.querySelector('.key');
      if (firstKey) Nav.focus(firstKey);
    };
  }

  async function doSearch(query) {
    const loader  = document.getElementById('search-loader');
    const results = document.getElementById('search-results');

    loader.style.display = 'flex';
    results.innerHTML    = '';

    try {
      const items = await API.search(query);
      loader.style.display = 'none';

      if (!items.length) {
        results.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">🔍</div>
            <div class="empty-text">Sin resultados para "${query}"</div>
            <div class="empty-sub">Intenta con otro término de búsqueda</div>
          </div>`;
        return;
      }

      const movies  = items.filter(i => i.type === 'movies');
      const series  = items.filter(i => i.type === 'tvshows' || i.type === 'animes');
      const sections = [];
      if (movies.length) sections.push({ title: '🎬 Películas', items: movies });
      if (series.length) sections.push({ title: '📺 Series & Anime', items: series });
      if (!sections.length) sections.push({ title: '🔎 Resultados', items });

      sections.forEach(section => {
        const wrap  = document.createElement('div');
        wrap.className = 'section';

        const titleEl = document.createElement('div');
        titleEl.className = 'section-title';
        titleEl.textContent = section.title;

        const row = document.createElement('div');
        row.className = 'section-row';

        section.items.forEach((item, i) => {
          const card = HomeView.createCard(item, i);
          card.addEventListener('click', () => showDetail(item));
          // Sobreescribir onclick
          card.onclick = () => showDetail(item);
          row.appendChild(card);
        });

        wrap.appendChild(titleEl);
        wrap.appendChild(row);
        results.appendChild(wrap);
      });

      setTimeout(() => {
        const first = results.querySelector('.card');
        if (first) Nav.focus(first);
      }, 80);

      // Enriquecer con TMDB
      API.enrichItems(items).then(() => {
        items.forEach(item => {
          results.querySelectorAll(`.card[data-id="${item.id}"] img`).forEach(img => {
            if (item.posterUrl) img.src = item.posterUrl;
          });
        });
      }).catch(() => {});

    } catch (e) {
      loader.style.display = 'none';
      results.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">⚠️</div>
          <div class="empty-text">Error en búsqueda</div>
          <div class="empty-sub">${e.message}</div>
        </div>`;
    }
  }

  function clearSearchResults() {
    document.getElementById('search-results').innerHTML = '';
  }

  // ─── Teclado virtual ──────────────────────────────────────────────────────
  function buildKeyboard() {
    const kb = document.getElementById('keyboard');
    kb.innerHTML = '';

    const rows = [
      ['1','2','3','4','5','6','7','8','9','0'],
      ['Q','W','E','R','T','Y','U','I','O','P'],
      ['A','S','D','F','G','H','J','K','L','Ñ'],
      ['Z','X','C','V','B','N','M','⌫'],
      ['ESPACIO','LIMPIAR','BUSCAR'],
    ];

    rows.forEach(row => {
      const rowEl = document.createElement('div');
      rowEl.style.cssText = 'display:flex;gap:6px;margin-bottom:6px;';
      row.forEach(key => {
        const btn = document.createElement('button');
        btn.className = 'key focusable';
        btn.textContent = key;

        if      (key === 'ESPACIO')  { btn.classList.add('key-space'); }
        else if (key === 'BUSCAR')   { btn.classList.add('extra-wide'); }
        else if (key === 'LIMPIAR')  { btn.classList.add('wide'); btn.style.background = 'var(--surface2)'; }
        else if (key === '⌫')        { btn.classList.add('wide'); }

        btn.addEventListener('click', () => handleKey(key));
        rowEl.appendChild(btn);
      });
      kb.appendChild(rowEl);
    });
  }

  function handleKey(key) {
    const input = document.getElementById('search-input');
    const clear = document.getElementById('search-clear');

    if (key === '⌫') {
      input.value = input.value.slice(0, -1);
    } else if (key === 'ESPACIO') {
      input.value += ' ';
    } else if (key === 'LIMPIAR') {
      input.value = '';
      clearSearchResults();
    } else if (key === 'BUSCAR') {
      const q = input.value.trim();
      if (q) doSearch(q);
      return;
    } else {
      input.value += key;
    }

    clear.style.display = input.value ? '' : 'none';
    input.dispatchEvent(new Event('input'));
  }

  // ─── Toast ────────────────────────────────────────────────────────────────
  let _toastTimer = null;
  function toast(msg, duration = 3000) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => el.classList.remove('show'), duration);
  }

  // ─── Clock ────────────────────────────────────────────────────────────────
  function updateClock() {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const el = document.getElementById('nav-clock');
    if (el) el.textContent = h + ':' + m;
  }

  document.addEventListener('DOMContentLoaded', init);

  return { showHome, showSearch, showDetail, showPlayer, goBack, toast };

})();