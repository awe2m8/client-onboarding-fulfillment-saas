const SPRINT_STORAGE_KEY = "sprint_suite_blocks_v1";
const SYNC_API_URL_KEY = "client_onboarding_ops_api_url_v1";
const SYNC_WORKSPACE_KEY = "client_onboarding_ops_workspace_key_v1";
const SPRINT_SYNC_AUTO_KEY = "sprint_suite_auto_sync_v1";
const SPRINT_SYNC_PULL_INTERVAL_MS = 15000;
const SPRINT_SYNC_REQUEST_TIMEOUT_MS = 20000;
const SPRINT_SYNC_PENDING_GUARD_MS = 45000;
const SPRINT_APP_KEY = "sprints";

const SPRINT_STAGES = [
  { id: "planning", label: "Planning" },
  { id: "in-sprint", label: "In Sprint" },
  { id: "review", label: "Review & Retro" },
  { id: "completed", label: "Completed" }
];

const GOAL_STATUS_OPTIONS = [
  { value: "todo", label: "To Do" },
  { value: "in-progress", label: "In Progress" },
  { value: "done", label: "Done" }
];

const DEFAULT_GOAL_OWNERS = ["Jesse", "Giles"];

const state = {
  sprints: [],
  deletedRecords: [],
  selectedSprintId: null,
  dragSprintId: null,
  sync: {
    apiUrl: "",
    workspaceKey: "",
    autoSync: true,
    pending: false,
    pendingGuardTimerId: null,
    pullTimerId: null,
    pushTimeoutId: null,
    lastSyncedAt: null,
    statusMessage: "",
    statusType: "neutral"
  }
};

const els = {
  sprintForm: document.getElementById("sprintForm"),
  startDateInput: document.getElementById("startDateInput"),
  endDateInput: document.getElementById("endDateInput"),
  seedSprintsBtn: document.getElementById("seedSprintsBtn"),
  clearSprintsBtn: document.getElementById("clearSprintsBtn"),
  sprintTopToggleBtn: document.getElementById("sprintTopToggleBtn"),
  sprintTopContent: document.getElementById("sprintTopContent"),
  sprintSyncToggleBtn: document.getElementById("sprintSyncToggleBtn"),
  sprintSyncContent: document.getElementById("sprintSyncContent"),
  sprintBoardToggleBtn: document.getElementById("sprintBoardToggleBtn"),
  sprintBoardContent: document.getElementById("sprintBoardContent"),
  sprintDetailToggleBtn: document.getElementById("sprintDetailToggleBtn"),
  sprintDetailContent: document.getElementById("sprintDetailContent"),
  apiUrlInput: document.getElementById("apiUrlInput"),
  workspaceKeyInput: document.getElementById("workspaceKeyInput"),
  saveSyncBtn: document.getElementById("saveSyncBtn"),
  pullSharedBtn: document.getElementById("pullSharedBtn"),
  pushSharedBtn: document.getElementById("pushSharedBtn"),
  autoSyncCheckbox: document.getElementById("autoSyncCheckbox"),
  syncStatus: document.getElementById("syncStatus"),
  sprintBoard: document.getElementById("sprintBoard"),
  sprintDetail: document.getElementById("sprintDetail"),
  metricTotalSprints: document.getElementById("metricTotalSprints"),
  metricPlanningSprints: document.getElementById("metricPlanningSprints"),
  metricActiveSprints: document.getElementById("metricActiveSprints"),
  metricReviewSprints: document.getElementById("metricReviewSprints"),
  metricCompletedSprints: document.getElementById("metricCompletedSprints"),
  metricOpenGoals: document.getElementById("metricOpenGoals")
};

function init() {
  const snapshot = loadSnapshot();
  state.sprints = snapshot.sprints;
  state.deletedRecords = snapshot.deletedRecords;

  state.sync.apiUrl = normalizeApiUrl(localStorage.getItem(SYNC_API_URL_KEY) || "");
  state.sync.workspaceKey = localStorage.getItem(SYNC_WORKSPACE_KEY) || "";
  state.sync.autoSync = localStorage.getItem(SPRINT_SYNC_AUTO_KEY) !== "0";

  els.apiUrlInput.value = state.sync.apiUrl;
  els.workspaceKeyInput.value = state.sync.workspaceKey;
  els.autoSyncCheckbox.checked = state.sync.autoSync;

  if (state.sprints.length) {
    state.selectedSprintId = state.sprints[0].id;
  }

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
  els.sprintForm.addEventListener("submit", handleCreateSprint);
  els.seedSprintsBtn.addEventListener("click", seedDemoSprint);
  els.clearSprintsBtn.addEventListener("click", clearAllSprints);
  els.startDateInput.addEventListener("change", autofillCreateEndDate);

  const panelToggles = [
    ["sprintTopToggleBtn", "sprintTopContent"],
    ["sprintSyncToggleBtn", "sprintSyncContent"],
    ["sprintBoardToggleBtn", "sprintBoardContent"],
    ["sprintDetailToggleBtn", "sprintDetailContent"]
  ];

  panelToggles.forEach(([toggleKey, contentKey]) => {
    const toggleBtn = els[toggleKey];
    const contentEl = els[contentKey];

    if (!toggleBtn || !contentEl) {
      return;
    }

    toggleBtn.addEventListener("click", () => {
      togglePanelSection(toggleBtn, contentEl);
    });
  });

  els.saveSyncBtn.addEventListener("click", saveSyncSettings);
  els.pullSharedBtn.addEventListener("click", () => {
    pullSharedData();
  });
  els.pushSharedBtn.addEventListener("click", () => {
    pushSharedData();
  });
  els.autoSyncCheckbox.addEventListener("change", handleAutoSyncToggle);

  els.sprintBoard.addEventListener("click", handleBoardClick);
  els.sprintBoard.addEventListener("dragstart", handleDragStart);
  els.sprintBoard.addEventListener("dragover", handleDragOver);
  els.sprintBoard.addEventListener("dragleave", handleDragLeave);
  els.sprintBoard.addEventListener("drop", handleDrop);
  els.sprintBoard.addEventListener("dragend", clearDropHighlights);

  els.sprintDetail.addEventListener("submit", handleDetailSubmit);
  els.sprintDetail.addEventListener("change", handleDetailChange);
  els.sprintDetail.addEventListener("click", handleDetailClick);
}

function togglePanelSection(toggleBtn, contentEl) {
  const isExpanded = toggleBtn.getAttribute("aria-expanded") === "true";
  const nextExpanded = !isExpanded;

  toggleBtn.setAttribute("aria-expanded", String(nextExpanded));
  contentEl.classList.toggle("is-collapsed", !nextExpanded);
}

function handleCreateSprint(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);

  const name = String(formData.get("name") || "").trim();
  const stageId = normalizeStage(formData.get("stageId"));
  const startDate = normalizeDateOnly(formData.get("startDate"));
  const endDate = normalizeDateOnly(formData.get("endDate"));
  const overallGoals = String(formData.get("overallGoals") || "").trim();

  if (!name || !startDate || !endDate) {
    alert("Sprint name, start date, and end date are required.");
    return;
  }

  if (compareDateOnly(startDate, endDate) > 0) {
    alert("End date must be on or after the start date.");
    return;
  }

  if (!isTwoWeekRange(startDate, endDate)) {
    const proceed = confirm("This range is not 14 days. Create sprint anyway?");
    if (!proceed) {
      return;
    }
  }

  const now = isoNow();
  const sprint = {
    id: uid("sprint"),
    name,
    stageId,
    startDate,
    endDate,
    overallGoals,
    goals: [],
    retro: {
      wins: "",
      improvements: "",
      nextActions: ""
    },
    activity: [buildActivity("Sprint created", now)],
    createdAt: now,
    updatedAt: now
  };

  if (stageId !== "planning") {
    sprint.activity.unshift(buildActivity(`Moved to ${stageLabel(stageId)}`, now));
  }

  clearDeletionRecord(sprint.id);
  state.sprints.unshift(sprint);
  state.selectedSprintId = sprint.id;

  event.currentTarget.reset();
  persistSnapshot();
  render();
}

function autofillCreateEndDate() {
  const startDate = normalizeDateOnly(els.startDateInput.value);
  const endDate = normalizeDateOnly(els.endDateInput.value);

  if (!startDate) {
    return;
  }

  if (!endDate || compareDateOnly(endDate, startDate) < 0) {
    const nextEndDate = addDays(startDate, 13);
    els.endDateInput.value = nextEndDate;
  }
}

function seedDemoSprint() {
  if (state.sprints.length && !confirm("This adds demo sprint data to your workspace. Continue?")) {
    return;
  }

  const today = new Date();
  const currentStart = dateOnly(startOfWeek(today));
  const currentEnd = addDays(currentStart, 13);
  const nextStart = addDays(currentStart, 14);
  const nextEnd = addDays(nextStart, 13);
  const prevStart = addDays(currentStart, -14);
  const prevEnd = addDays(prevStart, 13);

  const now = isoNow();
  const seeded = [
    {
      id: uid("sprint"),
      name: "Sprint 03 - Fulfillment Throughput",
      stageId: "in-sprint",
      startDate: currentStart,
      endDate: currentEnd,
      overallGoals:
        "Lift onboarding-to-delivery handoff quality and reduce client waiting time for kickoff scheduling.",
      goals: [
        buildGoal("Jesse", "Create onboarding QA checklist for every new client", "in-progress", now),
        buildGoal("Jesse", "Launch weekly fulfillment status report", "todo", now),
        buildGoal("Giles", "Standardize kickoff agenda template", "done", now),
        buildGoal("Giles", "Document escalation path for delayed assets", "in-progress", now)
      ],
      retro: {
        wins: "",
        improvements: "",
        nextActions: ""
      },
      activity: [
        buildActivity("Sprint created", now),
        buildActivity("Moved to In Sprint", now)
      ],
      createdAt: now,
      updatedAt: now
    },
    {
      id: uid("sprint"),
      name: "Sprint 04 - PM Visibility",
      stageId: "planning",
      startDate: nextStart,
      endDate: nextEnd,
      overallGoals:
        "Set up clear delivery milestones, define ownership split, and improve client-level progress reporting.",
      goals: [
        buildGoal("Jesse", "Define minimum weekly delivery dashboard", "todo", now),
        buildGoal("Giles", "Map handoff checklist between onboarding and PM", "todo", now)
      ],
      retro: {
        wins: "",
        improvements: "",
        nextActions: ""
      },
      activity: [buildActivity("Sprint created", now)],
      createdAt: now,
      updatedAt: now
    },
    {
      id: uid("sprint"),
      name: "Sprint 02 - Intake Stabilization",
      stageId: "completed",
      startDate: prevStart,
      endDate: prevEnd,
      overallGoals: "Reduce manual follow-up by setting clearer onboarding form expectations.",
      goals: [
        buildGoal("Jesse", "Tighten onboarding form copy", "done", now),
        buildGoal("Giles", "Create payment link send checklist", "done", now)
      ],
      retro: {
        wins: "Clients understood next steps faster after kickoff call.",
        improvements: "Need a better way to track unresponsive clients in-week.",
        nextActions: "Add waiting-on-client lane and reminder cadence in next sprint."
      },
      activity: [
        buildActivity("Sprint created", now),
        buildActivity("Moved to Completed", now)
      ],
      createdAt: now,
      updatedAt: now
    }
  ];

  seeded.forEach((sprint) => clearDeletionRecord(sprint.id));

  state.sprints = [...seeded, ...state.sprints].sort((a, b) => compareIso(b.updatedAt, a.updatedAt));
  state.selectedSprintId = seeded[0].id;

  persistSnapshot();
  render();
}

function clearAllSprints() {
  if (!confirm("Delete all sprint data from this browser?")) {
    return;
  }

  const now = isoNow();
  state.sprints.forEach((sprint) => {
    recordDeletion(sprint.id, now);
  });

  state.sprints = [];
  state.selectedSprintId = null;
  persistSnapshot();
  render();

  setSyncStatus("Local sprint data cleared. Push to propagate deletes to the shared workspace.", "neutral");
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
  localStorage.setItem(SPRINT_SYNC_AUTO_KEY, state.sync.autoSync ? "1" : "0");

  restartPullTimer();

  if (state.sync.autoSync) {
    setSyncStatus("Auto sync enabled. Local changes push and pulls run every 15s.", "ok");
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

  const sprint = getSprint(actionEl.dataset.sprintId);
  if (!sprint) {
    return;
  }

  const action = actionEl.dataset.action;
  if (action === "open-sprint") {
    state.selectedSprintId = sprint.id;
    renderDetail();
    return;
  }

  if (action === "move-next") {
    const nextStage = nextStageId(sprint.stageId);
    if (!nextStage) {
      return;
    }

    moveSprint(sprint, nextStage);
  }
}

function handleDragStart(event) {
  const card = event.target.closest(".sp-card");
  if (!card) {
    return;
  }

  state.dragSprintId = card.dataset.sprintId;
  card.classList.add("is-dragging");

  if (event.dataTransfer) {
    event.dataTransfer.setData("text/plain", state.dragSprintId);
    event.dataTransfer.effectAllowed = "move";
  }
}

function handleDragOver(event) {
  const dropzone = event.target.closest(".sp-dropzone");
  if (!dropzone) {
    return;
  }

  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = "move";
  }
  dropzone.classList.add("is-over");
}

function handleDragLeave(event) {
  const dropzone = event.target.closest(".sp-dropzone");
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
  const dropzone = event.target.closest(".sp-dropzone");
  if (!dropzone) {
    return;
  }

  event.preventDefault();
  dropzone.classList.remove("is-over");

  const sprintId = (event.dataTransfer && event.dataTransfer.getData("text/plain")) || state.dragSprintId;
  const stageId = normalizeStage(dropzone.dataset.stageId);
  const sprint = getSprint(sprintId);

  if (!sprint || sprint.stageId === stageId) {
    clearDropHighlights();
    return;
  }

  moveSprint(sprint, stageId);
  clearDropHighlights();
}

function clearDropHighlights() {
  document.querySelectorAll(".sp-dropzone.is-over").forEach((node) => {
    node.classList.remove("is-over");
  });

  document.querySelectorAll(".sp-card.is-dragging").forEach((node) => {
    node.classList.remove("is-dragging");
  });

  state.dragSprintId = null;
}

function moveSprint(sprint, nextStage) {
  sprint.stageId = nextStage;
  touchSprint(sprint, `Moved to ${stageLabel(nextStage)}`);
  persistSnapshot();
  render();
}

function handleDetailSubmit(event) {
  event.preventDefault();

  const sprint = getSelectedSprint();
  if (!sprint) {
    return;
  }

  const form = event.target;
  if (form.id === "detailSprintForm") {
    const formData = new FormData(form);
    const name = String(formData.get("name") || "").trim();
    const stageId = normalizeStage(formData.get("stageId"));
    const startDate = normalizeDateOnly(formData.get("startDate"));
    const endDate = normalizeDateOnly(formData.get("endDate"));

    if (!name || !startDate || !endDate) {
      alert("Sprint name, start date, and end date are required.");
      return;
    }

    if (compareDateOnly(startDate, endDate) > 0) {
      alert("End date must be on or after start date.");
      return;
    }

    if (!isTwoWeekRange(startDate, endDate)) {
      const proceed = confirm("This range is not 14 days. Save anyway?");
      if (!proceed) {
        return;
      }
    }

    const previousStage = sprint.stageId;

    sprint.name = name;
    sprint.stageId = stageId;
    sprint.startDate = startDate;
    sprint.endDate = endDate;
    sprint.overallGoals = String(formData.get("overallGoals") || "").trim();
    sprint.retro = {
      wins: String(formData.get("retroWins") || "").trim(),
      improvements: String(formData.get("retroImprovements") || "").trim(),
      nextActions: String(formData.get("retroNextActions") || "").trim()
    };

    touchSprint(sprint, "Sprint details updated");

    if (stageId !== previousStage) {
      sprint.activity.unshift(buildActivity(`Moved to ${stageLabel(stageId)}`, sprint.updatedAt));
    }

    persistSnapshot();
    render();
    return;
  }

  if (form.id === "addGoalForm") {
    const formData = new FormData(form);
    const title = String(formData.get("title") || "").trim();

    if (!title) {
      return;
    }

    const goal = buildGoal(
      formData.get("owner"),
      title,
      formData.get("status"),
      isoNow()
    );

    sprint.goals.unshift(goal);
    touchSprint(sprint, `Goal added (${goal.owner}): ${goal.title}`);

    form.reset();
    persistSnapshot();
    render();
    return;
  }

  if (form.dataset.form === "add-subtask") {
    const goalId = String(form.dataset.goalId || "").trim();
    const goal = sprint.goals.find((item) => item.id === goalId);
    if (!goal) {
      return;
    }

    const formData = new FormData(form);
    const title = String(formData.get("title") || "").trim();
    if (!title) {
      return;
    }

    const now = isoNow();
    const subtask = buildSubtask(title, formData.get("status"), now);

    if (!Array.isArray(goal.subtasks)) {
      goal.subtasks = [];
    }

    goal.subtasks.unshift(subtask);
    goal.updatedAt = now;

    touchSprint(sprint, `Sub-task added (${goal.owner}): ${subtask.title}`);

    form.reset();
    persistSnapshot();
    render();
  }
}

function handleDetailChange(event) {
  const action = event.target.dataset.action;
  if (!action) {
    return;
  }

  const sprint = getSelectedSprint();
  if (!sprint) {
    return;
  }

  const goal = sprint.goals.find((item) => item.id === event.target.dataset.goalId);
  if (!goal) {
    return;
  }

  if (action === "goal-toggle") {
    goal.done = Boolean(event.target.checked);
    goal.status = goal.done ? "done" : "todo";
    goal.updatedAt = isoNow();
    touchSprint(sprint, `${goal.done ? "Completed" : "Reopened"} goal (${goal.owner}): ${goal.title}`);
    persistSnapshot();
    render();
    return;
  }

  if (action === "goal-status") {
    goal.status = normalizeGoalStatus(event.target.value);
    goal.done = goal.status === "done";
    goal.updatedAt = isoNow();
    touchSprint(sprint, `Updated goal status (${goal.owner}): ${goal.title}`);
    persistSnapshot();
    render();
    return;
  }

  if (action === "subtask-toggle") {
    const subtask = (goal.subtasks || []).find((item) => item.id === event.target.dataset.subtaskId);
    if (!subtask) {
      return;
    }

    subtask.done = Boolean(event.target.checked);
    subtask.status = subtask.done ? "done" : "todo";
    subtask.updatedAt = isoNow();
    goal.updatedAt = subtask.updatedAt;

    touchSprint(
      sprint,
      `${subtask.done ? "Completed" : "Reopened"} sub-task (${goal.owner}): ${subtask.title}`
    );
    persistSnapshot();
    render();
    return;
  }

  if (action === "subtask-status") {
    const subtask = (goal.subtasks || []).find((item) => item.id === event.target.dataset.subtaskId);
    if (!subtask) {
      return;
    }

    subtask.status = normalizeGoalStatus(event.target.value);
    subtask.done = subtask.status === "done";
    subtask.updatedAt = isoNow();
    goal.updatedAt = subtask.updatedAt;

    touchSprint(sprint, `Updated sub-task status (${goal.owner}): ${subtask.title}`);
    persistSnapshot();
    render();
  }
}

function handleDetailClick(event) {
  const actionEl = event.target.closest("[data-action]");
  if (!actionEl) {
    return;
  }

  const sprint = getSelectedSprint();
  if (!sprint) {
    return;
  }

  const action = actionEl.dataset.action;

  if (action === "delete-sprint") {
    if (!confirm(`Delete sprint \"${sprint.name}\"?`)) {
      return;
    }

    recordDeletion(sprint.id, isoNow());
    state.sprints = state.sprints.filter((item) => item.id !== sprint.id);
    state.selectedSprintId = state.sprints[0]?.id || null;
    persistSnapshot();
    render();
    return;
  }

  if (action === "goal-delete") {
    const goalId = actionEl.dataset.goalId;
    const goal = sprint.goals.find((item) => item.id === goalId);

    sprint.goals = sprint.goals.filter((item) => item.id !== goalId);
    touchSprint(sprint, `Removed goal (${goal ? goal.owner : "Owner"}): ${goal ? goal.title : "Goal"}`);
    persistSnapshot();
    render();
    return;
  }

  if (action === "subtask-delete") {
    const goalId = String(actionEl.dataset.goalId || "").trim();
    const subtaskId = String(actionEl.dataset.subtaskId || "").trim();
    const goal = sprint.goals.find((item) => item.id === goalId);
    if (!goal) {
      return;
    }

    const subtask = (goal.subtasks || []).find((item) => item.id === subtaskId);
    goal.subtasks = (goal.subtasks || []).filter((item) => item.id !== subtaskId);
    goal.updatedAt = isoNow();

    touchSprint(
      sprint,
      `Removed sub-task (${goal.owner}): ${subtask ? subtask.title : "Sub-task"}`
    );
    persistSnapshot();
    render();
  }
}

function render() {
  renderMetrics();
  renderBoard();
  renderDetail();
  renderSyncStatus();
}

function renderMetrics() {
  const total = state.sprints.length;
  const planning = countByStage("planning");
  const active = countByStage("in-sprint");
  const review = countByStage("review");
  const completed = countByStage("completed");
  const openGoals = state.sprints.reduce((sum, sprint) => sum + sprint.goals.filter((goal) => !goal.done).length, 0);

  els.metricTotalSprints.textContent = String(total);
  els.metricPlanningSprints.textContent = String(planning);
  els.metricActiveSprints.textContent = String(active);
  els.metricReviewSprints.textContent = String(review);
  els.metricCompletedSprints.textContent = String(completed);
  els.metricOpenGoals.textContent = String(openGoals);
}

function renderBoard() {
  els.sprintBoard.innerHTML = SPRINT_STAGES.map((stage) => {
    const stageSprints = state.sprints
      .filter((sprint) => sprint.stageId === stage.id)
      .sort((a, b) => compareIso(b.updatedAt, a.updatedAt));

    return `
      <section class="sp-column">
        <div class="sp-column-head">
          <h3>${escapeHtml(stage.label)}</h3>
          <span class="sp-count-pill">${stageSprints.length}</span>
        </div>
        <div class="sp-dropzone" data-stage-id="${stage.id}">
          ${stageSprints.length ? stageSprints.map(renderSprintCard).join("") : '<p class="sp-empty-col">No sprints</p>'}
        </div>
      </section>
    `;
  }).join("");
}

function renderSprintCard(sprint) {
  const totalGoals = sprint.goals.length;
  const doneGoals = sprint.goals.filter((goal) => goal.done).length;
  const cadenceDays = sprintLengthDays(sprint);
  const cadenceLabel = cadenceDays ? `${cadenceDays}-day block` : "Date range missing";
  const isStandardCadence = cadenceDays === 14;
  const rangeLabel = sprintDateLabel(sprint);
  const goalLabel = totalGoals ? `${doneGoals}/${totalGoals} goals complete` : "No goals yet";
  const nextStage = nextStageId(sprint.stageId);

  return `
    <article class="sp-card" draggable="true" data-sprint-id="${sprint.id}">
      <header>
        <h4>${escapeHtml(sprint.name)}</h4>
        <button class="sp-open-link" type="button" data-action="open-sprint" data-sprint-id="${sprint.id}">Open</button>
      </header>
      <p class="sp-card-meta">${escapeHtml(rangeLabel)}</p>
      <div class="sp-badge-row">
        <span class="sp-badge ${isStandardCadence ? "" : "warn"}">${escapeHtml(cadenceLabel)}</span>
        <span class="sp-badge">${escapeHtml(goalLabel)}</span>
      </div>
      <p class="sp-card-meta">Updated ${escapeHtml(timeAgo(sprint.updatedAt))}</p>
      ${nextStage ? `<div class="sp-card-actions"><button class="sp-ghost" type="button" data-action="move-next" data-sprint-id="${sprint.id}">Move to ${escapeHtml(stageLabel(nextStage))}</button></div>` : ""}
      <p class="sp-card-updated">${escapeHtml(truncate(sprint.overallGoals || "No overall objectives yet.", 92))}</p>
    </article>
  `;
}

function renderDetail() {
  const sprint = getSelectedSprint();

  if (!sprint) {
    els.sprintDetail.textContent =
      state.sprints.length === 0
        ? "No sprints yet. Create your first two-week sprint block above."
        : "Select a sprint card to edit details and goals.";
    return;
  }

  const owners = ownerColumns(sprint.goals);
  const goalColumns = owners
    .map((owner) => {
      const goals = sprint.goals
        .filter((goal) => goal.owner === owner)
        .sort((a, b) => compareIso(b.updatedAt, a.updatedAt));

      const listMarkup = goals.length
        ? `<ul class="sp-list">${goals.map(renderGoalItem).join("")}</ul>`
        : '<p class="sp-empty-state">No goals yet.</p>';

      return `
        <article class="sp-goal-column ${ownerColumnClass(owner)}">
          <h4>${escapeHtml(owner)} Goals</h4>
          ${listMarkup}
        </article>
      `;
    })
    .join("");

  const activityMarkup = sprint.activity.length
    ? `<ul class="sp-list">${sprint.activity
        .slice(0, 40)
        .map(
          (item) => `
            <li class="sp-list-item">
              <p>${escapeHtml(item.message)}</p>
              <small>${escapeHtml(formatDateTime(item.createdAt))}</small>
            </li>
          `
        )
        .join("")}</ul>`
    : '<p class="sp-empty-state">No activity yet.</p>';

  els.sprintDetail.innerHTML = `
    <div class="sp-detail-wrap">
      <form id="detailSprintForm" class="sp-detail-section">
        <h3>Sprint Profile</h3>
        <div class="sp-detail-grid">
          <label>
            Sprint Name
            <input name="name" required value="${escapeHtml(sprint.name)}" />
          </label>
          <label>
            Stage
            <select name="stageId">
              ${optionMarkup(SPRINT_STAGES.map((stage) => ({ value: stage.id, label: stage.label })), sprint.stageId)}
            </select>
          </label>
          <label>
            Start Date
            <input name="startDate" type="date" value="${escapeHtml(sprint.startDate || "")}" required />
          </label>
          <label>
            End Date
            <input name="endDate" type="date" value="${escapeHtml(sprint.endDate || "")}" required />
          </label>
          <label class="sp-span-2">
            Overall Objectives
            <textarea name="overallGoals">${escapeHtml(sprint.overallGoals || "")}</textarea>
          </label>
          <label class="sp-span-2">
            Retro: Wins
            <textarea name="retroWins" placeholder="What worked well this sprint?">${escapeHtml(sprint.retro.wins || "")}</textarea>
          </label>
          <label class="sp-span-2">
            Retro: Improvements
            <textarea name="retroImprovements" placeholder="What should improve next sprint?">${escapeHtml(
              sprint.retro.improvements || ""
            )}</textarea>
          </label>
          <label class="sp-span-2">
            Retro: Next Actions
            <textarea name="retroNextActions" placeholder="What actions roll into the next block?">${escapeHtml(
              sprint.retro.nextActions || ""
            )}</textarea>
          </label>
        </div>
        <div class="sp-form-actions">
          <button type="submit">Save Sprint</button>
          <button type="button" class="sp-danger" data-action="delete-sprint">Delete Sprint</button>
        </div>
      </form>

      <section class="sp-detail-section">
        <h3>Owner Goals</h3>
        <form id="addGoalForm" class="sp-goal-form">
          <label>
            Owner
            <select name="owner">
              ${DEFAULT_GOAL_OWNERS.map((owner) => `<option value="${escapeHtml(owner)}">${escapeHtml(owner)}</option>`).join("")}
            </select>
          </label>
          <label class="sp-span-2">
            Sprint Goal
            <input name="title" placeholder="Define the goal outcome for this sprint." required />
          </label>
          <label>
            Status
            <select name="status" class="sp-goal-status ${statusClass("todo")}">
              ${optionMarkup(GOAL_STATUS_OPTIONS, "todo")}
            </select>
          </label>
          <button type="submit">Add Goal</button>
        </form>

        <div class="sp-goal-columns">
          ${goalColumns}
        </div>
      </section>

      <section class="sp-detail-section">
        <details class="sp-activity-details">
          <summary>Sprint Activity</summary>
          <div class="sp-activity-content">
            ${activityMarkup}
          </div>
        </details>
      </section>
    </div>
  `;
}

function renderGoalItem(goal) {
  const subtasks = Array.isArray(goal.subtasks) ? goal.subtasks : [];
  const completedSubtasks = subtasks.filter((item) => item.done).length;
  const status = normalizeGoalStatus(goal.status);
  const statusLabel = goalStatusLabel(status);
  const statusToneClass = statusClass(status);
  const subtaskListMarkup = subtasks.length
    ? `<ul class="sp-subtask-list">${subtasks.map((item) => renderSubtaskItem(goal, item)).join("")}</ul>`
    : '<p class="sp-empty-state">No sub-tasks yet.</p>';

  return `
    <li class="sp-list-item">
      <div class="sp-goal-row">
        <label class="sp-goal-check">
          <input type="checkbox" data-action="goal-toggle" data-goal-id="${goal.id}" ${goal.done ? "checked" : ""} />
          <span>${escapeHtml(goal.title)}</span>
        </label>
        <span class="sp-status-chip ${statusToneClass}">${escapeHtml(statusLabel)}</span>
        <select class="sp-goal-status ${statusToneClass}" data-action="goal-status" data-goal-id="${goal.id}">
          ${optionMarkup(GOAL_STATUS_OPTIONS, goal.status)}
        </select>
        <button class="sp-ghost" type="button" data-action="goal-delete" data-goal-id="${goal.id}">Delete</button>
      </div>
      <p class="sp-goal-meta">Updated ${escapeHtml(timeAgo(goal.updatedAt))}</p>
      <details class="sp-subtask-details">
        <summary>Sub-tasks (${completedSubtasks}/${subtasks.length})</summary>
        <div class="sp-subtask-panel">
          <form class="sp-subtask-form" data-form="add-subtask" data-goal-id="${goal.id}">
            <input name="title" placeholder="Add a sub-task" required />
            <select name="status" class="sp-goal-status ${statusClass("todo")}">
              ${optionMarkup(GOAL_STATUS_OPTIONS, "todo")}
            </select>
            <button type="submit">Add</button>
          </form>
          ${subtaskListMarkup}
        </div>
      </details>
    </li>
  `;
}

function renderSubtaskItem(goal, subtask) {
  const status = normalizeGoalStatus(subtask.status);
  const statusToneClass = statusClass(status);

  return `
    <li class="sp-subtask-item">
      <div class="sp-subtask-row">
        <label class="sp-goal-check">
          <input
            type="checkbox"
            data-action="subtask-toggle"
            data-goal-id="${goal.id}"
            data-subtask-id="${subtask.id}"
            ${subtask.done ? "checked" : ""}
          />
          <span>${escapeHtml(subtask.title)}</span>
        </label>
        <span class="sp-status-chip ${statusToneClass}">${escapeHtml(goalStatusLabel(status))}</span>
        <select
          class="sp-goal-status ${statusToneClass}"
          data-action="subtask-status"
          data-goal-id="${goal.id}"
          data-subtask-id="${subtask.id}"
        >
          ${optionMarkup(GOAL_STATUS_OPTIONS, status)}
        </select>
        <button
          class="sp-ghost"
          type="button"
          data-action="subtask-delete"
          data-goal-id="${goal.id}"
          data-subtask-id="${subtask.id}"
        >
          Delete
        </button>
      </div>
      <p class="sp-goal-meta">Updated ${escapeHtml(timeAgo(subtask.updatedAt))}</p>
    </li>
  `;
}

function countByStage(stageId) {
  return state.sprints.filter((sprint) => sprint.stageId === stageId).length;
}

function getSprint(id) {
  return state.sprints.find((item) => item.id === id) || null;
}

function getSelectedSprint() {
  return getSprint(state.selectedSprintId);
}

function touchSprint(sprint, message) {
  const now = isoNow();
  sprint.updatedAt = now;
  sprint.activity.unshift(buildActivity(message, now));
}

function buildActivity(message, createdAt) {
  return {
    id: uid("activity"),
    message,
    createdAt
  };
}

function buildGoal(owner, title, status, createdAt) {
  const normalizedStatus = normalizeGoalStatus(status);
  const normalizedOwner = normalizeGoalOwner(owner);

  return {
    id: uid("goal"),
    owner: normalizedOwner,
    title: String(title || "").trim(),
    status: normalizedStatus,
    done: normalizedStatus === "done",
    subtasks: [],
    createdAt,
    updatedAt: createdAt
  };
}

function buildSubtask(title, status, createdAt) {
  const normalizedStatus = normalizeGoalStatus(status);

  return {
    id: uid("subtask"),
    title: String(title || "").trim(),
    status: normalizedStatus,
    done: normalizedStatus === "done",
    createdAt,
    updatedAt: createdAt
  };
}

async function pullSharedData({ silent = false } = {}) {
  if (!isSyncReady()) {
    if (!silent) {
      setSyncStatus("Local only. Set API URL and workspace key to share data.", "neutral");
    }
    return;
  }

  if (state.sync.pending) {
    if (!silent) {
      setSyncStatus("Sync in progress. Please wait.", "neutral");
    }
    return;
  }

  startSyncPending();

  try {
    const url = `${state.sync.apiUrl}/ops/workspaces/${encodeURIComponent(state.sync.workspaceKey)}/records?app=${encodeURIComponent(
      SPRINT_APP_KEY
    )}`;

    const response = await fetchWithTimeout(url);
    if (!response.ok) {
      throw new Error(await response.text());
    }

    const json = await response.json();
    const records = Array.isArray(json.records) ? json.records : [];

    applyRemoteRecords(records);
    state.sync.lastSyncedAt = isoNow();

    if (!silent) {
      setSyncStatus(`Pulled ${records.length} shared sprint record(s).`, "ok");
    } else {
      renderSyncStatus();
    }
  } catch (error) {
    setSyncStatus(`Pull failed: ${syncErrorMessage(error)}`, "error");
  } finally {
    clearSyncPending();
  }
}

async function pushSharedData({ silent = false } = {}) {
  if (!isSyncReady()) {
    if (!silent) {
      setSyncStatus("Local only. Set API URL and workspace key to share data.", "neutral");
    }
    return;
  }

  if (state.sync.pending) {
    if (!silent) {
      setSyncStatus("Sync in progress. Please wait.", "neutral");
    }
    return;
  }

  const upserts = state.sprints.map((sprint) => ({
    id: sprint.id,
    payload: sprint,
    updatedAt: sprint.updatedAt
  }));

  const deletions = state.deletedRecords.map((item) => ({
    id: item.id,
    updatedAt: item.updatedAt
  }));

  if (!upserts.length && !deletions.length) {
    if (!silent) {
      setSyncStatus("Nothing to push yet.", "neutral");
    }
    return;
  }

  startSyncPending();

  try {
    const url = `${state.sync.apiUrl}/ops/workspaces/${encodeURIComponent(state.sync.workspaceKey)}/sync?app=${encodeURIComponent(
      SPRINT_APP_KEY
    )}`;

    const response = await fetchWithTimeout(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ upserts, deletions })
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const json = await response.json();
    state.deletedRecords = [];
    persistSnapshot({ skipAutoPush: true });

    state.sync.lastSyncedAt = isoNow();

    if (!silent) {
      setSyncStatus(
        `Pushed ${Number(json.appliedUpserts || 0)} upsert(s) and ${Number(json.appliedDeletions || 0)} deletion(s).`,
        "ok"
      );
    } else {
      renderSyncStatus();
    }
  } catch (error) {
    setSyncStatus(`Push failed: ${syncErrorMessage(error)}`, "error");
  } finally {
    clearSyncPending();
  }
}

function applyRemoteRecords(records) {
  const sprintMap = new Map(state.sprints.map((item) => [item.id, item]));
  const deletedMap = new Map(state.deletedRecords.map((item) => [item.id, item.updatedAt]));

  records.forEach((record) => {
    const sprintId = String(record?.clientId || "").trim();
    if (!sprintId) {
      return;
    }

    const recordUpdatedAt = normalizeTimestamp(record.updatedAt || isoNow());
    const localSprint = sprintMap.get(sprintId) || null;
    const localUpdatedAt = localSprint ? normalizeTimestamp(localSprint.updatedAt) : null;
    const localDeletedUpdatedAt = deletedMap.get(sprintId) || null;
    const latestLocalUpdatedAt = maxTimestamp(localUpdatedAt, localDeletedUpdatedAt);

    if (record.deleted) {
      if (!latestLocalUpdatedAt || compareIso(recordUpdatedAt, latestLocalUpdatedAt) >= 0) {
        sprintMap.delete(sprintId);
        deletedMap.set(sprintId, recordUpdatedAt);
      }
      return;
    }

    const remoteSprint = sanitizeSprint({
      ...record.payload,
      id: sprintId,
      updatedAt: recordUpdatedAt
    });

    if (!remoteSprint) {
      return;
    }

    if (!latestLocalUpdatedAt || compareIso(remoteSprint.updatedAt, latestLocalUpdatedAt) >= 0) {
      sprintMap.set(sprintId, remoteSprint);
      deletedMap.delete(sprintId);
    }
  });

  state.sprints = Array.from(sprintMap.values()).sort((a, b) => compareIso(b.updatedAt, a.updatedAt));
  state.deletedRecords = Array.from(deletedMap.entries()).map(([id, updatedAt]) => ({ id, updatedAt }));

  if (!state.selectedSprintId || !state.sprints.some((item) => item.id === state.selectedSprintId)) {
    state.selectedSprintId = state.sprints[0]?.id || null;
  }

  persistSnapshot({ skipAutoPush: true });
  render();
}

function recordDeletion(id, updatedAt) {
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

function clearDeletionRecord(id) {
  state.deletedRecords = state.deletedRecords.filter((item) => item.id !== id);
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
  }, SPRINT_SYNC_PULL_INTERVAL_MS);
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
  }, 650);
}

function isSyncReady() {
  return Boolean(state.sync.apiUrl && state.sync.workspaceKey);
}

function renderSyncStatus() {
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
  els.autoSyncCheckbox.disabled = disabled;
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

  if (state.sync.autoSync) {
    return "Auto sync enabled. Pulling updates every 15s.";
  }

  return "Team sync ready. Use Pull Shared Data to load latest sprints.";
}

function setSyncStatus(message, type = "neutral") {
  state.sync.statusMessage = message;
  state.sync.statusType = type;
  renderSyncStatus();
}

function startSyncPending() {
  state.sync.pending = true;
  renderSyncStatus();

  if (state.sync.pendingGuardTimerId) {
    clearTimeout(state.sync.pendingGuardTimerId);
  }

  state.sync.pendingGuardTimerId = setTimeout(() => {
    if (!state.sync.pending) {
      return;
    }

    state.sync.pending = false;
    state.sync.pendingGuardTimerId = null;
    setSyncStatus("Sync timed out. Please try again.", "error");
  }, SPRINT_SYNC_PENDING_GUARD_MS);
}

function clearSyncPending() {
  state.sync.pending = false;

  if (state.sync.pendingGuardTimerId) {
    clearTimeout(state.sync.pendingGuardTimerId);
    state.sync.pendingGuardTimerId = null;
  }

  renderSyncStatus();
}

async function fetchWithTimeout(url, options = {}, timeoutMs = SPRINT_SYNC_REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

function syncErrorMessage(error) {
  const message = String(error?.message || error || "Unknown error")
    .replace(/\s+/g, " ")
    .trim();

  if (message.length > 220) {
    return `${message.slice(0, 217)}...`;
  }

  return message;
}

function persistSnapshot({ skipAutoPush = false } = {}) {
  localStorage.setItem(
    SPRINT_STORAGE_KEY,
    JSON.stringify({
      sprints: state.sprints,
      deletedRecords: state.deletedRecords
    })
  );

  if (!skipAutoPush) {
    scheduleAutoPush();
  }
}

function loadSnapshot() {
  try {
    const raw = localStorage.getItem(SPRINT_STORAGE_KEY);
    if (!raw) {
      return { sprints: [], deletedRecords: [] };
    }

    const parsed = JSON.parse(raw);
    const sprintsRaw = Array.isArray(parsed?.sprints) ? parsed.sprints : [];
    const deletedRaw = Array.isArray(parsed?.deletedRecords) ? parsed.deletedRecords : [];

    return {
      sprints: sprintsRaw.map(sanitizeSprint).filter(Boolean).sort((a, b) => compareIso(b.updatedAt, a.updatedAt)),
      deletedRecords: sanitizeDeletedRecords(deletedRaw)
    };
  } catch (_error) {
    return { sprints: [], deletedRecords: [] };
  }
}

function sanitizeDeletedRecords(input) {
  return input
    .map((item) => {
      const id = String(item?.id || "").trim();
      if (!id) {
        return null;
      }

      return {
        id,
        updatedAt: normalizeTimestamp(item.updatedAt || item.deletedAt || isoNow())
      };
    })
    .filter(Boolean)
    .sort((a, b) => compareIso(b.updatedAt, a.updatedAt));
}

function sanitizeSprint(raw) {
  const id = String(raw?.id || "").trim();
  if (!id) {
    return null;
  }

  const createdAt = normalizeTimestamp(raw.createdAt || isoNow());
  const updatedAt = normalizeTimestamp(raw.updatedAt || createdAt);

  const activity = sanitizeActivity(raw.activity);
  const goals = sanitizeGoals(raw.goals);

  return {
    id,
    name: truncate(String(raw.name || "Untitled Sprint").trim() || "Untitled Sprint", 140),
    stageId: normalizeStage(raw.stageId),
    startDate: normalizeDateOnly(raw.startDate),
    endDate: normalizeDateOnly(raw.endDate),
    overallGoals: String(raw.overallGoals || "").trim(),
    goals,
    retro: sanitizeRetro(raw.retro),
    activity: activity.length ? activity : [buildActivity("Sprint record synced", updatedAt)],
    createdAt,
    updatedAt
  };
}

function sanitizeGoals(input) {
  const goals = Array.isArray(input) ? input : [];

  return goals
    .map((item) => {
      const id = String(item?.id || "").trim();
      if (!id) {
        return null;
      }

      const status = normalizeGoalStatus(item.status || (item.done ? "done" : "todo"));

      return {
        id,
        owner: normalizeGoalOwner(item.owner),
        title: String(item.title || "").trim(),
        status,
        done: status === "done",
        subtasks: sanitizeSubtasks(item.subtasks),
        createdAt: normalizeTimestamp(item.createdAt || isoNow()),
        updatedAt: normalizeTimestamp(item.updatedAt || item.createdAt || isoNow())
      };
    })
    .filter((item) => item && item.title)
    .slice(0, 1000);
}

function sanitizeSubtasks(input) {
  const subtasks = Array.isArray(input) ? input : [];

  return subtasks
    .map((item) => {
      const id = String(item?.id || "").trim();
      if (!id) {
        return null;
      }

      const status = normalizeGoalStatus(item.status || (item.done ? "done" : "todo"));

      return {
        id,
        title: String(item.title || "").trim(),
        status,
        done: status === "done",
        createdAt: normalizeTimestamp(item.createdAt || isoNow()),
        updatedAt: normalizeTimestamp(item.updatedAt || item.createdAt || isoNow())
      };
    })
    .filter((item) => item && item.title)
    .slice(0, 400);
}

function sanitizeRetro(input) {
  return {
    wins: String(input?.wins || "").trim(),
    improvements: String(input?.improvements || "").trim(),
    nextActions: String(input?.nextActions || "").trim()
  };
}

function sanitizeActivity(input) {
  const activity = Array.isArray(input) ? input : [];

  return activity
    .map((item) => {
      const id = String(item?.id || "").trim();
      const message = String(item?.message || "").trim();
      if (!id || !message) {
        return null;
      }

      return {
        id,
        message: truncate(message, 220),
        createdAt: normalizeTimestamp(item.createdAt || isoNow())
      };
    })
    .filter(Boolean)
    .slice(0, 120);
}

function normalizeStage(value) {
  const allowed = new Set(SPRINT_STAGES.map((stage) => stage.id));
  const normalized = String(value || "").trim();
  return allowed.has(normalized) ? normalized : "planning";
}

function normalizeGoalStatus(value) {
  const allowed = new Set(GOAL_STATUS_OPTIONS.map((option) => option.value));
  const normalized = String(value || "").trim();
  return allowed.has(normalized) ? normalized : "todo";
}

function goalStatusLabel(value) {
  return GOAL_STATUS_OPTIONS.find((option) => option.value === normalizeGoalStatus(value))?.label || "To Do";
}

function statusClass(value) {
  const status = normalizeGoalStatus(value);
  if (status === "done") {
    return "sp-status-done";
  }
  if (status === "in-progress") {
    return "sp-status-in-progress";
  }
  return "sp-status-todo";
}

function normalizeGoalOwner(value) {
  const owner = String(value || "").trim();
  if (!owner) {
    return DEFAULT_GOAL_OWNERS[0];
  }

  const normalized = owner.charAt(0).toUpperCase() + owner.slice(1).toLowerCase();
  if (normalized === "Jesse" || normalized === "Giles") {
    return normalized;
  }

  return truncate(normalized, 40);
}

function normalizeApiUrl(value) {
  return String(value || "")
    .trim()
    .replace(/\/+$/, "");
}

function normalizeWorkspaceKey(value) {
  const cleaned = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, "")
    .slice(0, 64);

  if (cleaned.length < 2) {
    return "";
  }

  return cleaned;
}

function normalizeTimestamp(value) {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString();
  }

  return date.toISOString();
}

function normalizeDateOnly(value) {
  const input = String(value || "").trim();
  if (!input) {
    return "";
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return "";
  }

  const date = new Date(`${input}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return input;
}

function isTwoWeekRange(startDate, endDate) {
  const days = daysBetweenInclusive(startDate, endDate);
  return days === 14;
}

function sprintLengthDays(sprint) {
  return daysBetweenInclusive(sprint.startDate, sprint.endDate);
}

function daysBetweenInclusive(startDate, endDate) {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);

  if (!start || !end) {
    return null;
  }

  const diffMs = end.getTime() - start.getTime();
  if (diffMs < 0) {
    return null;
  }

  return Math.floor(diffMs / 86400000) + 1;
}

function parseDateOnly(value) {
  const normalized = normalizeDateOnly(value);
  if (!normalized) {
    return null;
  }

  const date = new Date(`${normalized}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function compareDateOnly(a, b) {
  const first = parseDateOnly(a);
  const second = parseDateOnly(b);

  if (!first || !second) {
    return 0;
  }

  if (first.getTime() === second.getTime()) {
    return 0;
  }

  return first.getTime() > second.getTime() ? 1 : -1;
}

function addDays(dateOnlyValue, days) {
  const base = parseDateOnly(dateOnlyValue);
  if (!base) {
    return "";
  }

  base.setDate(base.getDate() + Number(days || 0));
  return dateOnly(base);
}

function stageLabel(stageId) {
  return SPRINT_STAGES.find((stage) => stage.id === stageId)?.label || "Planning";
}

function nextStageId(stageId) {
  const index = SPRINT_STAGES.findIndex((stage) => stage.id === stageId);
  if (index < 0 || index >= SPRINT_STAGES.length - 1) {
    return "";
  }

  return SPRINT_STAGES[index + 1].id;
}

function sprintDateLabel(sprint) {
  if (!sprint.startDate || !sprint.endDate) {
    return "Date range not set";
  }

  return `${formatDate(sprint.startDate)} to ${formatDate(sprint.endDate)}`;
}

function ownerColumns(goals) {
  const existing = uniqueValues(goals.map((goal) => goal.owner));
  const extras = existing.filter((owner) => !DEFAULT_GOAL_OWNERS.includes(owner));
  return [...DEFAULT_GOAL_OWNERS, ...extras];
}

function ownerColumnClass(owner) {
  const normalized = String(owner || "").trim().toLowerCase();
  if (normalized === "giles") {
    return "sp-owner-giles";
  }
  if (normalized === "jesse") {
    return "sp-owner-jesse";
  }
  return "sp-owner-generic";
}

function optionMarkup(options, selectedValue) {
  return options
    .map((option) => {
      const selected = String(option.value) === String(selectedValue) ? " selected" : "";
      return `<option value="${escapeHtml(option.value)}"${selected}>${escapeHtml(option.label)}</option>`;
    })
    .join("");
}

function formatDate(value) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
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
    return "just now";
  }

  const diffMs = Date.now() - timestamp;
  const diffSec = Math.round(diffMs / 1000);

  if (Math.abs(diffSec) < 10) {
    return "just now";
  }

  const absSec = Math.abs(diffSec);
  const units = [
    [31536000, "year"],
    [2592000, "month"],
    [86400, "day"],
    [3600, "hour"],
    [60, "minute"],
    [1, "second"]
  ];

  for (const [unitSeconds, unitLabel] of units) {
    if (absSec >= unitSeconds) {
      const valueCount = Math.round(absSec / unitSeconds);
      const suffix = valueCount === 1 ? unitLabel : `${unitLabel}s`;
      return diffSec >= 0 ? `${valueCount} ${suffix} ago` : `in ${valueCount} ${suffix}`;
    }
  }

  return "just now";
}

function compareIso(a, b) {
  const first = new Date(a).getTime();
  const second = new Date(b).getTime();

  if (Number.isNaN(first) && Number.isNaN(second)) {
    return 0;
  }

  if (Number.isNaN(first)) {
    return -1;
  }

  if (Number.isNaN(second)) {
    return 1;
  }

  if (first === second) {
    return 0;
  }

  return first > second ? 1 : -1;
}

function maxTimestamp(...timestamps) {
  return timestamps
    .filter(Boolean)
    .map((item) => normalizeTimestamp(item))
    .sort(compareIso)
    .pop();
}

function uniqueValues(values) {
  return Array.from(
    values.reduce((set, value) => {
      if (value) {
        set.add(value);
      }
      return set;
    }, new Set())
  );
}

function startOfWeek(date) {
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  next.setDate(next.getDate() + diff);
  return next;
}

function dateOnly(date) {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function uid(prefix) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function isoNow() {
  return new Date().toISOString();
}

function truncate(value, maxLength) {
  const text = String(value || "");
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

init();
