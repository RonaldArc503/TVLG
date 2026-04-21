/**
 * sw.js — Service Worker para bloqueo de anuncios REX v1.0
 * Intercepta peticiones de red y bloquea dominios publicitarios conocidos
 * Cubre: pop-ups, overlays, trackers, redirects de anuncios
 */

const SW_VERSION = 'rex-adblock-v1';

// ─── Dominios y patrones a bloquear ─────────────────────────────────────────
const BLOCKED_DOMAINS = [
  // Redes publicitarias genéricas
  'doubleclick.net', 'googlesyndication.com', 'googletagmanager.com',
  'googletagservices.com', 'adservice.google.com', 'pagead2.googlesyndication.com',
  'adnxs.com', 'ads.yahoo.com', 'advertising.com', 'adtech.de',
  'adsystem.com', 'adbrite.com', 'adhese.com', 'adform.net',
  'adsrvr.org', 'adgrx.com', 'contextweb.com', 'casalemedia.com',
  'rubiconproject.com', 'pubmatic.com', 'openx.net', 'appnexus.com',
  'criteo.com', 'criteo.net', 'taboola.com', 'outbrain.com',
  'revcontent.com', 'mgid.com', 'content.ad',

  // Trackers y analytics no esenciales
  'hotjar.com', 'mouseflow.com', 'fullstory.com',
  'segment.io', 'segment.com', 'mixpanel.com',
  'amplitude.com', 'heap.io', 'kissmetrics.com',

  // Servidores de anuncios de video (VAST/VPAID)
  'imasdk.googleapis.com', 'static.ads-twitter.com',
  'ads.linkedin.com', 'ads.pinterest.com',
  'securepubads.g.doubleclick.net',

  // Popunder / redirect maliciosos comunes en sitios de streaming
  'popunder.ru', 'trafficjunky.net', 'exoclick.com', 'exosrv.com',
  'traffic-media.co', 'hilltopad.com', 'juicyads.com',
  'ero-advertising.com', 'plugrush.com', 'tsyndicate.com',
  'clickadu.com', 'adsterra.com', 'propellerads.com',
  'pushground.com', 'evadav.com', 'adcash.com',
  'yllix.com', 'popcash.net', 'popads.net', 'adpop.me',
  'adskeeper.co.uk', 'bidvertiser.com', 'trafficshop.com',
  'trafficstars.com', 'trafficfactory.biz', 'trafficrouter.io',
  'gounlimited.to', 'mooncdn.com', 'viidcloud.com',
  'supervideo.tv', 'supervideo.cc',

  // Monetización de streams piratas conocidos
  'cdn77.org', /* algunos nodos usados para ads */
  'stream-hub.co', 'go2cpx.com', 'go2speed.org',
  'directfunds.biz', 'directfunds.net',
  'rotator.adjunky.com', 'global-files.net',
];

// Patrones de URL a bloquear (regex)
const BLOCKED_PATTERNS = [
  /\/ads?\//i,
  /\/advertisement\//i,
  /\/adserver\//i,
  /\/adservice\//i,
  /\/vastproxy\//i,
  /\/vast\.xml/i,
  /\/vpaid\//i,
  /[?&]adunit=/i,
  /[?&]adsense=/i,
  /\/pop(under|up)\//i,
  /\/banner\//i,
  /\/sponsored\//i,
  /googlesyndication/i,
  /\/clicktracker\//i,
  /\/impression\//i,
  /\/beacon\//i,
  // Iframes de pop-ups dentro de iframes
  /window\.open\s*\(/,
];

// URLs que SIEMPRE se permiten (whitelist de recursos del player)
const ALLOWED_DOMAINS = [
  'allcalidad.re',
  'allcalidad.com',
  'themoviedb.org',
  'image.tmdb.org',
  'cdn.jsdelivr.net',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'vimeos.net',
  'goodstream.one',
  // Dominios de streams de video legítimos
  'akamaized.net',
  'fastly.net',
  'cloudfront.net',
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function isBlocked(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();

    // Whitelist: siempre permitir
    for (const allowed of ALLOWED_DOMAINS) {
      if (host === allowed || host.endsWith('.' + allowed)) return false;
    }

    // Bloquear por dominio
    for (const blocked of BLOCKED_DOMAINS) {
      if (host === blocked || host.endsWith('.' + blocked)) return true;
    }

    // Bloquear por patrón de URL
    const fullUrl = url.toLowerCase();
    for (const pattern of BLOCKED_PATTERNS) {
      if (pattern.test(fullUrl)) return true;
    }

    return false;
  } catch {
    return false;
  }
}

// Respuesta vacía para recursos bloqueados según su tipo
function blockedResponse(url) {
  const isScript = /\.(js)(\?|$)/i.test(url);
  const isStyle  = /\.(css)(\?|$)/i.test(url);
  const isImg    = /\.(png|jpg|jpeg|gif|webp|svg)(\?|$)/i.test(url);

  if (isScript) return new Response('/* blocked by REX adblock */', {
    status: 200,
    headers: { 'Content-Type': 'application/javascript' }
  });
  if (isStyle) return new Response('/* blocked */', {
    status: 200,
    headers: { 'Content-Type': 'text/css' }
  });
  if (isImg) return new Response('', {
    status: 200,
    headers: { 'Content-Type': 'image/gif', 'Content-Length': '0' }
  });

  // Para todo lo demás (iframes de ads, tracking pixels, beacons)
  return new Response('', { status: 200 });
}

// ─── Lifecycle ──────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  console.log('[REX SW] Instalado v1');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[REX SW] Activado');
  event.waitUntil(self.clients.claim());
});

// ─── Interceptar fetch ───────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = request.url;

  // Solo interceptar HTTP/HTTPS
  if (!url.startsWith('http')) return;

  // No interceptar navegación principal
  if (request.mode === 'navigate') return;

  if (isBlocked(url)) {
    console.log('[REX SW] 🚫 Bloqueado:', url);
    event.respondWith(blockedResponse(url));
    return;
  }

  // Dejar pasar todo lo demás
  // event.respondWith(fetch(request)); // NO interceptar para no romper CORS
});