const STORAGE_KEY = "client_onboarding_ops_v1";
const SYNC_API_URL_KEY = "client_onboarding_ops_api_url_v1";
const SYNC_WORKSPACE_KEY = "client_onboarding_ops_workspace_key_v1";
const SYNC_AUTO_KEY = "client_onboarding_ops_auto_sync_v1";
const SYNC_PULL_INTERVAL_MS = 15000;
const SYNC_REQUEST_TIMEOUT_MS = 20000;
const SYNC_APP_KEY = "onboarding";

const ONBOARDING_STAGES = [
  { id: "new-client", label: "New Client" },
  { id: "form-sent", label: "Form Sent" },
  { id: "form-completed", label: "Form Completed" },
  { id: "payment-sent", label: "Payment Sent" },
  { id: "paid", label: "Paid" },
  { id: "kickoff-scheduled", label: "Kickoff Scheduled" },
  { id: "ready-for-delivery", label: "Ready for Delivery" }
];

const FULFILLMENT_STAGES = [
  { id: "in-progress", label: "In Progress" },
  { id: "waiting-on-client", label: "Waiting on Client" },
  { id: "internal-review", label: "Internal Review" },
  { id: "revision", label: "Revision" },
  { id: "completed", label: "Completed" }
];

const FORM_STATUS = [
  { value: "not-sent", label: "Not Sent" },
  { value: "sent", label: "Sent" },
  { value: "completed", label: "Completed" }
];

const PAYMENT_STATUS = [
  { value: "not-sent", label: "Not Sent" },
  { value: "sent", label: "Sent" },
  { value: "paid", label: "Paid" },
  { value: "issue", label: "Issue" }
];

const TASK_STATUS = [
  { value: "todo", label: "To Do" },
  { value: "in-progress", label: "In Progress" },
  { value: "done", label: "Done" }
];

const state = {
  clients: [],
  deletedRecords: [],
  selectedClientId: null,
  filters: {
    search: "",
    owner: "all",
    product: "all",
    payment: "all",
    form: "all",
    pipeline: "all",
    idle: "all"
  },
  dragClientId: null,
  sync: {
    apiUrl: "",
    workspaceKey: "",
    autoSync: true,
    pending: false,
    pendingGuardTimerId: null,
    lastSyncedAt: null,
    statusMessage: "",
    statusType: "neutral",
    pullTimerId: null,
    pushTimeoutId: null
  }
};

const els = {
  clientForm: document.getElementById("clientForm"),
  clearDataBtn: document.getElementById("clearDataBtn"),
  seedDemoBtn: document.getElementById("seedDemoBtn"),
  downloadDataBtn: document.getElementById("downloadDataBtn"),
  importDataInput: document.getElementById("importDataInput"),
  apiUrlInput: document.getElementById("apiUrlInput"),
  workspaceKeyInput: document.getElementById("workspaceKeyInput"),
  saveSyncBtn: document.getElementById("saveSyncBtn"),
  pullSharedBtn: document.getElementById("pullSharedBtn"),
  pushSharedBtn: document.getElementById("pushSharedBtn"),
  autoSyncCheckbox: document.getElementById("autoSyncCheckbox"),
  syncStatus: document.getElementById("syncStatus"),
  searchInput: document.getElementById("searchInput"),
  ownerFilter: document.getElementById("ownerFilter"),
  productFilter: document.getElementById("productFilter"),
  paymentFilter: document.getElementById("paymentFilter"),
  formFilter: document.getElementById("formFilter"),
  pipelineFilter: document.getElementById("pipelineFilter"),
  idleFilter: document.getElementById("idleFilter"),
  onboardingBoard: document.getElementById("onboardingBoard"),
  fulfillmentBoard: document.getElementById("fulfillmentBoard"),
  clientDetail: document.getElementById("clientDetail"),
  metricTotal: document.getElementById("metricTotal"),
  metricOnboarding: document.getElementById("metricOnboarding"),
  metricFulfillment: document.getElementById("metricFulfillment"),
  metricPaid: document.getElementById("metricPaid"),
  metricBlocked: document.getElementById("metricBlocked"),
  metricIdle: document.getElementById("metricIdle")
};

function init() {
  const snapshot = loadSnapshot();
  state.clients = snapshot.clients;
  state.deletedRecords = snapshot.deletedRecords;

  state.sync.apiUrl = normalizeApiUrl(localStorage.getItem(SYNC_API_URL_KEY) || "");
  state.sync.workspaceKey = localStorage.getItem(SYNC_WORKSPACE_KEY) || "";
  state.sync.autoSync = localStorage.getItem(SYNC_AUTO_KEY) !== "0";

  els.apiUrlInput.value = state.sync.apiUrl;
  els.workspaceKeyInput.value = state.sync.workspaceKey;
  els.autoSyncCheckbox.checked = state.sync.autoSync;

  bindEvents();
  restartPullTimer();

  if (isSyncReady()) {
    setSyncStatus("Team sync ready. Pull shared data to start.", "ok");
  } else {
    setSyncStatus("Local only. Set API URL and workspace key to share data.", "neutral");
  }

  render();
}

function bindEvents() {
  els.clientForm.addEventListener("submit", handleCreateClient);
  els.clearDataBtn.addEventListener("click", clearAllData);
  els.seedDemoBtn.addEventListener("click", seedDemoData);
  els.downloadDataBtn.addEventListener("click", exportData);
  els.importDataInput.addEventListener("change", importData);

  els.saveSyncBtn.addEventListener("click", saveSyncSettings);
  els.pullSharedBtn.addEventListener("click", () => {
    pullSharedData();
  });
  els.pushSharedBtn.addEventListener("click", () => {
    pushSharedData();
  });
  els.autoSyncCheckbox.addEventListener("change", handleAutoSyncToggle);

  const filterMap = [
    [els.searchInput, "search"],
    [els.ownerFilter, "owner"],
    [els.productFilter, "product"],
    [els.paymentFilter, "payment"],
    [els.formFilter, "form"],
    [els.pipelineFilter, "pipeline"],
    [els.idleFilter, "idle"]
  ];

  filterMap.forEach(([el, key]) => {
    const eventName = key === "search" ? "input" : "change";
    el.addEventListener(eventName, () => {
      state.filters[key] = el.value;
      renderBoards();
      renderDetail();
    });
  });

  [els.onboardingBoard, els.fulfillmentBoard].forEach((board) => {
    board.addEventListener("click", handleBoardClick);
    board.addEventListener("change", handleBoardChange);
    board.addEventListener("dragstart", handleDragStart);
    board.addEventListener("dragover", handleDragOver);
    board.addEventListener("dragleave", handleDragLeave);
    board.addEventListener("drop", handleDrop);
    board.addEventListener("dragend", clearDropHighlights);
  });

  els.clientDetail.addEventListener("submit", handleDetailSubmit);
  els.clientDetail.addEventListener("change", handleDetailChange);
  els.clientDetail.addEventListener("click", handleDetailClick);
}

function handleCreateClient(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);

  const name = String(formData.get("name") || "").trim();
  const company = String(formData.get("company") || "").trim();
  const product = String(formData.get("product") || "").trim();
  const owner = String(formData.get("owner") || "").trim();

  if (!name || !company || !product || !owner) {
    alert("Client name, company, product, and owner are required.");
    return;
  }

  const now = isoNow();
  const client = {
    id: uid("client"),
    name,
    company,
    email: String(formData.get("email") || "").trim(),
    phone: String(formData.get("phone") || "").trim(),
    product,
    owner,
    contractValue: safeMoney(formData.get("contractValue")),
    pipeline: "onboarding",
    stageId: "new-client",
    formStatus: String(formData.get("formStatus") || "not-sent"),
    paymentStatus: String(formData.get("paymentStatus") || "not-sent"),
    blockerNote: "",
    tasks: [],
    notes: [],
    activity: [activity("Client created", now)],
    createdAt: now,
    updatedAt: now,
    lastMovedAt: now
  };

  clearDeletionRecord(client.id);
  state.clients.unshift(client);
  state.selectedClientId = client.id;
  form.reset();
  persist();
  render();
}

function clearAllData() {
  if (!confirm("Delete all client data from this browser?")) {
    return;
  }

  state.clients = [];
  state.deletedRecords = [];
  state.selectedClientId = null;
  persist(false);
  render();
  setSyncStatus("Local data cleared. Shared data remains unchanged until you push updates.", "neutral");
}

function seedDemoData() {
  if (state.clients.length && !confirm("This adds demo clients to your current data. Continue?")) {
    return;
  }

  const now = new Date();
  const base = [
    {
      name: "Maya Collins",
      company: "Northline Studio",
      email: "maya@northline.studio",
      phone: "(555) 208-5599",
      product: "Brand + Website Sprint",
      owner: "Jesse",
      contractValue: 4200,
      pipeline: "onboarding",
      stageId: "form-sent",
      formStatus: "sent",
      paymentStatus: "sent",
      blockerNote: ""
    },
    {
      name: "Jordan Lee",
      company: "Beacon Wellness",
      email: "jordan@beaconwellness.co",
      phone: "(555) 492-1183",
      product: "Monthly SEO Retainer",
      owner: "Ana",
      contractValue: 1800,
      pipeline: "onboarding",
      stageId: "ready-for-delivery",
      formStatus: "completed",
      paymentStatus: "paid",
      blockerNote: ""
    },
    {
      name: "Camila Ruiz",
      company: "Ridgepoint Legal",
      email: "camila@ridgepointlegal.com",
      phone: "(555) 855-9921",
      product: "Lead Funnel Build",
      owner: "Jesse",
      contractValue: 3600,
      pipeline: "fulfillment",
      stageId: "waiting-on-client",
      formStatus: "completed",
      paymentStatus: "paid",
      blockerNote: "Awaiting final testimonial and brand photos"
    }
  ];

  const seeded = base.map((item, index) => {
    const createdAt = new Date(now.getTime() - (index + 2) * 86400000).toISOString();
    const updatedAt = new Date(now.getTime() - index * 86400000).toISOString();

    return {
      ...item,
      id: uid("client"),
      tasks: [
        {
          id: uid("task"),
          title: "Kickoff call",
          owner: item.owner,
          dueDate: dateOnly(now),
          status: index === 2 ? "done" : "todo",
          createdAt,
          updatedAt
        }
      ],
      notes: [
        {
          id: uid("note"),
          text: "Seeded example for board setup.",
          createdAt,
          author: "System"
        }
      ],
      activity: [
        activity("Client created", createdAt),
        activity(`Moved to ${stageName(item.pipeline, item.stageId)}`, updatedAt)
      ],
      createdAt,
      updatedAt,
      lastMovedAt: updatedAt
    };
  });

  state.clients = [...seeded, ...state.clients];
  state.selectedClientId = seeded[0]?.id || state.selectedClientId;
  persist();
  render();
}

function exportData() {
  const payload = {
    version: 2,
    exportedAt: isoNow(),
    clients: state.clients,
    deletedRecords: state.deletedRecords
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json;charset=utf-8"
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `client-ops-export-${dateOnly(new Date())}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function importData(event) {
  const file = event.target.files[0];
  event.target.value = "";

  if (!file) {
    return;
  }

  const reader = new FileReader();
  reader.onload = (readEvent) => {
    try {
      const raw = String(readEvent.target.result || "");
      const payload = JSON.parse(raw);
      const importedClients = Array.isArray(payload?.clients) ? payload.clients : Array.isArray(payload) ? payload : null;

      if (!importedClients) {
        throw new Error("JSON must include a clients[] array.");
      }

      state.clients = importedClients.map(sanitizeClient).filter(Boolean);
      state.deletedRecords = sanitizeDeletedRecords(payload?.deletedRecords || []);
      state.selectedClientId = state.clients[0]?.id || null;
      persist(false);
      render();
      setSyncStatus(`Imported ${state.clients.length} client record(s) locally.`, "ok");
    } catch (error) {
      setSyncStatus(`Import failed: ${String(error.message || error)}`, "error");
    }
  };

  reader.readAsText(file);
}

function saveSyncSettings() {
  const apiUrl = normalizeApiUrl(els.apiUrlInput.value);
  const workspaceKey = normalizeWorkspaceKey(els.workspaceKeyInput.value);

  state.sync.apiUrl = apiUrl;
  state.sync.workspaceKey = workspaceKey;

  els.apiUrlInput.value = apiUrl;
  els.workspaceKeyInput.value = workspaceKey;

  localStorage.setItem(SYNC_API_URL_KEY, apiUrl);
  localStorage.setItem(SYNC_WORKSPACE_KEY, workspaceKey);

  restartPullTimer();

  if (!isSyncReady()) {
    setSyncStatus("Local only. Set API URL and workspace key to share data.", "neutral");
    return;
  }

  setSyncStatus(`Saved sync settings for workspace \"${workspaceKey}\".`, "ok");
}

function handleAutoSyncToggle() {
  state.sync.autoSync = Boolean(els.autoSyncCheckbox.checked);
  localStorage.setItem(SYNC_AUTO_KEY, state.sync.autoSync ? "1" : "0");
  restartPullTimer();

  if (state.sync.autoSync) {
    setSyncStatus("Auto sync enabled. Local changes will push and pulls run every 15s.", "ok");
    scheduleAutoPush();
    return;
  }

  if (state.sync.pushTimeoutId) {
    clearTimeout(state.sync.pushTimeoutId);
    state.sync.pushTimeoutId = null;
  }
  setSyncStatus("Auto sync disabled. Use Pull/Push manually.", "neutral");
}

function handleBoardClick(event) {
  const actionEl = event.target.closest("[data-action]");
  if (!actionEl) {
    return;
  }

  const action = actionEl.dataset.action;
  const clientId = actionEl.dataset.clientId;
  const client = getClient(clientId);
  if (!client) {
    return;
  }

  if (action === "open-client") {
    state.selectedClientId = client.id;
    renderDetail();
    return;
  }

  if (action === "start-fulfillment") {
    if (!canMoveToReadyForDelivery(client)) {
      alert("Client needs onboarding form completed and payment marked paid before fulfillment.");
      return;
    }
    moveClient(client, "fulfillment", "in-progress", "Moved to Fulfillment board");
  }
}

function handleBoardChange(event) {
  const target = event.target;
  if (!target.dataset.action) {
    return;
  }

  const client = getClient(target.dataset.clientId);
  if (!client) {
    return;
  }

  if (target.dataset.action === "quick-form") {
    client.formStatus = target.value;
    touchClient(client, `Onboarding form status set to ${labelFor(FORM_STATUS, client.formStatus)}`);
    persist();
    render();
    return;
  }

  if (target.dataset.action === "quick-payment") {
    client.paymentStatus = target.value;
    touchClient(client, `Payment status set to ${labelFor(PAYMENT_STATUS, client.paymentStatus)}`);
    persist();
    render();
  }
}

function handleDragStart(event) {
  const card = event.target.closest(".client-card");
  if (!card) {
    return;
  }

  state.dragClientId = card.dataset.clientId;
  card.classList.add("is-dragging");
  if (event.dataTransfer) {
    event.dataTransfer.setData("text/plain", state.dragClientId);
    event.dataTransfer.effectAllowed = "move";
  }
}

function handleDragOver(event) {
  const dropzone = event.target.closest(".column-dropzone");
  if (!dropzone) {
    return;
  }

  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  dropzone.classList.add("is-over");
}

function handleDragLeave(event) {
  const dropzone = event.target.closest(".column-dropzone");
  if (!dropzone) {
    return;
  }

  const next = event.relatedTarget;
  if (next && dropzone.contains(next)) {
    return;
  }
  dropzone.classList.remove("is-over");
}

function handleDrop(event) {
  const dropzone = event.target.closest(".column-dropzone");
  if (!dropzone) {
    return;
  }

  event.preventDefault();
  dropzone.classList.remove("is-over");

  const dragId = (event.dataTransfer && event.dataTransfer.getData("text/plain")) || state.dragClientId;
  const client = getClient(dragId);
  if (!client) {
    return;
  }

  const pipeline = dropzone.dataset.pipeline;
  const stageId = dropzone.dataset.stageId;

  if (pipeline === "fulfillment" && !canMoveToReadyForDelivery(client)) {
    alert("Client must have onboarding form completed and payment paid before fulfillment.");
    clearDropHighlights();
    return;
  }

  const message = `Moved to ${stageName(pipeline, stageId)}`;
  moveClient(client, pipeline, stageId, message);
  clearDropHighlights();
}

function clearDropHighlights() {
  document.querySelectorAll(".column-dropzone.is-over").forEach((node) => {
    node.classList.remove("is-over");
  });

  document.querySelectorAll(".client-card.is-dragging").forEach((node) => {
    node.classList.remove("is-dragging");
  });

  state.dragClientId = null;
}

function moveClient(client, pipeline, stageId, message) {
  if (pipeline === "onboarding" && stageId === "ready-for-delivery" && !canMoveToReadyForDelivery(client)) {
    alert("Client needs form completed and payment paid before moving to Ready for Delivery.");
    return;
  }

  client.pipeline = pipeline;
  client.stageId = stageId;
  client.lastMovedAt = isoNow();
  touchClient(client, message, false);
  persist();
  render();
}

function handleDetailSubmit(event) {
  event.preventDefault();

  const form = event.target;
  const client = getSelectedClient();
  if (!client) {
    return;
  }

  if (form.id === "detailProfileForm") {
    const formData = new FormData(form);
    client.name = String(formData.get("name") || "").trim();
    client.company = String(formData.get("company") || "").trim();
    client.email = String(formData.get("email") || "").trim();
    client.phone = String(formData.get("phone") || "").trim();
    client.product = String(formData.get("product") || "").trim();
    client.owner = String(formData.get("owner") || "").trim();
    client.contractValue = safeMoney(formData.get("contractValue"));
    client.blockerNote = String(formData.get("blockerNote") || "").trim();

    if (!client.name || !client.company || !client.product || !client.owner) {
      alert("Name, company, product, and owner are required.");
      return;
    }

    touchClient(client, "Profile updated");
    persist();
    render();
    return;
  }

  if (form.id === "newTaskForm") {
    const formData = new FormData(form);
    const title = String(formData.get("title") || "").trim();
    if (!title) {
      return;
    }

    const task = {
      id: uid("task"),
      title,
      owner: String(formData.get("owner") || "").trim(),
      dueDate: String(formData.get("dueDate") || ""),
      status: "todo",
      createdAt: isoNow(),
      updatedAt: isoNow()
    };

    client.tasks.unshift(task);
    touchClient(client, `Task added: ${title}`);
    form.reset();
    persist();
    render();
    return;
  }

  if (form.id === "newNoteForm") {
    const formData = new FormData(form);
    const text = String(formData.get("text") || "").trim();
    if (!text) {
      return;
    }

    client.notes.unshift({
      id: uid("note"),
      text,
      createdAt: isoNow(),
      author: "Team"
    });

    touchClient(client, "Note added");
    form.reset();
    persist();
    render();
  }
}

function handleDetailChange(event) {
  const target = event.target;
  const client = getSelectedClient();
  if (!client) {
    return;
  }

  if (target.name === "pipeline") {
    const nextPipeline = target.value;
    const stages = nextPipeline === "onboarding" ? ONBOARDING_STAGES : FULFILLMENT_STAGES;
    const fallbackStage = stages[0].id;

    if (nextPipeline === "fulfillment" && !canMoveToReadyForDelivery(client)) {
      alert("Form must be completed and payment marked paid before fulfillment.");
      renderDetail();
      return;
    }

    moveClient(client, nextPipeline, fallbackStage, `Pipeline changed to ${capitalize(nextPipeline)}`);
    return;
  }

  if (target.name === "stageId") {
    moveClient(client, client.pipeline, target.value, `Moved to ${stageName(client.pipeline, target.value)}`);
    return;
  }

  if (target.name === "formStatus") {
    client.formStatus = target.value;
    touchClient(client, `Onboarding form status set to ${labelFor(FORM_STATUS, client.formStatus)}`);
    persist();
    render();
    return;
  }

  if (target.name === "paymentStatus") {
    client.paymentStatus = target.value;
    touchClient(client, `Payment status set to ${labelFor(PAYMENT_STATUS, client.paymentStatus)}`);
    persist();
    render();
    return;
  }

  if (target.dataset.action === "task-status") {
    const task = client.tasks.find((item) => item.id === target.dataset.taskId);
    if (!task) {
      return;
    }

    task.status = target.value;
    task.updatedAt = isoNow();
    touchClient(client, `Task updated: ${task.title} (${labelFor(TASK_STATUS, task.status)})`);
    persist();
    render();
  }
}

function handleDetailClick(event) {
  const actionEl = event.target.closest("[data-action]");
  if (!actionEl) {
    return;
  }

  const client = getSelectedClient();
  if (!client) {
    return;
  }

  const action = actionEl.dataset.action;

  if (action === "delete-client") {
    if (!confirm(`Delete ${client.company} from this workspace?`)) {
      return;
    }

    recordDeletion(client.id, isoNow());
    state.clients = state.clients.filter((item) => item.id !== client.id);
    state.selectedClientId = state.clients[0]?.id || null;
    persist();
    render();
    return;
  }

  if (action === "task-delete") {
    const taskId = actionEl.dataset.taskId;
    const task = client.tasks.find((item) => item.id === taskId);
    client.tasks = client.tasks.filter((item) => item.id !== taskId);
    touchClient(client, `Task removed: ${task ? task.title : "task"}`);
    persist();
    render();
    return;
  }

  if (action === "send-to-fulfillment") {
    if (!canMoveToReadyForDelivery(client)) {
      alert("Form must be completed and payment marked paid before fulfillment.");
      return;
    }
    moveClient(client, "fulfillment", "in-progress", "Moved to Fulfillment board");
  }
}

function touchClient(client, message, bumpStageDate = true) {
  const now = isoNow();
  client.updatedAt = now;
  if (bumpStageDate) {
    client.lastMovedAt = now;
  }
  client.activity.unshift(activity(message, now));
}

function render() {
  renderFilterOptions();
  renderMetrics();
  renderBoards();
  renderDetail();
  renderSyncStatus();
}

function renderFilterOptions() {
  const owners = uniqueValues(state.clients.map((client) => client.owner));
  const products = uniqueValues(state.clients.map((client) => client.product));

  hydrateFilter(els.ownerFilter, owners, state.filters.owner);
  hydrateFilter(els.productFilter, products, state.filters.product);
}

function hydrateFilter(selectEl, values, selected) {
  const old = selected || "all";
  const options = ["<option value=\"all\">All</option>"];
  values.forEach((value) => {
    const selectedAttr = old === value ? " selected" : "";
    options.push(`<option value="${escapeHtml(value)}"${selectedAttr}>${escapeHtml(value)}</option>`);
  });

  selectEl.innerHTML = options.join("");
  selectEl.value = values.includes(old) || old === "all" ? old : "all";
  state.filters[selectEl.id === "ownerFilter" ? "owner" : "product"] = selectEl.value;
}

function renderMetrics() {
  const total = state.clients.length;
  const onboarding = state.clients.filter((client) => client.pipeline === "onboarding").length;
  const fulfillment = state.clients.filter((client) => client.pipeline === "fulfillment").length;
  const paid = state.clients.filter((client) => client.paymentStatus === "paid").length;
  const blocked = state.clients.filter(
    (client) => client.paymentStatus === "issue" || (client.pipeline === "fulfillment" && client.stageId === "waiting-on-client")
  ).length;
  const idle = state.clients.filter((client) => idleDays(client) >= 5).length;

  els.metricTotal.textContent = String(total);
  els.metricOnboarding.textContent = String(onboarding);
  els.metricFulfillment.textContent = String(fulfillment);
  els.metricPaid.textContent = String(paid);
  els.metricBlocked.textContent = String(blocked);
  els.metricIdle.textContent = String(idle);
}

function renderBoards() {
  const filtered = filteredClients();

  renderBoard(els.onboardingBoard, "onboarding", ONBOARDING_STAGES, filtered);
  renderBoard(els.fulfillmentBoard, "fulfillment", FULFILLMENT_STAGES, filtered);
}

function renderBoard(container, pipeline, stages, clients) {
  const columnsHtml = stages
    .map((stage) => {
      const stageClients = clients
        .filter((client) => client.pipeline === pipeline && client.stageId === stage.id)
        .sort((a, b) => compareIso(b.lastMovedAt, a.lastMovedAt));

      return `
        <section class="kanban-column">
          <div class="column-head">
            <h3>${escapeHtml(stage.label)}</h3>
            <span class="count-pill">${stageClients.length}</span>
          </div>
          <div class="column-dropzone" data-pipeline="${pipeline}" data-stage-id="${stage.id}">
            ${stageClients.length ? stageClients.map(renderCard).join("") : '<p class="empty-col">No clients</p>'}
          </div>
        </section>
      `;
    })
    .join("");

  container.innerHTML = columnsHtml;
}

function renderCard(client) {
  const idleClass = idleDays(client) >= 5 ? "idle" : "";
  const showStartButton = client.pipeline === "onboarding" && client.stageId === "ready-for-delivery";

  return `
    <article class="client-card ${idleClass}" draggable="true" data-client-id="${client.id}">
      <header>
        <h4>${escapeHtml(client.company)}</h4>
        <button class="inline-link" type="button" data-action="open-client" data-client-id="${client.id}">Open</button>
      </header>
      <p class="card-meta">${escapeHtml(client.name)} • ${escapeHtml(client.product)}</p>
      <div class="badge-row">
        <span class="badge form">Form: ${escapeHtml(labelFor(FORM_STATUS, client.formStatus))}</span>
        <span class="badge payment ${client.paymentStatus}">Payment: ${escapeHtml(labelFor(PAYMENT_STATUS, client.paymentStatus))}</span>
      </div>
      <div class="card-actions">
        <label>
          <span>Form</span>
          <select data-action="quick-form" data-client-id="${client.id}">
            ${optionMarkup(FORM_STATUS, client.formStatus)}
          </select>
        </label>
        <label>
          <span>Pay</span>
          <select data-action="quick-payment" data-client-id="${client.id}">
            ${optionMarkup(PAYMENT_STATUS, client.paymentStatus)}
          </select>
        </label>
      </div>
      ${showStartButton ? `<button type="button" data-action="start-fulfillment" data-client-id="${client.id}">Start Fulfillment</button>` : ""}
      <p class="card-updated">Updated ${escapeHtml(timeAgo(client.updatedAt))}</p>
    </article>
  `;
}

function renderDetail() {
  const client = getSelectedClient();

  if (!client) {
    els.clientDetail.innerHTML =
      state.clients.length === 0
        ? "No client records yet. Add your first client in the top form."
        : "Select a client card to edit profile, tasks, notes, and stage details.";
    return;
  }

  if (!filteredClients().some((item) => item.id === client.id)) {
    els.clientDetail.innerHTML = "Selected client is hidden by filters. Adjust filters or pick another card.";
    return;
  }

  const stageOptions =
    client.pipeline === "onboarding"
      ? optionMarkup(ONBOARDING_STAGES.map((s) => ({ value: s.id, label: s.label })), client.stageId)
      : optionMarkup(FULFILLMENT_STAGES.map((s) => ({ value: s.id, label: s.label })), client.stageId);

  const tasksHtml = client.tasks.length
    ? client.tasks
        .map(
          (task) => `
            <li class="list-item">
              <div class="task-row">
                <p><strong>${escapeHtml(task.title)}</strong></p>
                <button class="ghost" type="button" data-action="task-delete" data-task-id="${task.id}">Delete</button>
              </div>
              <p class="task-meta">Owner: ${escapeHtml(task.owner || "Unassigned")} • Due: ${escapeHtml(task.dueDate || "No date")}</p>
              <label>
                Status
                <select data-action="task-status" data-task-id="${task.id}">
                  ${optionMarkup(TASK_STATUS, task.status)}
                </select>
              </label>
            </li>
          `
        )
        .join("")
    : '<p class="empty-state">No tasks yet.</p>';

  const notesHtml = client.notes.length
    ? client.notes
        .map(
          (note) => `
            <li class="list-item">
              <p>${escapeHtml(note.text)}</p>
              <small>${escapeHtml(note.author || "Team")} • ${escapeHtml(formatDateTime(note.createdAt))}</small>
            </li>
          `
        )
        .join("")
    : '<p class="empty-state">No notes yet.</p>';

  const activityHtml = client.activity.length
    ? client.activity
        .map(
          (item) => `
            <li class="list-item">
              <p>${escapeHtml(item.message)}</p>
              <small>${escapeHtml(formatDateTime(item.createdAt))}</small>
            </li>
          `
        )
        .join("")
    : '<p class="empty-state">No timeline events yet.</p>';

  const canSend = canMoveToReadyForDelivery(client);

  els.clientDetail.innerHTML = `
    <div class="detail-wrap">
      <form id="detailProfileForm" class="detail-section">
        <h3>Profile</h3>
        <div class="detail-grid">
          <label>
            Client Name
            <input name="name" required value="${escapeHtml(client.name)}" />
          </label>
          <label>
            Company
            <input name="company" required value="${escapeHtml(client.company)}" />
          </label>
          <label>
            Email
            <input name="email" type="email" value="${escapeHtml(client.email || "")}" />
          </label>
          <label>
            Phone
            <input name="phone" value="${escapeHtml(client.phone || "")}" />
          </label>
          <label>
            Product
            <input name="product" required value="${escapeHtml(client.product)}" />
          </label>
          <label>
            Owner
            <input name="owner" required value="${escapeHtml(client.owner)}" />
          </label>
          <label>
            Contract Value
            <input name="contractValue" type="number" min="0" step="0.01" value="${client.contractValue || ""}" />
          </label>
          <label>
            Pipeline
            <select name="pipeline">
              <option value="onboarding"${client.pipeline === "onboarding" ? " selected" : ""}>Onboarding</option>
              <option value="fulfillment"${client.pipeline === "fulfillment" ? " selected" : ""}>Fulfillment</option>
            </select>
          </label>
          <label>
            Stage
            <select name="stageId">${stageOptions}</select>
          </label>
          <label>
            Onboarding Form
            <select name="formStatus">${optionMarkup(FORM_STATUS, client.formStatus)}</select>
          </label>
          <label>
            Payment Status
            <select name="paymentStatus">${optionMarkup(PAYMENT_STATUS, client.paymentStatus)}</select>
          </label>
          <label>
            Blocker Note
            <input name="blockerNote" placeholder="Optional blocker details" value="${escapeHtml(client.blockerNote || "")}" />
          </label>
        </div>
        <div class="form-actions">
          <button type="submit">Save Profile</button>
          <button type="button" class="ghost" data-action="send-to-fulfillment" ${canSend ? "" : "disabled"}>Send To Fulfillment</button>
          <button type="button" class="danger" data-action="delete-client">Delete Client</button>
        </div>
      </form>

      <div class="detail-grid">
        <section class="detail-section">
          <h3>Tasks</h3>
          <ul class="list">${tasksHtml}</ul>
          <form id="newTaskForm" class="detail-grid">
            <label>
              Task title
              <input name="title" required placeholder="Send kickoff deck" />
            </label>
            <label>
              Owner
              <input name="owner" placeholder="Assignee" />
            </label>
            <label>
              Due date
              <input name="dueDate" type="date" />
            </label>
            <button type="submit">Add Task</button>
          </form>
        </section>

        <section class="detail-section">
          <h3>Notes</h3>
          <ul class="list">${notesHtml}</ul>
          <form id="newNoteForm" class="detail-grid">
            <label>
              Add note
              <textarea name="text" required placeholder="Client requested updated timeline."></textarea>
            </label>
            <button type="submit">Add Note</button>
          </form>
        </section>
      </div>

      <section class="detail-section timeline">
        <h3>Activity Timeline</h3>
        <ul class="list">${activityHtml}</ul>
      </section>
    </div>
  `;
}

function filteredClients() {
  return state.clients.filter((client) => {
    const text = state.filters.search.trim().toLowerCase();
    const matchesText =
      !text ||
      client.name.toLowerCase().includes(text) ||
      client.company.toLowerCase().includes(text) ||
      client.product.toLowerCase().includes(text) ||
      String(client.email || "").toLowerCase().includes(text);

    const matchesOwner = state.filters.owner === "all" || client.owner === state.filters.owner;
    const matchesProduct = state.filters.product === "all" || client.product === state.filters.product;
    const matchesPayment = state.filters.payment === "all" || client.paymentStatus === state.filters.payment;
    const matchesForm = state.filters.form === "all" || client.formStatus === state.filters.form;
    const matchesPipeline = state.filters.pipeline === "all" || client.pipeline === state.filters.pipeline;

    const idleThreshold = state.filters.idle === "idle-5" ? 5 : state.filters.idle === "idle-10" ? 10 : 0;
    const matchesIdle = idleThreshold === 0 || idleDays(client) >= idleThreshold;

    return matchesText && matchesOwner && matchesProduct && matchesPayment && matchesForm && matchesPipeline && matchesIdle;
  });
}

function canMoveToReadyForDelivery(client) {
  return client.formStatus === "completed" && client.paymentStatus === "paid";
}

function getClient(id) {
  return state.clients.find((client) => client.id === id);
}

function getSelectedClient() {
  if (!state.selectedClientId) {
    return null;
  }
  return getClient(state.selectedClientId);
}

function stageName(pipeline, stageId) {
  const stages = pipeline === "onboarding" ? ONBOARDING_STAGES : FULFILLMENT_STAGES;
  return stages.find((stage) => stage.id === stageId)?.label || stageId;
}

function labelFor(options, value) {
  return options.find((option) => option.value === value)?.label || value;
}

function optionMarkup(options, selectedValue) {
  return options
    .map(
      (option) =>
        `<option value="${escapeHtml(option.value)}"${option.value === selectedValue ? " selected" : ""}>${escapeHtml(option.label)}</option>`
    )
    .join("");
}

function activity(message, createdAt) {
  return {
    id: uid("activity"),
    message,
    createdAt
  };
}

async function pullSharedData({ silent = false } = {}) {
  if (!isSyncReady()) {
    if (!silent) {
      setSyncStatus("Set API URL and workspace key before pulling shared data.", "error");
    }
    return;
  }
  if (state.sync.pending) {
    return;
  }

  beginSyncPending();

  try {
    const res = await fetchWithTimeout(
      `${state.sync.apiUrl}/ops/workspaces/${encodeURIComponent(state.sync.workspaceKey)}/records?app=${encodeURIComponent(SYNC_APP_KEY)}`,
      {},
      SYNC_REQUEST_TIMEOUT_MS
    );
    if (!res.ok) {
      const body = await res.text();
      throw new Error(body || `Pull failed (${res.status})`);
    }

    const json = await res.json();
    const records = Array.isArray(json.records) ? json.records : [];
    applyRemoteRecords(records);
    persist(false);
    render();

    state.sync.lastSyncedAt = isoNow();
    setSyncStatus(`Pulled ${records.length} shared record(s).`, "ok");
  } catch (error) {
    setSyncStatus(`Pull failed: ${syncErrorMessage(error)}`, "error");
  } finally {
    endSyncPending();
  }
}

async function pushSharedData({ silent = false } = {}) {
  if (!isSyncReady()) {
    if (!silent) {
      setSyncStatus("Set API URL and workspace key before pushing shared data.", "error");
    }
    return;
  }
  if (state.sync.pending) {
    return;
  }

  beginSyncPending();

  try {
    const payload = {
      upserts: state.clients.map((client) => ({
        id: client.id,
        updatedAt: normalizeTimestamp(client.updatedAt),
        payload: client
      })),
      deletions: state.deletedRecords.map((item) => ({
        id: item.id,
        updatedAt: normalizeTimestamp(item.updatedAt)
      }))
    };

    const res = await fetchWithTimeout(
      `${state.sync.apiUrl}/ops/workspaces/${encodeURIComponent(state.sync.workspaceKey)}/sync?app=${encodeURIComponent(SYNC_APP_KEY)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      },
      SYNC_REQUEST_TIMEOUT_MS
    );

    if (!res.ok) {
      const body = await res.text();
      throw new Error(body || `Push failed (${res.status})`);
    }

    const json = await res.json();
    state.deletedRecords = [];
    persist(false);

    state.sync.lastSyncedAt = isoNow();
    setSyncStatus(
      `Pushed ${Number(json.appliedUpserts || 0)} upsert(s) and ${Number(json.appliedDeletions || 0)} deletion(s).`,
      "ok"
    );
  } catch (error) {
    setSyncStatus(`Push failed: ${syncErrorMessage(error)}`, "error");
  } finally {
    endSyncPending();
  }
}

function applyRemoteRecords(records) {
  const clientMap = new Map(state.clients.map((client) => [client.id, client]));
  const deletedMap = new Map(state.deletedRecords.map((item) => [item.id, item.updatedAt]));

  records.forEach((record) => {
    const clientId = String(record.clientId || record.client_id || record.id || "").trim();
    if (!clientId) {
      return;
    }

    const recordUpdatedAt = normalizeTimestamp(record.updatedAt || record.updated_at || record.payload?.updatedAt || isoNow());
    const localClient = clientMap.get(clientId);
    const localClientUpdated = localClient ? normalizeTimestamp(localClient.updatedAt || localClient.lastMovedAt || localClient.createdAt) : null;
    const localDeletedUpdated = deletedMap.get(clientId) || null;
    const localLatest = newerTimestamp(localClientUpdated, localDeletedUpdated);

    if (record.deleted) {
      if (!localLatest || compareIso(recordUpdatedAt, localLatest) >= 0) {
        clientMap.delete(clientId);
        deletedMap.set(clientId, recordUpdatedAt);
      }
      return;
    }

    const sanitized = sanitizeClient({ ...record.payload, id: clientId });
    if (!sanitized) {
      return;
    }

    sanitized.updatedAt = newerTimestamp(normalizeTimestamp(sanitized.updatedAt), recordUpdatedAt);
    sanitized.lastMovedAt = normalizeTimestamp(sanitized.lastMovedAt || sanitized.updatedAt);

    if (!localLatest || compareIso(recordUpdatedAt, localLatest) >= 0) {
      clientMap.set(clientId, sanitized);
      deletedMap.delete(clientId);
    }
  });

  state.clients = Array.from(clientMap.values()).sort((a, b) => compareIso(b.updatedAt, a.updatedAt));
  state.deletedRecords = Array.from(deletedMap.entries()).map(([id, updatedAt]) => ({ id, updatedAt }));

  if (state.selectedClientId && !clientMap.has(state.selectedClientId)) {
    state.selectedClientId = state.clients[0]?.id || null;
  }
}

function restartPullTimer() {
  if (state.sync.pullTimerId) {
    clearInterval(state.sync.pullTimerId);
    state.sync.pullTimerId = null;
  }

  if (!state.sync.autoSync || !isSyncReady()) {
    return;
  }

  state.sync.pullTimerId = setInterval(() => {
    pullSharedData({ silent: true });
  }, SYNC_PULL_INTERVAL_MS);
}

function scheduleAutoPush() {
  if (!state.sync.autoSync || !isSyncReady()) {
    return;
  }

  if (state.sync.pushTimeoutId) {
    clearTimeout(state.sync.pushTimeoutId);
  }

  state.sync.pushTimeoutId = setTimeout(() => {
    pushSharedData({ silent: true });
  }, 1200);
}

function persist(autoPush = true) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      version: 2,
      clients: state.clients,
      deletedRecords: state.deletedRecords
    })
  );

  if (autoPush) {
    scheduleAutoPush();
  }
}

function loadSnapshot() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { clients: [], deletedRecords: [] };
    }

    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return {
        clients: parsed.map(sanitizeClient).filter(Boolean),
        deletedRecords: []
      };
    }

    const clientsRaw = Array.isArray(parsed?.clients) ? parsed.clients : [];
    const deletedRaw = Array.isArray(parsed?.deletedRecords) ? parsed.deletedRecords : [];

    return {
      clients: clientsRaw.map(sanitizeClient).filter(Boolean),
      deletedRecords: sanitizeDeletedRecords(deletedRaw)
    };
  } catch (_error) {
    return { clients: [], deletedRecords: [] };
  }
}

function sanitizeClient(input) {
  if (!input || typeof input !== "object") {
    return null;
  }

  const pipeline = input.pipeline === "fulfillment" ? "fulfillment" : "onboarding";
  const stages = pipeline === "onboarding" ? ONBOARDING_STAGES : FULFILLMENT_STAGES;
  const validStage = stages.some((stage) => stage.id === input.stageId) ? input.stageId : stages[0].id;

  const now = isoNow();

  const client = {
    id: String(input.id || uid("client")),
    name: String(input.name || "").trim(),
    company: String(input.company || "").trim(),
    email: String(input.email || "").trim(),
    phone: String(input.phone || "").trim(),
    product: String(input.product || "").trim(),
    owner: String(input.owner || "").trim(),
    contractValue: safeMoney(input.contractValue),
    pipeline,
    stageId: validStage,
    formStatus: FORM_STATUS.some((status) => status.value === input.formStatus) ? input.formStatus : "not-sent",
    paymentStatus: PAYMENT_STATUS.some((status) => status.value === input.paymentStatus) ? input.paymentStatus : "not-sent",
    blockerNote: String(input.blockerNote || ""),
    tasks: sanitizeTasks(input.tasks),
    notes: sanitizeNotes(input.notes),
    activity: sanitizeActivity(input.activity),
    createdAt: normalizeTimestamp(input.createdAt || now),
    updatedAt: normalizeTimestamp(input.updatedAt || now),
    lastMovedAt: normalizeTimestamp(input.lastMovedAt || input.updatedAt || now)
  };

  if (!client.name || !client.company || !client.product || !client.owner) {
    return null;
  }

  return client;
}

function sanitizeTasks(tasks) {
  if (!Array.isArray(tasks)) {
    return [];
  }

  return tasks
    .filter((task) => task && typeof task === "object")
    .map((task) => ({
      id: String(task.id || uid("task")),
      title: String(task.title || "").trim(),
      owner: String(task.owner || "").trim(),
      dueDate: String(task.dueDate || ""),
      status: TASK_STATUS.some((item) => item.value === task.status) ? task.status : "todo",
      createdAt: normalizeTimestamp(task.createdAt || isoNow()),
      updatedAt: normalizeTimestamp(task.updatedAt || isoNow())
    }))
    .filter((task) => task.title);
}

function sanitizeNotes(notes) {
  if (!Array.isArray(notes)) {
    return [];
  }

  return notes
    .filter((note) => note && typeof note === "object")
    .map((note) => ({
      id: String(note.id || uid("note")),
      text: String(note.text || "").trim(),
      createdAt: normalizeTimestamp(note.createdAt || isoNow()),
      author: String(note.author || "Team")
    }))
    .filter((note) => note.text);
}

function sanitizeActivity(activityItems) {
  if (!Array.isArray(activityItems)) {
    return [];
  }

  return activityItems
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      id: String(item.id || uid("activity")),
      message: String(item.message || "").trim(),
      createdAt: normalizeTimestamp(item.createdAt || isoNow())
    }))
    .filter((item) => item.message)
    .sort((a, b) => compareIso(b.createdAt, a.createdAt));
}

function sanitizeDeletedRecords(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  const map = new Map();

  items.forEach((item) => {
    const id = String(item?.id || "").trim();
    if (!id) {
      return;
    }

    const updatedAt = normalizeTimestamp(item.updatedAt || item.deletedAt || isoNow());
    const existing = map.get(id);

    if (!existing || compareIso(updatedAt, existing) > 0) {
      map.set(id, updatedAt);
    }
  });

  return Array.from(map.entries()).map(([id, updatedAt]) => ({ id, updatedAt }));
}

function recordDeletion(clientId, updatedAt) {
  const id = String(clientId || "").trim();
  if (!id) {
    return;
  }

  const nextUpdatedAt = normalizeTimestamp(updatedAt || isoNow());
  const existing = state.deletedRecords.find((item) => item.id === id);

  if (!existing) {
    state.deletedRecords.unshift({ id, updatedAt: nextUpdatedAt });
    return;
  }

  if (compareIso(nextUpdatedAt, existing.updatedAt) > 0) {
    existing.updatedAt = nextUpdatedAt;
  }
}

function clearDeletionRecord(clientId) {
  const id = String(clientId || "").trim();
  if (!id) {
    return;
  }
  state.deletedRecords = state.deletedRecords.filter((item) => item.id !== id);
}

function isSyncReady() {
  return Boolean(state.sync.apiUrl && state.sync.workspaceKey);
}

function normalizeApiUrl(value) {
  return String(value || "")
    .trim()
    .replace(/[?#]+$/g, "")
    .replace(/\/+$/, "");
}

function normalizeWorkspaceKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-_]/g, "")
    .slice(0, 64);
}

function renderSyncStatus() {
  if (!els.syncStatus) {
    return;
  }

  const label = syncStatusLabel();
  const type = state.sync.statusType;

  els.syncStatus.textContent = label;
  els.syncStatus.classList.remove("error", "ok");
  if (type === "error") {
    els.syncStatus.classList.add("error");
  }
  if (type === "ok") {
    els.syncStatus.classList.add("ok");
  }

  const disabled = state.sync.pending;
  els.saveSyncBtn.disabled = disabled;
  els.pullSharedBtn.disabled = disabled;
  els.pushSharedBtn.disabled = disabled;
}

function syncStatusLabel() {
  if (state.sync.pending) {
    return "Sync in progress...";
  }

  if (state.sync.statusMessage) {
    const suffix = state.sync.lastSyncedAt ? ` Last sync ${timeAgo(state.sync.lastSyncedAt)}.` : "";
    return `${state.sync.statusMessage}${suffix}`;
  }

  if (!isSyncReady()) {
    return "Local only. Set API URL and workspace key to share data.";
  }

  return "Team sync ready. Use Pull Shared Data to load the latest workspace snapshot.";
}

function setSyncStatus(message, type = "neutral") {
  state.sync.statusMessage = message;
  state.sync.statusType = type;
  renderSyncStatus();
}

function beginSyncPending() {
  state.sync.pending = true;

  if (state.sync.pendingGuardTimerId) {
    clearTimeout(state.sync.pendingGuardTimerId);
  }

  state.sync.pendingGuardTimerId = setTimeout(() => {
    if (!state.sync.pending) {
      return;
    }
    state.sync.pending = false;
    state.sync.pendingGuardTimerId = null;
    setSyncStatus("Sync timed out in browser. Please retry.", "error");
  }, SYNC_REQUEST_TIMEOUT_MS + 5000);

  renderSyncStatus();
}

function endSyncPending() {
  state.sync.pending = false;

  if (state.sync.pendingGuardTimerId) {
    clearTimeout(state.sync.pendingGuardTimerId);
    state.sync.pendingGuardTimerId = null;
  }

  renderSyncStatus();
}

async function fetchWithTimeout(url, options = {}, timeoutMs = SYNC_REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function syncErrorMessage(error) {
  if (error && error.name === "AbortError") {
    return `Request timed out after ${Math.round(SYNC_REQUEST_TIMEOUT_MS / 1000)}s`;
  }
  return String(error?.message || error || "Unknown error");
}

function idleDays(client) {
  const last = new Date(client.updatedAt || client.lastMovedAt || client.createdAt || isoNow());
  const diff = Math.max(0, Date.now() - last.getTime());
  return Math.floor(diff / 86400000);
}

function safeMoney(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numeric = Number(value);
  if (Number.isNaN(numeric) || numeric < 0) {
    return null;
  }
  return Number(numeric.toFixed(2));
}

function uniqueValues(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
}

function escapeHtml(input) {
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function timeAgo(isoString) {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return "unknown";
  }

  const minutes = Math.floor((Date.now() - date.getTime()) / 60000);
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

  return formatDateTime(isoString);
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function dateOnly(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeTimestamp(value) {
  const parsed = new Date(value);
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

function newerTimestamp(a, b) {
  if (!a) {
    return b || isoNow();
  }
  if (!b) {
    return a;
  }
  return compareIso(a, b) >= 0 ? a : b;
}

function isoNow() {
  return new Date().toISOString();
}

function uid(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

function capitalize(value) {
  return String(value || "")
    .charAt(0)
    .toUpperCase() + String(value || "").slice(1);
}

init();
