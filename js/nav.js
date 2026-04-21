/**
 * nav.js — Motor de navegación D-pad para webOS LG v2.3
 * Fix v2.3:
 *   - Row-snap: al bajar/subir de fila horizontal, salta a la PRIMERA
 *     card de la fila destino en vez de la más cercana lateralmente
 *   - Cache de focusables con MutationObserver
 *   - Batch reflow: todos los getBoundingClientRect en un solo pase
 *   - Throttle de tecla: evita 15 navegaciones/seg al sostener el mando
 *   - Scroll manual instantáneo separado en eje horizontal y vertical
 */

const Nav = (() => {

  let _focused  = null;
  let _enabled  = true;
  const _focusHistory = {};
  const FOCUS_CLASS = 'focused';

  const SCROLL_PAD_V    = 100;
  const SCROLL_PAD_H    = 60;
  const NAV_THROTTLE_MS = 130;
  let _lastNavTime = 0;

  // ── Cache de focusables ────────────────────────────────────────────────────
  let _focusCache      = null;
  let _focusCacheDirty = true;

  function invalidateCache() {
    _focusCacheDirty = true;
    _focusCache = null;
  }

  var _observer = new MutationObserver(function(mutations) {
    for (var i = 0; i < mutations.length; i++) {
      var m = mutations[i];
      if (m.type === 'childList' ||
          (m.type === 'attributes' &&
           (m.attributeName === 'style' ||
            m.attributeName === 'class' ||
            m.attributeName === 'disabled'))) {
        invalidateCache();
        return;
      }
    }
  });

  function startObserver() {
    var app = document.getElementById('app');
    if (app) {
      _observer.observe(app, {
        childList:  true,
        subtree:    true,
        attributes: true,
        attributeFilter: ['style', 'class', 'disabled']
      });
    }
  }

  // ── Obtener focusables (con cache) ────────────────────────────────────────
  function getFocusables(container) {
    if (container) {
      return Array.from(container.querySelectorAll('.focusable, [tabindex="0"]'))
        .filter(function(el) { return isVisible(el) && document.contains(el); });
    }
    if (!_focusCacheDirty && _focusCache) return _focusCache;
    var root = document.getElementById('app') || document.body;
    _focusCache = Array.from(root.querySelectorAll('.focusable, [tabindex="0"]'))
      .filter(function(el) { return isVisible(el) && document.contains(el); });
    _focusCacheDirty = false;
    return _focusCache;
  }

  // ── Helper: fila horizontal a la que pertenece un elemento ───────────────
  function getScrollRow(el) {
    return el ? el.closest('.section-row, .ep-list') : null;
  }

  // ── Navegación espacial ────────────────────────────────────────────────────
// nav.js - Reemplazar la función navigate() con esta versión mejorada:

function navigate(direction) {
  var now = Date.now();
  if (now - _lastNavTime < NAV_THROTTLE_MS) return;
  _lastNavTime = now;

  var all = getFocusables();
  if (!all.length) return;

  if (!_focused || all.indexOf(_focused) === -1) {
    focus(all[0]);
    return;
  }

  var rects = new Array(all.length);
  for (var i = 0; i < all.length; i++) {
    rects[i] = all[i].getBoundingClientRect();
  }

  var focusedIndex = all.indexOf(_focused);
  var rect = rects[focusedIndex];
  var cx = rect.left + rect.width / 2;
  var cy = rect.top + rect.height / 2;

  var best = null;
  var bestScore = Infinity;
  var threshold = 10;

  for (var j = 0; j < all.length; j++) {
    if (all[j] === _focused) continue;
    var er = rects[j];
    var dx = (er.left + er.width / 2) - cx;
    var dy = (er.top + er.height / 2) - cy;

    var inDir = false;
    switch (direction) {
      case 'up': inDir = dy < -threshold; break;
      case 'down': inDir = dy > threshold; break;
      case 'left': inDir = dx < -threshold; break;
      case 'right': inDir = dx > threshold; break;
    }
    if (!inDir) continue;

    var primary = (direction === 'up' || direction === 'down')
      ? Math.abs(dy) : Math.abs(dx);
    var lateral = (direction === 'up' || direction === 'down')
      ? Math.abs(dx) : Math.abs(dy);

    var score = primary + lateral * 2.5;
    if (score < bestScore) { bestScore = score; best = all[j]; }
  }

  if (best) {
    if (direction === 'down' || direction === 'up') {
      var srcRow = getScrollRow(_focused);
      var dstRow = getScrollRow(best);
      if (srcRow && dstRow && srcRow !== dstRow) {
        var candidates = dstRow.querySelectorAll('.focusable, [tabindex="0"]');
        for (var k = 0; k < candidates.length; k++) {
          if (isVisible(candidates[k]) && document.contains(candidates[k])) {
            best = candidates[k];
            break;
          }
        }
      }
    }
    focus(best);
    // Asegurar que el elemento enfocado sea visible en la vista
    ensureViewScroll(best);
  } else {
    tryScrollRow(direction);
  }
}

// Añadir esta nueva función después de navigate():
function ensureViewScroll(el) {
  if (!el) return;
  
  // Detectar qué vista está activa
  var activeView = null;
  var views = ['view-home', 'view-search', 'view-detail'];
  for (var i = 0; i < views.length; i++) {
    var v = document.getElementById(views[i]);
    if (v && v.style.display !== 'none') {
      activeView = v;
      break;
    }
  }
  
  if (!activeView) return;
  
  var elRect = el.getBoundingClientRect();
  var viewRect = activeView.getBoundingClientRect();
  
  // Scroll vertical automático
  if (elRect.bottom > viewRect.bottom - 80) {
    activeView.scrollTop += (elRect.bottom - viewRect.bottom + 100);
  } else if (elRect.top < viewRect.top + 80) {
    activeView.scrollTop -= (viewRect.top + 80 - elRect.top);
  }
  
  // Scroll horizontal dentro de rows
  var row = el.closest('.section-row, .ep-list');
  if (row) {
    var rowRect = row.getBoundingClientRect();
    if (elRect.left < rowRect.left + 40) {
      row.scrollLeft -= (rowRect.left + 40 - elRect.left);
    } else if (elRect.right > rowRect.right - 40) {
      row.scrollLeft += (elRect.right - rowRect.right + 40);
    }
  }
}
  // ── Scroll manual ─────────────────────────────────────────────────────────
  function scrollToFocused(el) {
    if (!el) return;
    var elRect = el.getBoundingClientRect();

    // 1. Scroll horizontal de la fila
    var row = el.closest('.section-row, .ep-list');
    if (row) {
      var rowRect = row.getBoundingClientRect();
      if (elRect.left < rowRect.left + SCROLL_PAD_H) {
        row.scrollLeft -= (rowRect.left + SCROLL_PAD_H - elRect.left);
      } else if (elRect.right > rowRect.right - SCROLL_PAD_H) {
        row.scrollLeft += (elRect.right - rowRect.right + SCROLL_PAD_H);
      }
      elRect = el.getBoundingClientRect();
    }

    // 2. Scroll vertical de la vista
    var view = el.closest('.view');
    if (!view) view = document.documentElement;
    var viewTop    = view === document.documentElement ? 0 : view.getBoundingClientRect().top;
    var viewBottom = view === document.documentElement ? window.innerHeight : view.getBoundingClientRect().bottom;

    if (elRect.top < viewTop + SCROLL_PAD_V) {
      view.scrollTop -= (viewTop + SCROLL_PAD_V - elRect.top);
    } else if (elRect.bottom > viewBottom - SCROLL_PAD_V) {
      view.scrollTop += (elRect.bottom - viewBottom + SCROLL_PAD_V);
    }
  }

  function tryScrollRow(direction) {
    if (!_focused) return;
    var row = _focused.closest('.section-row, .ep-list, #search-results');
    if (!row) return;
    var amount = 300;
    if (direction === 'right') row.scrollLeft += amount;
    if (direction === 'left')  row.scrollLeft -= amount;
    if (direction === 'up')    row.scrollTop  -= amount;
    if (direction === 'down')  row.scrollTop  += amount;
  }

  // ── focus ─────────────────────────────────────────────────────────────────
  function focus(el) {
    if (!el) return;
    if (el === _focused) return;
    if (_focused) _focused.classList.remove(FOCUS_CLASS);
    _focused = el;
    _focused.classList.add(FOCUS_CLASS);
    try { _focused.focus({ preventScroll: true }); } catch(e) {}
    scrollToFocused(_focused);
  }

  function getFocused() { return _focused; }

  // ── Inicialización ────────────────────────────────────────────────────────
  function init() {
    document.addEventListener('keydown', onKey, true);

    document.addEventListener('focusin', function(e) {
      var el = e.target;
      if (el && el.matches && el.matches('.focusable, [tabindex="0"]') && !el.disabled) {
        if (_focused && _focused !== el) _focused.classList.remove(FOCUS_CLASS);
        _focused = el;
        _focused.classList.add(FOCUS_CLASS);
      }
    });

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', startObserver);
    } else {
      startObserver();
    }
  }

  // ── Manejador de teclas ───────────────────────────────────────────────────
  function onKey(e) {
    if (!_enabled) return;
    var key    = e.keyCode || 0;
    var keyStr = e.key || '';

    var isUp    = key === 38 || keyStr === 'ArrowUp';
    var isDown  = key === 40 || keyStr === 'ArrowDown';
    var isLeft  = key === 37 || keyStr === 'ArrowLeft';
    var isRight = key === 39 || keyStr === 'ArrowRight';
    var isOK    = key === 13 || keyStr === 'Enter';
    var isBack  = key === 461 || key === 27 || key === 8;

    if (key === 8 && e.target && e.target.tagName === 'INPUT') return;

    if (isUp)    { e.preventDefault(); navigate('up');    return; }
    if (isDown)  { e.preventDefault(); navigate('down');  return; }
    if (isLeft)  { e.preventDefault(); navigate('left');  return; }
    if (isRight) { e.preventDefault(); navigate('right'); return; }
    if (isOK)   { e.preventDefault(); if (_focused) _focused.click(); return; }
    if (isBack) { e.preventDefault(); App.goBack(); return; }
  }

  // ── Historial de foco por vista ───────────────────────────────────────────
  function saveFocusForView(viewId) {
    if (_focused) _focusHistory[viewId] = _focused;
  }

  function restoreFocusForView(viewId) {
    var saved = _focusHistory[viewId];
    if (saved && document.contains(saved) && isVisible(saved)) {
      focus(saved);
      return true;
    }
    return false;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function isVisible(el) {
    if (!el) return false;
    var style = window.getComputedStyle(el);
    return style.display !== 'none' &&
           style.visibility !== 'hidden' &&
           !el.disabled;
  }

  function focusFirst(container) {
    var all = getFocusables(container || document.getElementById('app'));
    if (all.length) focus(all[0]);
  }

  function focusSelector(selector, container) {
    var root = container || document;
    var el = root.querySelector(selector);
    if (el && isVisible(el)) { focus(el); return true; }
    return false;
  }

  function enable()  { _enabled = true; }
  function disable() { _enabled = false; }

  function ensureFocus() {
    if (_focused && document.contains(_focused) && isVisible(_focused)) return;
    var all = getFocusables();
    if (all.length) focus(all[0]);
  }

  setInterval(ensureFocus, 5000);
  init();

  return {
    focus,
    getFocused,
    getFocusables,
    focusFirst,
    focusSelector,
    navigate,
    enable,
    disable,
    saveFocusForView,
    restoreFocusForView,
    ensureFocus,
    isVisible,
    invalidateCache,
  };
})();