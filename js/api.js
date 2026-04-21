/**
 * api.js — Capa de red para REX webOS v2.0
 */

const API = (() => {

  const SITE_BASE  = 'https://allcalidad.re';
  const API_BASE   = 'https://allcalidad.re/api/rest';
  const TMDB_KEY   = '07a2f9f121ce6f9371fd05194a0fb7e3'; // Reemplazar con clave real
  const TMDB_BASE  = 'https://api.themoviedb.org/3';
  const TMDB_IMG   = 'https://image.tmdb.org/t/p/w500';
  const TMDB_IMG_W = 'https://image.tmdb.org/t/p/w1280';

  const _tmdbCache = {};

  const HEADERS = {
    'Accept':          'application/json, text/plain, */*',
    'Accept-Language': 'es-ES,es;q=0.9,en-US;q=0.8',
  };

  // ─── HTTP helper ────────────────────────────────────────────────────────
  async function httpGet(url, retries = 1) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(url, { headers: HEADERS });
        if (!res.ok) {
          const isServerError = res.status >= 500 || res.status === 429;
          if (isServerError && attempt < retries) { await sleep(800); continue; }
          throw new Error('HTTP ' + res.status);
        }
        return await res.json();
      } catch (e) {
        if (attempt < retries) { await sleep(800); continue; }
        throw e;
      }
    }
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // ─── normalizeUrl ────────────────────────────────────────────────────────
  function normalizeUrl(raw) {
    if (!raw) return '';
    const v = raw.trim();
    if (!v) return '';
    if (v.startsWith('//'))       return 'https:' + v;
    if (v.startsWith('http'))     return v;
    if (v.startsWith('/thumbs/')) return SITE_BASE + '/wp-content/uploads' + v;
    if (v.startsWith('/'))        return SITE_BASE + v;
    return SITE_BASE + '/' + v;
  }

  // ─── parseList ────────────────────────────────────────────────────────────
  function parseList(root) {
    const list = [];
    if (!root || root.error) return list;

    let posts = null;
    if (root.data && root.data.posts)      posts = root.data.posts;
    else if (Array.isArray(root.data))     posts = root.data;
    if (!posts) return list;

    for (const post of posts) {
      const item = {};
      item.id       = post._id || post.ID || 0;
      item.title    = post.title || '';
      item.overview = post.overview || post.description || '';
      item.rating   = parseFloat(post.rating) || 0;
      item.type     = normalizeType(post.type || post.post_type || '');

      const date = post.release_date || '';
      item.year = date.length >= 4 ? date.substring(0, 4) : '';

      const images = post.images || {};
      item.posterUrl   = normalizeUrl(images.poster || post.poster || '');
      item.backdropUrl = normalizeUrl(images.backdrop || '');

      const slug = post.slug || '';
      item.slug      = slug;
      item.detailUrl = slug ? buildDetailUrl(item.type, slug) : normalizeUrl(post.url || '');

      if (item.title) list.push(item);
    }
    return list;
  }

  function normalizeType(raw) {
    const v = (raw || '').trim().toLowerCase();
    if (!v || v === 'movie')              return 'movies';
    if (v === 'tvshow' || v === 'series') return 'tvshows';
    if (v === 'anime')                    return 'animes';
    return v || 'movies';
  }

  function buildDetailUrl(type, slug) {
    if (!slug) return '';
    if (type === 'tvshows') return SITE_BASE + '/series/' + slug + '/';
    if (type === 'animes')  return SITE_BASE + '/animes/' + slug + '/';
    return SITE_BASE + '/peliculas/' + slug + '/';
  }

  // ─── ENDPOINTS ────────────────────────────────────────────────────────────

  async function getFeaturedMovies() {
    try {
      const data = await httpGet(API_BASE + '/sliders?type=movies&posts_per_page=8');
      return parseList(data);
    } catch (e) { console.warn('getFeatured failed', e); return []; }
  }

  async function getMovies(page = 1) {
    const data = await httpGet(`${API_BASE}/listing?page=${page}&post_type=movies&posts_per_page=16&genres=&years=`);
    return parseList(data);
  }

  async function getTvShows(page = 1) {
    const data = await httpGet(`${API_BASE}/listing?page=${page}&post_type=tvshows&posts_per_page=16&genres=&years=`);
    return parseList(data);
  }

  async function getPopularMovies() {
    const data = await httpGet(`${API_BASE}/tops?range=month&limit=24&post_type=movies`);
    return parseList(data);
  }

  async function getPopularTvShows() {
    const data = await httpGet(`${API_BASE}/tops?range=month&limit=24&post_type=tvshows`);
    return parseList(data);
  }

  async function search(query, page = 1) {
    const q = encodeURIComponent(query);
    const data = await httpGet(`${API_BASE}/search?query=${q}&page=${page}&post_type=movies%2Ctvshows%2Canimes&posts_per_page=16`);
    return parseList(data);
  }

  async function getSeasons(postId) {
    try {
      const data = await httpGet(`${API_BASE}/episodes?post_id=${postId}`);
      if (!data || data.error) return [];
      return parseSeasons(data.data);
    } catch (e) { console.warn('getSeasons failed', e); return []; }
  }

  function parseSeasons(data) {
    if (!data) return [];
    let arr = null;
    if (Array.isArray(data))        arr = data;
    else if (data.seasons)          arr = data.seasons;
    else if (data.episodes)         arr = data.episodes;
    if (!arr) return [];

    const isSeasonContainer = arr.length > 0 && arr[0] && arr[0].episodes;
    if (isSeasonContainer) {
      return arr.map((s, i) => ({
        seasonNumber: s.season_number || s.season || s.number || (i + 1),
        episodes: (s.episodes || []).map((e, ei) => parseEpisode(e, s.seasonNumber, ei + 1)).filter(Boolean)
      })).filter(s => s.episodes.length > 0)
        .sort((a, b) => a.seasonNumber - b.seasonNumber);
    }

    const map = {};
    arr.forEach((e, i) => {
      const ep = parseEpisode(e, 1, i + 1);
      if (!ep) return;
      const sn = ep.seasonNumber || 1;
      if (!map[sn]) map[sn] = { seasonNumber: sn, episodes: [] };
      map[sn].episodes.push(ep);
    });
    return Object.values(map).sort((a, b) => a.seasonNumber - b.seasonNumber);
  }

  function parseEpisode(obj, fallbackSeason, fallbackEp) {
    if (!obj) return null;
    const id = obj.post_id || obj._id || obj.ID || 0;
    if (!id) return null;
    return {
      id,
      seasonNumber:  obj.season_number  || obj.season  || fallbackSeason,
      episodeNumber: obj.episode_number || obj.episode || obj.number || fallbackEp,
      title:         obj.title || obj.name || ('Episodio ' + (obj.episode_number || fallbackEp)),
      overview:      obj.overview || obj.description || '',
      stillUrl:      normalizeUrl(obj.still_path || obj.still || ''),
    };
  }

  async function getPlayer(postId) {
    const data = await httpGet(`${API_BASE}/player?post_id=${postId}&_any=1`);
    if (!data || data.error) return { embedUrl: '', servers: [] };
    return parsePlayerData(data.data);
  }

  function parsePlayerData(d) {
    const result = { embedUrl: '', servers: [] };
    if (!d) return result;

    if (Array.isArray(d)) {
      d.forEach((item, i) => addServer(result, item, 'Servidor ' + (i + 1)));
      if (!result.embedUrl && result.servers.length) result.embedUrl = result.servers[0].url;
      return result;
    }

    result.embedUrl = normalizeUrl(d.embed_url || d.iframe_url || d.url || '');
    (d.servers || []).forEach((s, i) => addServer(result, s, 'Servidor ' + (i + 1)));
    (d.embeds  || []).forEach((e, i) => {
      if (typeof e === 'string') result.servers.push({ name: 'Embed ' + (i + 1), url: normalizeUrl(e) });
      else addServer(result, e, 'Embed ' + (i + 1));
    });

    if (!result.embedUrl && result.servers.length) result.embedUrl = result.servers[0].url;
    return result;
  }

  function addServer(pd, obj, fallback) {
    if (!obj) return;
    const url = normalizeUrl(obj.url || obj.embed_url || obj.iframe_url || '');
    if (!url) return;
    pd.servers.push({ name: obj.name || obj.lang || fallback, url });
  }

  function getPlayableUrls(playerData) {
    const seen = new Set();
    const urls = [];
    const push = u => { if (u && !seen.has(u)) { seen.add(u); urls.push(u); } };
    push(playerData.embedUrl);
    (playerData.servers || []).forEach(s => push(s.url));
    return urls;
  }

  async function hit(postId, postType) {
    if (!postId) return;
    try {
      const t = encodeURIComponent(postType || 'movies');
      await httpGet(`${API_BASE}/hit?nocache=${Date.now()}&post_id=${postId}&post_type=${t}`);
    } catch (_) { /* best effort */ }
  }

  // ─── TMDB ──────────────────────────────────────────────────────────────────

  async function enrichItem(item) {
    if (!TMDB_KEY || TMDB_KEY === 'TU_TMDB_API_KEY_AQUI') return item;
    const key = (item.title + '|' + item.year + '|' + item.type).toLowerCase();
    if (_tmdbCache[key] !== undefined) {
      applyTmdb(item, _tmdbCache[key]);
      return item;
    }
    const isSeries = item.type === 'tvshows' || item.type === 'animes';
    const result = await fetchTmdb(item.title, item.year, isSeries ? 'tv' : 'movie')
                || await fetchTmdb(item.title, item.year, 'multi');
    _tmdbCache[key] = result || null;
    applyTmdb(item, result);
    return item;
  }

  async function enrichItems(items) {
    const BATCH = 8;
    for (let i = 0; i < items.length; i += BATCH) {
      await Promise.all(items.slice(i, i + BATCH).map(enrichItem));
    }
    return items;
  }

  async function fetchTmdb(title, year, endpoint) {
    try {
      const clean = title.replace(/\(\d{4}\)/g, '').replace(/\[.*?\]/g, '').trim();
      if (!clean) return null;
      let url = `${TMDB_BASE}/search/${endpoint}?api_key=${TMDB_KEY}&language=es-ES&include_adult=false&query=${encodeURIComponent(clean)}`;
      if (year && /^\d{4}$/.test(year)) {
        url += endpoint === 'tv' ? `&first_air_date_year=${year}` : `&year=${year}`;
      }
      const data = await fetch(url).then(r => r.ok ? r.json() : null);
      if (!data || !data.results || !data.results.length) return null;
      const r = data.results[0];
      return {
        posterUrl:   r.poster_path   ? TMDB_IMG   + r.poster_path   : null,
        backdropUrl: r.backdrop_path ? TMDB_IMG_W + r.backdrop_path : null,
        overview:    r.overview || '',
      };
    } catch { return null; }
  }

  function applyTmdb(item, result) {
    if (!result) return;
    if (result.posterUrl)                  item.posterUrl   = result.posterUrl;
    if (result.backdropUrl)                item.backdropUrl = result.backdropUrl;
    if (!item.overview && result.overview) item.overview    = result.overview;
  }

  // ─── HOME ─────────────────────────────────────────────────────────────────

  const HOME_TTL = 7 * 60 * 1000;
  let _homeCache   = null;
  let _homeCacheAt = 0;

  async function loadHomeSections(forceRefresh = false) {
    if (!forceRefresh && _homeCache && (Date.now() - _homeCacheAt) < HOME_TTL) {
      return _homeCache;
    }

    const stagger = 120;
    const promises = [];

    promises.push(getFeaturedMovies());  await sleep(stagger);
    promises.push(getPopularMovies());   await sleep(stagger);
    promises.push(getMovies(1));         await sleep(stagger);
    promises.push(getTvShows(1));        await sleep(stagger);
    promises.push(getPopularTvShows());

    const [featured, popular, latest, series, popularSeries] = await Promise.allSettled(promises)
      .then(results => results.map(r => r.status === 'fulfilled' ? r.value : []));

    const sections = [];
    const fi = (featured.length ? featured : latest).slice(0, 10);
    if (fi.length)             sections.push({ title: '🔥 Destacadas',         items: fi });
    if (popular.length)        sections.push({ title: '📈 Populares del Mes',   items: popular.slice(0, 16) });
    if (latest.length)         sections.push({ title: '🎬 Últimas Películas',   items: latest.slice(0, 16) });
    if (series.length)         sections.push({ title: '📺 Series',              items: series.slice(0, 16) });
    if (popularSeries.length)  sections.push({ title: '⭐ Series Populares',    items: popularSeries.slice(0, 16) });

    _homeCache   = sections;
    _homeCacheAt = Date.now();
    return sections;
  }

  return {
    loadHomeSections, search, getSeasons, getPlayer,
    getPlayableUrls, hit, enrichItem, enrichItems,
    normalizeType,
  };

})();