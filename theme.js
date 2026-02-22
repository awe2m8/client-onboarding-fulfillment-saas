const THEME_GLOBAL_KEY = "ops_theme_global_v1";
const THEME_APP_KEY_PREFIX = "ops_theme_app_v1_";
const THEME_DOCK_OPEN_KEY_PREFIX = "ops_theme_dock_open_v1_";

const GLOBAL_THEMES = ["light", "dark"];
const APP_THEMES = ["inherit", "light", "dark"];
const memoryThemeStorage = new Map();

function appKeyFromPath(pathname) {
  const clean = String(pathname || "/").toLowerCase();
  if (clean === "/" || clean.endsWith("/index.html")) {
    return "launcher";
  }
  if (clean.endsWith("/onboarding.html")) {
    return "onboarding";
  }
  if (clean.endsWith("/project-management.html")) {
    return "project-management";
  }
  if (clean.endsWith("/sprints.html")) {
    return "sprints";
  }
  if (clean.endsWith("/realtime-sync.html")) {
    return "realtime-sync";
  }
  return "workspace";
}

function normalizeGlobalTheme(value) {
  const v = String(value || "").trim().toLowerCase();
  return GLOBAL_THEMES.includes(v) ? v : "light";
}

function normalizeAppTheme(value) {
  const v = String(value || "").trim().toLowerCase();
  return APP_THEMES.includes(v) ? v : "inherit";
}

function safeStorageGet(key) {
  if (!key) {
    return null;
  }

  try {
    const value = window.localStorage.getItem(key);
    if (value === null || value === undefined) {
      return memoryThemeStorage.has(key) ? memoryThemeStorage.get(key) : null;
    }
    return value;
  } catch (_error) {
    return memoryThemeStorage.has(key) ? memoryThemeStorage.get(key) : null;
  }
}

function safeStorageSet(key, value) {
  if (!key) {
    return;
  }

  memoryThemeStorage.set(key, value);

  try {
    window.localStorage.setItem(key, value);
  } catch (_error) {
    // Keep in-memory value when persistent storage is not available.
  }
}

function getGlobalTheme() {
  return normalizeGlobalTheme(safeStorageGet(THEME_GLOBAL_KEY));
}

function getAppTheme(appKey) {
  return normalizeAppTheme(safeStorageGet(`${THEME_APP_KEY_PREFIX}${appKey}`));
}

function setGlobalTheme(value) {
  safeStorageSet(THEME_GLOBAL_KEY, normalizeGlobalTheme(value));
}

function setAppTheme(appKey, value) {
  safeStorageSet(`${THEME_APP_KEY_PREFIX}${appKey}`, normalizeAppTheme(value));
}

function dockOpenStorageKey(appKey) {
  return `${THEME_DOCK_OPEN_KEY_PREFIX}${appKey}`;
}

function isDockOpen(appKey) {
  return safeStorageGet(dockOpenStorageKey(appKey)) !== "0";
}

function setDockOpen(appKey, isOpen) {
  safeStorageSet(dockOpenStorageKey(appKey), isOpen ? "1" : "0");
}

function effectiveTheme(appKey) {
  const appTheme = getAppTheme(appKey);
  if (appTheme === "dark" || appTheme === "light") {
    return appTheme;
  }
  return getGlobalTheme();
}

function applyTheme(appKey) {
  const globalTheme = getGlobalTheme();
  const appTheme = getAppTheme(appKey);
  const currentTheme = effectiveTheme(appKey);

  document.documentElement.setAttribute("data-theme-global", globalTheme);
  document.documentElement.setAttribute("data-theme-app", appTheme);
  document.documentElement.setAttribute("data-theme", currentTheme);
}

function optionMarkup(value, label) {
  return `<option value="${value}">${label}</option>`;
}

function buildThemeDock(appKey) {
  if (document.querySelector(".theme-dock")) {
    return;
  }

  const dock = document.createElement("aside");
  dock.className = "theme-dock";
  dock.setAttribute("aria-label", "Theme controls");

  const globalSelectId = `themeGlobalSelect-${appKey}`;
  const appSelectId = `themeAppSelect-${appKey}`;

  dock.innerHTML = `
    <details class="theme-dock-panel" ${isDockOpen(appKey) ? "open" : ""}>
      <summary>Theme Controls</summary>
      <div class="theme-dock-content">
        <label for="${globalSelectId}">
          Global
          <select id="${globalSelectId}" data-theme-control="global">
            ${optionMarkup("light", "Light")}
            ${optionMarkup("dark", "Dark")}
          </select>
        </label>
        <label for="${appSelectId}">
          This App
          <select id="${appSelectId}" data-theme-control="app">
            ${optionMarkup("inherit", "Use Global")}
            ${optionMarkup("light", "Light")}
            ${optionMarkup("dark", "Dark")}
          </select>
        </label>
      </div>
    </details>
  `;

  document.body.appendChild(dock);

  const globalSelect = dock.querySelector('[data-theme-control="global"]');
  const appSelect = dock.querySelector('[data-theme-control="app"]');
  const dockPanel = dock.querySelector(".theme-dock-panel");

  function syncControls() {
    globalSelect.value = getGlobalTheme();
    appSelect.value = getAppTheme(appKey);
  }

  globalSelect.addEventListener("change", () => {
    setGlobalTheme(globalSelect.value);
    applyTheme(appKey);
    syncControls();
  });

  appSelect.addEventListener("change", () => {
    setAppTheme(appKey, appSelect.value);
    applyTheme(appKey);
    syncControls();
  });

  window.addEventListener("storage", () => {
    applyTheme(appKey);
    syncControls();
  });

  if (dockPanel) {
    dockPanel.addEventListener("toggle", () => {
      setDockOpen(appKey, dockPanel.open);
    });
  }

  syncControls();
}

function initThemeSystem() {
  const appKey = appKeyFromPath(window.location.pathname);
  applyTheme(appKey);
  buildThemeDock(appKey);
}

initThemeSystem();
