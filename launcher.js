const REALTIME_SYNC_STORAGE_KEY = "realtime_sync_items_v1";

function loadRealtimeSyncItems() {
  try {
    const raw = localStorage.getItem(REALTIME_SYNC_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }

    if (parsed && Array.isArray(parsed.items)) {
      return parsed.items;
    }

    return [];
  } catch (_error) {
    return [];
  }
}

function countOutstandingItems(items) {
  return items.filter((item) => item && typeof item === "object" && !String(item.seenAt || "").trim()).length;
}

function updateRealtimeSyncBadge() {
  const badge = document.getElementById("realtimeSyncBadge");
  if (!badge) {
    return;
  }

  const count = countOutstandingItems(loadRealtimeSyncItems());
  badge.textContent = String(count);
  badge.classList.toggle("is-hidden", count <= 0);
}

window.addEventListener("storage", (event) => {
  if (!event.key || event.key === REALTIME_SYNC_STORAGE_KEY) {
    updateRealtimeSyncBadge();
  }
});

window.addEventListener("focus", updateRealtimeSyncBadge);

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    updateRealtimeSyncBadge();
  }
});

updateRealtimeSyncBadge();
