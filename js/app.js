/**
 * app.js - Router principal
 * Ajustes:
 *   - Carga lazy de la vista detail desde plantilla externa
 *   - Restauracion explicita de detail al volver desde player
 *   - Menos trabajo en index.html
 */

const App = (() => {
  const _stack = [];
  let _currentView = "";
  let _searchDebounce = null;
  let _detailTemplateLoaded = false;

  async function init() {
    const ok = await loadDetailTemplate();
    if (!ok) return;

    updateClock();
    setInterval(updateClock, 30000);

    document.querySelectorAll(".nav-btn").forEach((btn) => {
      btn.classList.add("focusable");
      btn.addEventListener("click", () => {
        const view = btn.dataset.view;
        if (view === "home") showHome();
        if (view === "search") showSearch();
      });
    });

    buildKeyboard();
    initSearchInput();
    hideSplash();
    showHome();
  }

  async function loadDetailTemplate() {
    if (_detailTemplateLoaded) return true;

    const slot = document.getElementById("detail-slot");
    if (!slot) return false;

    try {
      const res = await fetch("templates/detail-view.html", { cache: "force-cache" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      slot.innerHTML = await res.text();
      _detailTemplateLoaded = true;
      return true;
    } catch (e) {
      console.error("detail template load error", e);
      const splash = document.getElementById("splash");
      if (splash) splash.style.display = "none";
      document.getElementById("app").style.display = "";
      toast("Error al cargar detalle");
      return false;
    }
  }

  function hideSplash() {
    const splash = document.getElementById("splash");
    setTimeout(() => {
      splash.style.opacity = "0";
      setTimeout(() => {
        splash.style.display = "none";
        document.getElementById("app").style.display = "";
      }, 600);
    }, 800);
  }

  function transition(toId, fromId) {
    const toEl = document.getElementById("view-" + toId);
    const fromEl = fromId ? document.getElementById("view-" + fromId) : null;

    if (toEl) {
      toEl.style.display = "";
      toEl.style.opacity = "0";
      toEl.style.transition = "opacity 0.25s ease";
      void toEl.offsetHeight;
      toEl.style.opacity = "1";
    }

    if (fromEl) {
      setTimeout(() => {
        fromEl.style.display = "none";
        fromEl.style.opacity = "";
        fromEl.style.transition = "";
      }, 60);
    }

    ["home", "search", "detail", "player"].forEach((view) => {
      if (view === toId || view === fromId) return;
      const el = document.getElementById("view-" + view);
      if (el) el.style.display = "none";
    });
  }

  function showHome() {
    const prev = _currentView;
    _stack.length = 0;
    _stack.push("home");
    _currentView = "home";

    document.getElementById("navbar").style.display = "";
    setNavActive("home");
    transition("home", prev && prev !== "home" ? prev : null);
    HomeView.show();
  }

  function showSearch() {
    const prev = _currentView || "home";
    _stack.push(prev);
    _currentView = "search";

    document.getElementById("navbar").style.display = "";
    setNavActive("search");
    transition("search", prev);

    setTimeout(() => {
      const firstKey = document.querySelector(".key");
      if (firstKey) Nav.focus(firstKey);
    }, 100);
  }

  function showDetail(item) {
    if (!_detailTemplateLoaded || !item) return;

    const prev = _currentView || "home";
    _stack.push(prev);
    _currentView = "detail";

    if (prev === "home") HomeView.hide();
    if (prev === "search") Nav.saveFocusForView("search");

    document.getElementById("navbar").style.display = "none";
    transition("detail", prev !== "player" ? prev : null);
    DetailView.show(item);
  }

  function showPlayer(urls, title, playerData, epContext) {
    const prev = _currentView || "detail";
    _stack.push(prev);
    _currentView = "player";

    document.getElementById("navbar").style.display = "none";
    transition("player", null);

    setTimeout(() => {
      if (_currentView !== "player") return;
      const detail = document.getElementById("view-detail");
      if (detail) detail.style.display = "none";
    }, 120);

    PlayerView.show(urls, title, playerData, epContext);
  }

  function goBack() {
    if (_currentView === "player") {
      const prev = _stack.pop() || "detail";

      if (prev === "detail") {
        DetailView.restore();
      }

      const destEl = document.getElementById("view-" + prev);
      if (destEl) {
        destEl.style.display = "";
        destEl.style.opacity = "0";
        void destEl.offsetHeight;
      }

      PlayerView.hide();

      if (destEl) {
        destEl.style.transition = "opacity 0.25s ease";
        destEl.style.opacity = "1";
        setTimeout(() => {
          destEl.style.transition = "";
          destEl.style.opacity = "";
        }, 280);
      }

      _currentView = prev;

      if (prev === "home" || prev === "search") {
        document.getElementById("navbar").style.display = "";
        setNavActive(prev);
      } else {
        document.getElementById("navbar").style.display = "none";
      }

      setTimeout(() => {
        if (prev === "detail") {
          const btn = document.getElementById("btn-play");
          if (btn && btn.style.display !== "none" && !btn.disabled) {
            Nav.focus(btn);
            return;
          }
          const ep = document.querySelector("#ep-list .ep-item");
          if (ep) {
            Nav.focus(ep);
            return;
          }
          Nav.focus(document.getElementById("detail-back"));
          return;
        }

        if (prev === "home") {
          if (!Nav.restoreFocusForView("home")) Nav.focusFirst(document.getElementById("view-home"));
          return;
        }

        if (prev === "search") {
          if (!Nav.restoreFocusForView("search")) Nav.focusFirst(document.getElementById("view-search"));
        }
      }, 120);
      return;
    }

    if (_currentView === "detail") {
      const prev = _stack.pop() || "home";
      DetailView.hide();
      _currentView = prev;

      document.getElementById("navbar").style.display = "";
      setNavActive(prev === "search" ? "search" : "home");
      transition(prev, "detail");

      if (prev === "home") {
        HomeView.show();
        return;
      }

      if (prev === "search") {
        document.getElementById("view-search").style.display = "";
        setTimeout(() => {
          if (!Nav.restoreFocusForView("search")) Nav.focusFirst(document.getElementById("view-search"));
        }, 100);
        return;
      }

      showHome();
      return;
    }

    if (_currentView === "search") {
      showHome();
      return;
    }

    if (window.webOSSystem) window.webOSSystem.hide();
  }

  function setNavActive(view) {
    document.querySelectorAll(".nav-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.view === view);
    });
  }

  function initSearchInput() {
    const input = document.getElementById("search-input");
    const clear = document.getElementById("search-clear");

    input.addEventListener("input", () => {
      const q = input.value.trim();
      clear.style.display = q ? "" : "none";
      clearTimeout(_searchDebounce);

      if (q.length >= 2) {
        _searchDebounce = setTimeout(() => doSearch(q), 450);
      } else if (!q) {
        clearSearchResults();
      }
    });

    clear.onclick = () => {
      input.value = "";
      clear.style.display = "none";
      clearSearchResults();
      const firstKey = document.querySelector(".key");
      if (firstKey) Nav.focus(firstKey);
    };
  }

  async function doSearch(query) {
    const loader = document.getElementById("search-loader");
    const results = document.getElementById("search-results");

    loader.style.display = "flex";
    results.innerHTML = "";

    try {
      const items = await API.search(query);
      loader.style.display = "none";

      if (!items.length) {
        results.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">?</div>
            <div class="empty-text">Sin resultados para "${query}"</div>
            <div class="empty-sub">Intenta con otro termino de busqueda</div>
          </div>`;
        return;
      }

      const movies = items.filter((item) => item.type === "movies");
      const series = items.filter((item) => item.type === "tvshows" || item.type === "animes");
      const sections = [];

      if (movies.length) sections.push({ title: "Peliculas", items: movies });
      if (series.length) sections.push({ title: "Series y Anime", items: series });
      if (!sections.length) sections.push({ title: "Resultados", items });

      sections.forEach((section) => {
        const wrap = document.createElement("div");
        wrap.className = "section";

        const titleEl = document.createElement("div");
        titleEl.className = "section-title";
        titleEl.textContent = section.title;

        const row = document.createElement("div");
        row.className = "section-row";

        section.items.forEach((item, i) => {
          const card = HomeView.createCard(item, i);
          card.onclick = () => showDetail(item);
          row.appendChild(card);
        });

        wrap.appendChild(titleEl);
        wrap.appendChild(row);
        results.appendChild(wrap);
      });

      setTimeout(() => {
        const first = results.querySelector(".card");
        if (first) Nav.focus(first);
      }, 80);

      API.enrichItems(items).then(() => {
        items.forEach((item) => {
          results.querySelectorAll(`.card[data-id="${item.id}"] img`).forEach((img) => {
            if (item.posterUrl) img.src = item.posterUrl;
          });
        });
      }).catch(() => {});
    } catch (e) {
      loader.style.display = "none";
      results.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">!</div>
          <div class="empty-text">Error en busqueda</div>
          <div class="empty-sub">${e.message}</div>
        </div>`;
    }
  }

  function clearSearchResults() {
    document.getElementById("search-results").innerHTML = "";
  }

  function buildKeyboard() {
    const kb = document.getElementById("keyboard");
    kb.innerHTML = "";

    const rows = [
      ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
      ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
      ["A", "S", "D", "F", "G", "H", "J", "K", "L", "N"],
      ["Z", "X", "C", "V", "B", "N", "M", "DEL"],
      ["ESPACIO", "LIMPIAR", "BUSCAR"],
    ];

    rows.forEach((row) => {
      const rowEl = document.createElement("div");
      rowEl.style.cssText = "display:flex;gap:6px;margin-bottom:6px;";

      row.forEach((key) => {
        const btn = document.createElement("button");
        btn.className = "key focusable";
        btn.textContent = key;

        if (key === "ESPACIO") btn.classList.add("key-space");
        else if (key === "BUSCAR") btn.classList.add("extra-wide");
        else if (key === "LIMPIAR" || key === "DEL") btn.classList.add("wide");

        btn.addEventListener("click", () => handleKey(key));
        rowEl.appendChild(btn);
      });

      kb.appendChild(rowEl);
    });
  }

  function handleKey(key) {
    const input = document.getElementById("search-input");
    const clear = document.getElementById("search-clear");

    if (key === "DEL") input.value = input.value.slice(0, -1);
    else if (key === "ESPACIO") input.value += " ";
    else if (key === "LIMPIAR") {
      input.value = "";
      clearSearchResults();
    } else if (key === "BUSCAR") {
      const q = input.value.trim();
      if (q) doSearch(q);
      return;
    } else input.value += key;

    clear.style.display = input.value ? "" : "none";
    input.dispatchEvent(new Event("input"));
  }

  let _toastTimer = null;
  function toast(msg, duration = 3000) {
    const el = document.getElementById("toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => el.classList.remove("show"), duration);
  }

  function updateClock() {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, "0");
    const m = String(now.getMinutes()).padStart(2, "0");
    const el = document.getElementById("nav-clock");
    if (el) el.textContent = h + ":" + m;
  }

  document.addEventListener("DOMContentLoaded", () => {
    init().catch((e) => console.error("app init error", e));
  });

  return { showHome, showSearch, showDetail, showPlayer, goBack, toast, loadDetailTemplate };
})();
