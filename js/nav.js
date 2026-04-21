/**
 * nav.js — Motor de navegación D-pad para webOS LG v2.0
 * Mejoras: foco persistente, navegación spatial mejorada, historial de foco
 */

const Nav = (() => {

  let _focused  = null;
  let _enabled  = true;
  // Historial de foco por vista para restaurar al volver
  const _focusHistory = {};

  const FOCUS_CLASS = 'focused';

  // ─── Inicialización ────────────────────────────────────────────────────────
  function init() {
    document.addEventListener('keydown', onKey, true);

    // Mantener _focused sincronizado con foco real del DOM
    document.addEventListener('focusin', (e) => {
      const el = e.target;
      if (el && el.matches('.focusable, [tabindex="0"]') && !el.disabled) {
        if (_focused && _focused !== el) {
          _focused.classList.remove(FOCUS_CLASS);
        }
        _focused = el;
        _focused.classList.add(FOCUS_CLASS);
      }
    });

    document.addEventListener('focusout', () => {
      // No quitar la clase — la mantenemos para que la TV no pierda el estado
    });
  }

  // ─── focus ────────────────────────────────────────────────────────────────
  function focus(el) {
    if (!el) return;
    if (el === _focused) return;

    // Quitar clase del anterior
    if (_focused) {
      _focused.classList.remove(FOCUS_CLASS);
    }

    _focused = el;
    _focused.classList.add(FOCUS_CLASS);

    // Intentar focus nativo (para accesibilidad y scroll)
    try {
      _focused.focus({ preventScroll: false });
    } catch(e) {}

    // Scroll suave para que la card sea visible
    _focused.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
      behavior: 'smooth'
    });
  }

  function getFocused() { return _focused; }

  // ─── Guardar/restaurar historial de foco por vista ────────────────────────
  function saveFocusForView(viewId) {
    if (_focused) _focusHistory[viewId] = _focused;
  }

  function restoreFocusForView(viewId) {
    const saved = _focusHistory[viewId];
    if (saved && document.contains(saved) && isVisible(saved)) {
      focus(saved);
      return true;
    }
    return false;
  }

  function isVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    return style.display !== 'none' &&
           style.visibility !== 'hidden' &&
           !el.disabled;
  }

  // ─── Obtener todos los elementos focusables visibles ──────────────────────
  function getFocusables(container) {
    const root = container || document.getElementById('app');
    return Array.from(root.querySelectorAll('.focusable, [tabindex="0"]'))
      .filter(el => isVisible(el) && document.contains(el));
  }

  // ─── Navegación espacial mejorada ─────────────────────────────────────────
  function navigate(direction) {
    const all = getFocusables();
    if (!all.length) return;

    // Si no hay foco válido, enfocar el primero
    if (!_focused || !all.includes(_focused)) {
      focus(all[0]);
      return;
    }

    const rect = _focused.getBoundingClientRect();
    const cx = rect.left + rect.width  / 2;
    const cy = rect.top  + rect.height / 2;

    let best = null;
    let bestScore = Infinity;

    for (const el of all) {
      if (el === _focused) continue;

      const er = el.getBoundingClientRect();
      const ex = er.left + er.width  / 2;
      const ey = er.top  + er.height / 2;
      const dx = ex - cx;
      const dy = ey - cy;

      // Filtro estricto por dirección con umbral para evitar "derivas"
      let inDirection = false;
      const threshold = 10;
      switch (direction) {
        case 'up':    inDirection = dy < -threshold; break;
        case 'down':  inDirection = dy >  threshold; break;
        case 'left':  inDirection = dx < -threshold; break;
        case 'right': inDirection = dx >  threshold; break;
      }
      if (!inDirection) continue;

      // Score: distancia primaria + penalización por desviación lateral
      let primary, lateral;
      if (direction === 'up' || direction === 'down') {
        primary = Math.abs(dy);
        lateral = Math.abs(dx);
      } else {
        primary = Math.abs(dx);
        lateral = Math.abs(dy);
      }

      // Penalizar la desviación lateral más fuertemente para columnas alineadas
      const score = primary + lateral * 2.5;

      if (score < bestScore) {
        bestScore = score;
        best = el;
      }
    }

    if (best) {
      focus(best);
    } else {
      // Si no hay siguiente en esa dirección, intentar scroll de la fila
      tryScrollRow(direction);
    }
  }

  // Scroll de fila horizontal cuando no hay más cards visibles
  function tryScrollRow(direction) {
    if (!_focused) return;
    const row = _focused.closest('.section-row, .ep-list, #search-results');
    if (!row) return;
    const scrollAmount = 200;
    if (direction === 'right') row.scrollLeft += scrollAmount;
    if (direction === 'left')  row.scrollLeft -= scrollAmount;
    if (direction === 'up')    row.scrollTop  -= scrollAmount;
    if (direction === 'down')  row.scrollTop  += scrollAmount;
  }

  // ─── Manejador de teclas ──────────────────────────────────────────────────
  function onKey(e) {
    if (!_enabled) return;

    const key = e.keyCode || 0;
    const keyStr = e.key || '';

    const isUp    = key === 38 || keyStr === 'ArrowUp';
    const isDown  = key === 40 || keyStr === 'ArrowDown';
    const isLeft  = key === 37 || keyStr === 'ArrowLeft';
    const isRight = key === 39 || keyStr === 'ArrowRight';
    const isOK    = key === 13 || keyStr === 'Enter';
    // Back: 461 = webOS, 27 = ESC (para desarrollo), 8 = Backspace
    const isBack  = key === 461 || key === 27 || key === 8;

    // Ignorar backspace si estamos en un input de texto
    if (key === 8 && e.target && e.target.tagName === 'INPUT') return;

    if (isUp)    { e.preventDefault(); navigate('up');    return; }
    if (isDown)  { e.preventDefault(); navigate('down');  return; }
    if (isLeft)  { e.preventDefault(); navigate('left');  return; }
    if (isRight) { e.preventDefault(); navigate('right'); return; }

    if (isOK) {
      e.preventDefault();
      if (_focused) _focused.click();
      return;
    }

    if (isBack) {
      e.preventDefault();
      App.goBack();
      return;
    }
  }

  // ─── Enfocar primer elemento de un contenedor ─────────────────────────────
  function focusFirst(container) {
    const all = getFocusables(container || document.getElementById('app'));
    if (all.length) focus(all[0]);
  }

  // ─── Enfocar elemento específico por selector ─────────────────────────────
  function focusSelector(selector, container) {
    const root = container || document;
    const el = root.querySelector(selector);
    if (el && isVisible(el)) { focus(el); return true; }
    return false;
  }

  function enable()  { _enabled = true; }
  function disable() { _enabled = false; }

  // ─── Asegurar que siempre haya un foco visible ────────────────────────────
  function ensureFocus() {
    if (_focused && document.contains(_focused) && isVisible(_focused)) return;
    // Buscar primer focusable visible
    const all = getFocusables();
    if (all.length) focus(all[0]);
  }

  // Chequeo periódico de foco
  setInterval(ensureFocus, 2000);

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
  };
})();