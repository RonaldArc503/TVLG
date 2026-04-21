/**
 * detail.js — Vista de detalle de película/serie v2.0
 * Mejoras: season picker modal, foco mejorado, sin prompt(), mejor UX
 */

const DetailView = (() => {

  let _item          = null;
  let _seasons       = [];
  let _currentSeason = 0;
  let _playUrls      = [];
  let _playerData    = null;
  let _isSeries      = false;

  // ─── Mostrar ──────────────────────────────────────────────────────────────
  async function show(item) {
    _item     = item;
    _seasons  = [];
    _playUrls = [];
    _isSeries = isSeriesType(item.type);

    const view = document.getElementById('view-detail');
    view.style.display = '';
    view.classList.add('entering');
    setTimeout(() => view.classList.remove('entering'), 400);

    renderBasic(item);
    showLoader(true);

    document.getElementById('detail-back').onclick = () => App.goBack();

    try {
      await API.enrichItem(item);
      updateBackdrop(item);
      updateSynopsis(item.overview);

      if (item.id > 0) {
        API.hit(item.id, item.type);

        if (_isSeries) {
          _seasons = await API.getSeasons(item.id);
          renderEpisodes(_seasons, 0);
          activateSeriesPlayButton(_seasons);
        } else {
          _playerData = await API.getPlayer(item.id);
          _playUrls   = API.getPlayableUrls(_playerData);
          updatePlayButton();
        }
      }

    } catch (e) {
      console.error('Detail load error', e);
      updateSynopsis('No se pudieron cargar los detalles.');
      updatePlayButton();
    } finally {
      showLoader(false);
      // Foco inicial
      setTimeout(() => {
        let target = null;
        if (_isSeries) {
          // Para series: foco en el botón "Comenzar Episodio 1"
          const btnPlay = document.getElementById('btn-play');
          if (btnPlay && !btnPlay.disabled) target = btnPlay;
          else target = document.querySelector('#ep-list .ep-item');
        }
        if (!target) target = document.getElementById('btn-play');
        if (!target || target.style.display === 'none') target = document.getElementById('detail-back');
        if (target) Nav.focus(target);
      }, 120);
    }
  }

  // ─── Render básico ────────────────────────────────────────────────────────
  function renderBasic(item) {
    document.getElementById('detail-title').textContent    = item.title || '';
    document.getElementById('detail-year').textContent     = item.year  || '';
    document.getElementById('detail-synopsis').textContent = item.overview || 'Cargando sinopsis…';
    document.getElementById('detail-rating').textContent   = item.rating
      ? '★ ' + item.rating.toFixed(1) : '★ —';

    document.getElementById('detail-badge-type').textContent =
      item.type === 'animes' ? 'ANIME' : (_isSeries ? 'SERIE' : 'PELÍCULA');

    const btnPlay = document.getElementById('btn-play');
    btnPlay.disabled    = true;
    btnPlay.innerHTML   = '<span class="spinner" style="width:22px;height:22px;border-width:3px;display:inline-block"></span>';
    btnPlay.style.display = '';

    const bd = document.getElementById('detail-backdrop');
    bd.style.opacity = '0';
    bd.src = item.posterUrl || '';
    bd.onload = () => { bd.style.transition = 'opacity 0.5s ease'; bd.style.opacity = '1'; };
    bd.onerror = () => { bd.style.opacity = '1'; };

    document.getElementById('panel-episodes').style.display   = 'none';
    document.getElementById('meta-dot-seasons').style.display = 'none';
    document.getElementById('detail-seasons').style.display   = 'none';

    document.getElementById('btn-mylist').onclick = () => App.toast('✓ Agregado a Mi Lista');
  }

  function updateBackdrop(item) {
    const bd = document.getElementById('detail-backdrop');
    const src = item.backdropUrl || item.posterUrl || '';
    if (src && bd.src !== src) {
      bd.style.opacity = '0';
      bd.src = src;
      bd.onload = () => {
        bd.style.transition = 'opacity 0.5s ease';
        bd.style.opacity = '1';
      };
    }
  }

  function updateSynopsis(text) {
    document.getElementById('detail-synopsis').textContent = text || 'Sin sinopsis disponible.';
  }

  function updatePlayButton() {
    const btn = document.getElementById('btn-play');

    if (_isSeries) {
      // Para series: mostrar "Comenzar Episodio 1" que lanza T1E1
      btn.style.display = '';
      btn.disabled = true;
      btn.innerHTML = 'Cargando episodios…';
      // El botón se activa en renderEpisodes() cuando los episodios estén listos
      return;
    }

    btn.style.display = '';

    if (_playUrls.length) {
      btn.disabled  = false;
      btn.innerHTML = '▶ Reproducir';
      btn.onclick   = () => App.showPlayer(_playUrls, _item.title, _playerData);
    } else {
      btn.disabled  = true;
      btn.innerHTML = 'No disponible';
    }
  }

  function activateSeriesPlayButton(seasons) {
    const btn = document.getElementById('btn-play');
    if (!_isSeries || !seasons || !seasons.length) return;

    const firstSeason = seasons[0];
    const firstEp = firstSeason && firstSeason.episodes && firstSeason.episodes[0];

    if (!firstEp) {
      btn.disabled = true;
      btn.innerHTML = 'Sin episodios';
      return;
    }

    btn.disabled  = false;
    btn.innerHTML = `▶ Comenzar Episodio 1`;
    btn.onclick   = () => loadEpisode(firstEp);
  }

  // ─── Episodios ───────────────────────────────────────────────────────────
  function renderEpisodes(seasons, seasonIndex) {
    if (!seasons || !seasons.length) {
      // Mostrar mensaje de error
      document.getElementById('panel-episodes').style.display = '';
      document.getElementById('ep-list').innerHTML = `
        <div class="empty-state" style="height:200px">
          <div class="empty-icon" style="font-size:40px">📭</div>
          <div class="empty-text" style="font-size:16px">Sin episodios disponibles</div>
        </div>`;
      return;
    }

    _currentSeason = Math.max(0, Math.min(seasonIndex, seasons.length - 1));
    const season = seasons[_currentSeason];

    document.getElementById('panel-episodes').style.display = '';

    const countEl = document.getElementById('detail-seasons');
    countEl.style.display = '';
    document.getElementById('meta-dot-seasons').style.display = '';
    countEl.textContent = seasons.length + (seasons.length === 1 ? ' temporada' : ' temporadas');

    const sel = document.getElementById('season-selector');
    sel.textContent = 'T' + season.seasonNumber + (seasons.length > 1 ? ' ▾' : '');
    sel.onclick = seasons.length > 1 ? () => showSeasonPickerModal(seasons) : null;

    const list = document.getElementById('ep-list');
    list.innerHTML = '';

    (season.episodes || []).forEach(ep => {
      const item = createEpisodeItem(ep);
      list.appendChild(item);
    });
  }

  function createEpisodeItem(ep) {
    const div = document.createElement('div');
    div.className = 'ep-item focusable';
    div.tabIndex  = 0;
    div.dataset.epId = ep.id;

    const num = document.createElement('div');
    num.className = 'ep-num';
    num.textContent = ep.episodeNumber;

    const thumb = document.createElement('img');
    thumb.className = 'ep-thumb';
    // Limpiar el título del episodio para el alt
    const cleanTitle = cleanEpTitle(ep.title);
    thumb.alt = cleanTitle;

    // Usar stillUrl si existe, si no usar el poster de la serie como fallback
    const fallbackSrc = (_item && (_item.posterUrl || _item.backdropUrl)) || '';
    if (ep.stillUrl) {
      thumb.src = ep.stillUrl;
      thumb.onerror = () => {
        // Si falla el still, usar el poster de la serie
        thumb.onerror = null;
        thumb.src = fallbackSrc;
        if (!fallbackSrc) thumb.style.background = 'var(--surface2)';
      };
    } else {
      // Sin still: usar poster directamente
      thumb.src = fallbackSrc;
      if (!fallbackSrc) thumb.style.background = 'var(--surface2)';
      thumb.onerror = () => { thumb.onerror = null; thumb.style.background = 'var(--surface2)'; };
    }

    // Estilos de object-fit para que el poster se vea bien (es vertical, no horizontal)
    if (!ep.stillUrl) {
      thumb.style.objectPosition = 'center top';
    }

    const info = document.createElement('div');
    info.className = 'ep-info';

    const name = document.createElement('div');
    name.className = 'ep-name';
    name.textContent = cleanTitle;

    const meta = document.createElement('div');
    meta.className = 'ep-meta';
    meta.textContent = `Temporada ${ep.seasonNumber} · Episodio ${ep.episodeNumber}`;

    info.appendChild(name);
    info.appendChild(meta);
    div.appendChild(num);
    div.appendChild(thumb);
    div.appendChild(info);

    div.onclick = () => loadEpisode(ep);
    div.setAttribute('aria-label', `Episodio ${ep.episodeNumber}: ${cleanTitle}`);

    return div;
  }

  // Limpia títulos como "Nombre Serie: Temporada 1 Episodio 1" → "Episodio 1"
  // o "Serie — T1E1 · Titulo" → "Titulo"
  function cleanEpTitle(title) {
    if (!title || !_item) return title || '';
    let t = title;
    // Quitar el nombre de la serie del principio si aparece
    const seriesName = (_item.title || '').trim();
    if (seriesName && t.startsWith(seriesName)) {
      t = t.slice(seriesName.length).replace(/^[\s:·\-–—]+/, '').trim();
    }
    // Si queda vacío o solo era el nombre de la serie, poner título genérico
    if (!t) t = 'Episodio';
    return t;
  }

  async function loadEpisode(ep) {
    if (!ep || !ep.id) return;
    showLoader(true);
    try {
      API.hit(ep.id, 'episodes');
      const player = await API.getPlayer(ep.id);
      const urls   = API.getPlayableUrls(player);
      showLoader(false);
      if (!urls.length) {
        App.toast('⚠ Sin servidores disponibles para este episodio');
        return;
      }
      const epTitle = cleanEpTitle(ep.title);
      const title = `${_item.title} — T${ep.seasonNumber}:E${ep.episodeNumber}${epTitle && epTitle !== 'Episodio' ? ' · ' + epTitle : ''}`;
      App.showPlayer(urls, title, player, {
        // Contexto de siguiente episodio
        seasons:       _seasons,
        currentSeason: _currentSeason,
        currentEp:     ep,
      });
    } catch (e) {
      showLoader(false);
      App.toast('Error al cargar episodio');
      console.error('loadEpisode error', e);
    }
  }

  // ─── Season picker modal (reemplaza prompt()) ─────────────────────────────
  function showSeasonPickerModal(seasons) {
    // Quitar modal anterior si existe
    closeSeasonPickerModal();

    const overlay = document.createElement('div');
    overlay.className = 'season-picker-overlay';
    overlay.id = 'season-picker-overlay';

    const box = document.createElement('div');
    box.className = 'season-picker-box';

    const title = document.createElement('div');
    title.className = 'season-picker-title';
    title.textContent = 'Seleccionar Temporada';
    box.appendChild(title);

    const buttons = [];

    seasons.forEach((s, i) => {
      const btn = document.createElement('button');
      btn.className = 'season-picker-item focusable' + (i === _currentSeason ? ' active' : '');
      btn.textContent = `Temporada ${s.seasonNumber}`;
      if (s.episodes) btn.textContent += ` (${s.episodes.length} eps)`;
      btn.onclick = () => {
        closeSeasonPickerModal();
        renderEpisodes(seasons, i);
        setTimeout(() => {
          const first = document.querySelector('#ep-list .ep-item');
          if (first) Nav.focus(first);
        }, 80);
      };
      box.appendChild(btn);
      buttons.push(btn);
    });

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    // Cerrar al click en el overlay
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeSeasonPickerModal();
    });

    // Foco en la temporada actual
    setTimeout(() => {
      if (buttons[_currentSeason]) Nav.focus(buttons[_currentSeason]);
    }, 60);
  }

  function closeSeasonPickerModal() {
    const existing = document.getElementById('season-picker-overlay');
    if (existing) existing.remove();
  }

  // ─── Utilidades ────────────────────────────────────────────────────────────
  function isSeriesType(type) {
    const t = (type || '').toLowerCase();
    return t === 'tvshows' || t === 'animes' || t === 'series' || t === 'tv';
  }

  function showLoader(show) {
    document.getElementById('detail-loader').style.display = show ? 'flex' : 'none';
  }

  function hide() {
    closeSeasonPickerModal();
    Nav.saveFocusForView('detail');
    document.getElementById('view-detail').style.display = 'none';
  }

  function restore() {
    const view = document.getElementById('view-detail');
    if (!view) return;

    view.style.display = '';
    view.style.opacity = '1';
    view.style.transition = '';
    view.classList.remove('entering');

    const backdrop = document.getElementById('detail-backdrop');
    if (backdrop) {
      backdrop.style.opacity = '1';
      if (_item && (backdrop.src !== (_item.backdropUrl || _item.posterUrl || ''))) {
        backdrop.src = _item.backdropUrl || _item.posterUrl || '';
      }
    }

    showLoader(false);
  }

  // Exponer contexto de episodios para el player (siguiente episodio)
  function getEpisodeContext() {
    return { seasons: _seasons, currentSeason: _currentSeason };
  }

  return { show, hide, restore, getEpisodeContext, loadEpisode };

})();
