/**
 * home.js — Vista principal con secciones horizontales v2.0
 */

const HomeView = (() => {

  const PLACEHOLDER = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTg2IiBoZWlnaHQ9IjI5NiIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTg2IiBoZWlnaHQ9IjI5NiIgZmlsbD0iIzFjMWMyYSIvPjx0ZXh0IHg9IjUwJSIgeT0iNDUlIiBmaWxsPSIjMzMzMzQ0IiBmb250LXNpemU9IjQ4IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIj7wn46YPHA+PC90ZXh0Pjx0ZXh0IHg9IjUwJSIgeT0iNjAlIiBmaWxsPSIjMzMzMzQ0IiBmb250LXNpemU9IjE0IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIj5TaW4gaW1hZ2VuPC90ZXh0Pjwvc3ZnPg==';

  let _sections = [];
  let _loaded   = false;

  // ─── Render ────────────────────────────────────────────────────────────────
  function render(sections) {
    _sections = sections;
    const container = document.getElementById('home-sections');
    container.innerHTML = '';

    if (!sections || !sections.length) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📡</div>
          <div class="empty-text">No se pudo cargar el contenido</div>
          <div class="empty-sub">Verifica tu conexión e intenta de nuevo</div>
        </div>`;
      return;
    }

    sections.forEach((section, si) => {
      if (!section.items || !section.items.length) return;
      const el = createSection(section, si);
      container.appendChild(el);
    });
  }

  // home.js - Añadir esta función después de render()

function ensureVisible(element) {
  if (!element) return;
  
  const view = document.getElementById('view-home');
  const elRect = element.getBoundingClientRect();
  const viewRect = view.getBoundingClientRect();
  
  // Scroll vertical automático cuando el elemento sale de la vista
  if (elRect.bottom > viewRect.bottom - 100) {
    view.scrollTop += (elRect.bottom - viewRect.bottom + 120);
  } else if (elRect.top < viewRect.top + 80) {
    view.scrollTop -= (viewRect.top + 80 - elRect.top);
  }
}

// Modificar la función load() - después de focus(first)
setTimeout(() => {
  const first = document.querySelector('#view-home .card');
  if (first) Nav.focus(first);
}, 100);

// Exponer ensureVisible para que Nav pueda usarlo
return { show, hide, load, createCard, ensureVisible };

  function createSection(section, index) {
    const wrap = document.createElement('div');
    wrap.className = 'section';
    // Animación escalonada por sección
    wrap.style.animationDelay = (index * 60) + 'ms';
    wrap.style.animation = 'slideUp 0.4s ease both';

    const titleRow = document.createElement('div');
    titleRow.className = 'section-header';

    const title = document.createElement('div');
    title.className = 'section-title';
    title.textContent = section.title;

    const countBadge = document.createElement('div');
    countBadge.className = 'section-count';
    countBadge.textContent = section.items.length + ' títulos';

    titleRow.appendChild(title);
    titleRow.appendChild(countBadge);

    const row = document.createElement('div');
    row.className = 'section-row';

    // Mostrar TODOS los items — el scroll horizontal los cubre
    section.items.forEach((item, i) => {
      const card = createCard(item, i);
      row.appendChild(card);
    });

    wrap.appendChild(titleRow);
    wrap.appendChild(row);
    return wrap;
  }

  function createCard(item, index = 0) {
    const card = document.createElement('div');
    card.className  = 'card focusable';
    card.tabIndex   = 0;
    card.dataset.id = item.id;
    // Animación escalonada
    card.style.animationDelay = (index * 30) + 'ms';
    card.style.animation = 'fadeIn 0.4s ease both';

    const inner = document.createElement('div');
    inner.className = 'card-inner';

    // Imagen
    const img = document.createElement('img');
    img.src     = item.posterUrl || PLACEHOLDER;
    img.alt     = item.title;
    img.loading = 'lazy';
    img.onerror = () => { img.src = PLACEHOLDER; };

    // Overlay de reproducción al enfocar
    const overlay = document.createElement('div');
    overlay.className = 'card-play-overlay';
    const playIcon = document.createElement('div');
    playIcon.className = 'card-play-icon';
    playIcon.textContent = '▶';
    overlay.appendChild(playIcon);

    // Badge de tipo
    const isSeries = item.type === 'tvshows' || item.type === 'animes';
    if (isSeries) {
      const badge = document.createElement('div');
      badge.className = 'card-type-badge';
      badge.textContent = item.type === 'animes' ? 'ANIME' : 'SERIE';
      inner.appendChild(badge);
    }

    // Info
    const info = document.createElement('div');
    info.className = 'card-info';

    const t = document.createElement('div');
    t.className = 'card-title';
    t.textContent = item.title;

    const y = document.createElement('div');
    y.className = 'card-year';
    y.textContent = item.year || '';

    info.appendChild(t);
    info.appendChild(y);

    inner.appendChild(img);
    inner.appendChild(overlay);
    inner.appendChild(info);
    card.appendChild(inner);

    card.addEventListener('click', () => App.showDetail(item));

    // Accesibilidad
    card.setAttribute('aria-label', `${item.title}${item.year ? ', ' + item.year : ''}`);
    card.setAttribute('role', 'button');

    return card;
  }

  // ─── Actualizar imágenes después de TMDB ─────────────────────────────────
  function refreshImages(sections) {
    sections.forEach(section => {
      section.items.forEach(item => {
        document.querySelectorAll(`.card[data-id="${item.id}"] img`).forEach(img => {
          if (item.posterUrl && img.src !== item.posterUrl) {
            // Fade suave al cambiar imagen
            img.style.opacity = '0';
            img.style.transition = 'opacity 0.3s ease';
            setTimeout(() => {
              img.src = item.posterUrl;
              img.onload = () => { img.style.opacity = '1'; };
            }, 100);
          }
        });
      });
    });
  }

  // ─── Carga ────────────────────────────────────────────────────────────────
  async function load(forceRefresh = false) {
    if (_loaded && !forceRefresh) {
      // Solo restaurar el foco
      setTimeout(() => {
        if (!Nav.restoreFocusForView('home')) {
          const first = document.querySelector('#view-home .card');
          if (first) Nav.focus(first);
        }
      }, 60);
      return;
    }

    showLoader(true);

    try {
      const sections = await API.loadHomeSections(forceRefresh);
      render(sections);
      showLoader(false);
      _loaded = true;

      setTimeout(() => {
        const first = document.querySelector('#view-home .card');
        if (first) Nav.focus(first);
      }, 100);

      // Enriquecer con TMDB en background
      const allItems = sections.flatMap(s => s.items);
      API.enrichItems(allItems).then(() => refreshImages(sections)).catch(() => {});

    } catch (e) {
      console.error('HomeView load error', e);
      showLoader(false);
      document.getElementById('home-sections').innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">⚠️</div>
          <div class="empty-text">Error al cargar: ${e.message}</div>
        </div>`;
    }
  }

  function showLoader(show) {
    document.getElementById('home-loader').style.display = show ? 'flex' : 'none';
  }

  function show() {
    document.getElementById('view-home').style.display = '';
    load();
  }

  function hide() {
    // Guardar foco antes de ocultar
    Nav.saveFocusForView('home');
    document.getElementById('view-home').style.display = 'none';
  }

  return { show, hide, load, createCard };

})();