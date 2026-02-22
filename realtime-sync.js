const RTS_STORAGE_KEY = "realtime_sync_items_v1";
const RTS_MIN_SUMMARY_CHARS = 25;
const RTS_MIN_ACK_NOTE_CHARS = 12;
const RTS_MAX_OPEN_PER_AUTHOR = 3;
const RTS_DUPLICATE_WINDOW_MS = 10 * 60 * 1000;

const RTS_AUTHORS = ["Jesse", "Giles"];

const RTS_TYPES = [
  { value: "loom", label: "Loom" },
  { value: "summary", label: "Summary" },
  { value: "decision", label: "Decision / Blocker" }
];

const RTS_URGENCY = [
  { value: "24h", label: "24 hours", hours: 24 },
  { value: "48h", label: "48 hours", hours: 48 },
  { value: "72h", label: "72 hours", hours: 72 },
  { value: "1w", label: "1 week", hours: 168 }
];

const state = {
  items: []
};

const els = {
  updateForm: document.getElementById("updateForm"),
  clearResolvedBtn: document.getElementById("clearResolvedBtn"),
  formStatus: document.getElementById("formStatus"),
  outstandingCount: document.getElementById("outstandingCount"),
  outstandingList: document.getElementById("outstandingList"),
  resolvedList: document.getElementById("resolvedList")
};

function init() {
  state.items = loadItems();
  bindEvents();
  render();
}

function bindEvents() {
  els.updateForm.addEventListener("submit", handleCreateItem);
  els.clearResolvedBtn.addEventListener("click", clearResolvedItems);
  els.outstandingList.addEventListener("submit", handleOutstandingSubmit);

  window.addEventListener("storage", (event) => {
    if (!event.key || event.key === RTS_STORAGE_KEY) {
      state.items = loadItems();
      render();
    }
  });
}

function handleCreateItem(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);

  const author = normalizeAuthor(formData.get("author"));
  const type = normalizeType(formData.get("type"));
  const urgency = normalizeUrgency(formData.get("urgency"));
  const project = String(formData.get("project") || "").trim();
  const sprint = String(formData.get("sprint") || "").trim();
  const loomUrl = normalizeUrl(formData.get("loomUrl"));
  const summary = String(formData.get("summary") || "").trim();
  const actionNeeded = String(formData.get("actionNeeded") || "").trim();

  if (!project || !sprint || !summary) {
    setStatus("Project, sprint, and summary are required.", "error");
    return;
  }

  if (summary.length < RTS_MIN_SUMMARY_CHARS) {
    setStatus(`Summary must be at least ${RTS_MIN_SUMMARY_CHARS} characters.`, "error");
    return;
  }

  if (type === "loom" && !isHttpUrl(loomUrl)) {
    setStatus("Loom updates require a valid Loom URL.", "error");
    return;
  }

  if (countOutstandingByAuthor(author) >= RTS_MAX_OPEN_PER_AUTHOR) {
    setStatus(`${author} already has ${RTS_MAX_OPEN_PER_AUTHOR} outstanding items. Resolve before adding more.`, "error");
    return;
  }

  if (hasRecentDuplicate(author, project, sprint, summary)) {
    setStatus("Duplicate recent update blocked. Keep one thread and acknowledge it instead of re-posting.", "error");
    return;
  }

  const now = isoNow();
  state.items.unshift({
    id: uid("rt"),
    author,
    type,
    urgency,
    project,
    sprint,
    loomUrl: type === "loom" ? loomUrl : "",
    summary,
    actionNeeded,
    createdAt: now,
    updatedAt: now,
    seenAt: "",
    seenBy: "",
    seenNote: ""
  });

  persist();
  event.currentTarget.reset();
  setStatus("Realtime sync item posted.", "ok");
  render();
}

function handleOutstandingSubmit(event) {
  const form = event.target;
  if (!form || form.dataset.form !== "ack-item") {
    return;
  }

  event.preventDefault();

  const itemId = String(form.dataset.itemId || "").trim();
  const item = state.items.find((entry) => entry.id === itemId);
  if (!item || item.seenAt) {
    setStatus("Item is no longer outstanding.", "error");
    render();
    return;
  }

  const formData = new FormData(form);
  const seenBy = normalizeAuthor(formData.get("seenBy"));
  const seenNote = String(formData.get("seenNote") || "").trim();
  const expectedReader = counterpartAuthor(item.author);

  if (seenBy !== expectedReader) {
    setStatus(`Only ${expectedReader} can acknowledge this update.`, "error");
    return;
  }

  if (seenNote.length < RTS_MIN_ACK_NOTE_CHARS) {
    setStatus(`Acknowledgement note must be at least ${RTS_MIN_ACK_NOTE_CHARS} characters.`, "error");
    return;
  }

  const now = isoNow();
  item.seenBy = seenBy;
  item.seenNote = seenNote;
  item.seenAt = now;
  item.updatedAt = now;

  persist();
  setStatus(`Marked seen by ${seenBy}.`, "ok");
  render();
}

function clearResolvedItems() {
  const resolvedCount = state.items.filter((item) => item.seenAt).length;
  if (!resolvedCount) {
    setStatus("No resolved items to clear.", "neutral");
    return;
  }

  const proceed = confirm(`Clear ${resolvedCount} resolved item(s)? Outstanding items will stay.`);
  if (!proceed) {
    return;
  }

  state.items = state.items.filter((item) => !item.seenAt);
  persist();
  setStatus("Resolved items cleared.", "ok");
  render();
}

function render() {
  const outstanding = state.items
    .filter((item) => !item.seenAt)
    .sort((a, b) => urgencyDeadlineMs(a) - urgencyDeadlineMs(b) || compareIso(b.createdAt, a.createdAt));

  const resolved = state.items
    .filter((item) => item.seenAt)
    .sort((a, b) => compareIso(b.seenAt, a.seenAt));

  els.outstandingCount.textContent = String(outstanding.length);

  els.outstandingList.innerHTML = outstanding.length
    ? outstanding.map(renderOutstandingItem).join("")
    : '<p class="rt-empty">No outstanding items. All updates are acknowledged.</p>';

  els.resolvedList.innerHTML = resolved.length
    ? resolved.map(renderResolvedItem).join("")
    : '<p class="rt-empty">No resolved updates yet.</p>';
}

function renderOutstandingItem(item) {
  const isOverdue = Date.now() > urgencyDeadlineMs(item);
  const urgencyClass = `rt-urgency-${escapeHtml(item.urgency)}`;
  const expectedReader = counterpartAuthor(item.author);
  const dueLabel = isOverdue ? overdueLabel(item) : `Due ${formatDateTime(urgencyDeadlineMs(item))}`;

  return `
    <article class="rt-item ${urgencyClass}${isOverdue ? " rt-overdue" : ""}">
      <div class="rt-item-head">
        <h3>${escapeHtml(item.project)} (${escapeHtml(item.sprint)})</h3>
        <div class="rt-chip-row">
          <span class="rt-chip ${escapeHtml(item.type)}">${escapeHtml(typeLabel(item.type))}</span>
          <span class="rt-chip">${escapeHtml(urgencyLabel(item.urgency))}</span>
          <span class="rt-chip">By ${escapeHtml(item.author)}</span>
        </div>
      </div>
      <p class="rt-item-meta">${escapeHtml(dueLabel)} · Posted ${escapeHtml(timeAgo(item.createdAt))}</p>
      ${item.loomUrl ? `<a class="rt-loom-link" href="${escapeHtml(item.loomUrl)}" target="_blank" rel="noopener noreferrer">Open Loom</a>` : ""}
      <p class="rt-item-summary">${escapeHtml(item.summary)}</p>
      ${item.actionNeeded ? `<p class="rt-item-meta"><strong>Action:</strong> ${escapeHtml(item.actionNeeded)}</p>` : ""}
      <section class="rt-ack-block">
        <h4>Acknowledge Receipt</h4>
        <p class="rt-ack-note">Required: ${escapeHtml(expectedReader)} must confirm they have reviewed this update.</p>
        <form class="rt-ack-form" data-form="ack-item" data-item-id="${item.id}">
          <label>
            Seen By
            <select name="seenBy" required>
              <option value="${escapeHtml(expectedReader)}">${escapeHtml(expectedReader)}</option>
            </select>
          </label>
          <label class="rt-span-2">
            Confirmation Note
            <textarea name="seenNote" required placeholder="Confirmed seen. Next step is..." minlength="${RTS_MIN_ACK_NOTE_CHARS}"></textarea>
          </label>
          <button type="submit">Mark Seen</button>
        </form>
      </section>
    </article>
  `;
}

function renderResolvedItem(item) {
  const urgencyClass = `rt-urgency-${escapeHtml(item.urgency)}`;

  return `
    <article class="rt-item ${urgencyClass}">
      <div class="rt-item-head">
        <h3>${escapeHtml(item.project)} (${escapeHtml(item.sprint)})</h3>
        <div class="rt-chip-row">
          <span class="rt-chip ${escapeHtml(item.type)}">${escapeHtml(typeLabel(item.type))}</span>
          <span class="rt-chip">${escapeHtml(urgencyLabel(item.urgency))}</span>
          <span class="rt-chip">By ${escapeHtml(item.author)}</span>
        </div>
      </div>
      ${item.loomUrl ? `<a class="rt-loom-link" href="${escapeHtml(item.loomUrl)}" target="_blank" rel="noopener noreferrer">Open Loom</a>` : ""}
      <p class="rt-item-summary">${escapeHtml(item.summary)}</p>
      ${item.actionNeeded ? `<p class="rt-item-meta"><strong>Action:</strong> ${escapeHtml(item.actionNeeded)}</p>` : ""}
      <section class="rt-ack-block">
        <h4>Seen Confirmation</h4>
        <p class="rt-item-meta">Seen by ${escapeHtml(item.seenBy || "Team")} on ${escapeHtml(formatDateTime(item.seenAt || item.updatedAt))}</p>
        <p class="rt-ack-note">${escapeHtml(item.seenNote || "No note provided.")}</p>
      </section>
    </article>
  `;
}

function countOutstandingByAuthor(author) {
  return state.items.filter((item) => item.author === author && !item.seenAt).length;
}

function hasRecentDuplicate(author, project, sprint, summary) {
  const now = Date.now();
  const projectKey = normalizeKey(project);
  const sprintKey = normalizeKey(sprint);
  const summaryKey = normalizeKey(summary);

  return state.items.some((item) => {
    if (item.author !== author || item.seenAt) {
      return false;
    }

    const createdAt = new Date(item.createdAt).getTime();
    if (Number.isNaN(createdAt) || now - createdAt > RTS_DUPLICATE_WINDOW_MS) {
      return false;
    }

    return (
      normalizeKey(item.project) === projectKey &&
      normalizeKey(item.sprint) === sprintKey &&
      normalizeKey(item.summary) === summaryKey
    );
  });
}

function urgencyDeadlineMs(item) {
  const createdMs = new Date(item.createdAt).getTime();
  const urgencyHours = urgencyDefinition(item.urgency).hours;
  return createdMs + urgencyHours * 3600000;
}

function overdueLabel(item) {
  const overdueMs = Math.max(0, Date.now() - urgencyDeadlineMs(item));
  const overdueHours = Math.floor(overdueMs / 3600000);

  if (overdueHours < 1) {
    return "Overdue now";
  }
  if (overdueHours < 24) {
    return `Overdue by ${overdueHours}h`;
  }

  return `Overdue by ${Math.floor(overdueHours / 24)}d`;
}

function setStatus(message, type = "neutral") {
  els.formStatus.textContent = message;
  els.formStatus.classList.remove("error", "ok");

  if (type === "error") {
    els.formStatus.classList.add("error");
  } else if (type === "ok") {
    els.formStatus.classList.add("ok");
  }
}

function persist() {
  localStorage.setItem(
    RTS_STORAGE_KEY,
    JSON.stringify({
      version: 1,
      items: state.items
    })
  );
}

function loadItems() {
  try {
    const raw = localStorage.getItem(RTS_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    const itemsRaw = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.items) ? parsed.items : [];
    return itemsRaw.map(sanitizeItem).filter(Boolean);
  } catch (_error) {
    return [];
  }
}

function sanitizeItem(input) {
  if (!input || typeof input !== "object") {
    return null;
  }

  const project = String(input.project || "").trim();
  const sprint = String(input.sprint || "").trim();
  const summary = String(input.summary || "").trim();

  if (!project || !sprint || !summary) {
    return null;
  }

  const seenAt = String(input.seenAt || "").trim();
  const normalizedSeenAt = seenAt ? normalizeTimestamp(seenAt) : "";

  return {
    id: String(input.id || uid("rt")),
    author: normalizeAuthor(input.author),
    type: normalizeType(input.type),
    urgency: normalizeUrgency(input.urgency),
    project,
    sprint,
    loomUrl: normalizeUrl(input.loomUrl),
    summary,
    actionNeeded: String(input.actionNeeded || "").trim(),
    createdAt: normalizeTimestamp(input.createdAt || isoNow()),
    updatedAt: normalizeTimestamp(input.updatedAt || input.createdAt || isoNow()),
    seenAt: normalizedSeenAt,
    seenBy: normalizedSeenAt ? normalizeAuthor(input.seenBy) : "",
    seenNote: normalizedSeenAt ? String(input.seenNote || "").trim() : ""
  };
}

function normalizeAuthor(value) {
  const author = String(value || "").trim();
  return RTS_AUTHORS.includes(author) ? author : "Jesse";
}

function counterpartAuthor(author) {
  const normalized = normalizeAuthor(author);
  return normalized === "Jesse" ? "Giles" : "Jesse";
}

function normalizeType(value) {
  const type = String(value || "").trim().toLowerCase();
  return RTS_TYPES.some((item) => item.value === type) ? type : "summary";
}

function normalizeUrgency(value) {
  const urgency = String(value || "").trim().toLowerCase();
  return RTS_URGENCY.some((item) => item.value === urgency) ? urgency : "48h";
}

function urgencyDefinition(value) {
  return RTS_URGENCY.find((item) => item.value === normalizeUrgency(value)) || RTS_URGENCY[1];
}

function urgencyLabel(value) {
  return urgencyDefinition(value).label;
}

function typeLabel(value) {
  return RTS_TYPES.find((item) => item.value === normalizeType(value))?.label || "Summary";
}

function normalizeUrl(value) {
  return String(value || "").trim();
}

function isHttpUrl(value) {
  if (!value) {
    return false;
  }

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch (_error) {
    return false;
  }
}

function normalizeKey(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeTimestamp(value) {
  const parsed = new Date(value || Date.now());
  if (Number.isNaN(parsed.getTime())) {
    return isoNow();
  }
  return parsed.toISOString();
}

function compareIso(a, b) {
  const aTime = new Date(a).getTime();
  const bTime = new Date(b).getTime();

  if (Number.isNaN(aTime) && Number.isNaN(bTime)) {
    return String(a || "").localeCompare(String(b || ""));
  }
  if (Number.isNaN(aTime)) {
    return -1;
  }
  if (Number.isNaN(bTime)) {
    return 1;
  }

  return aTime - bTime;
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value || "");
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function timeAgo(value) {
  const date = new Date(value);
  const timestamp = date.getTime();
  if (Number.isNaN(timestamp)) {
    return "unknown";
  }

  const minutes = Math.floor((Date.now() - timestamp) / 60000);
  if (minutes < 1) {
    return "just now";
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  if (days < 7) {
    return `${days}d ago`;
  }

  return formatDateTime(value);
}

function escapeHtml(input) {
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function uid(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}_${Date.now().toString(36)}`;
}

function isoNow() {
  return new Date().toISOString();
}

init();
