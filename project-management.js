const PM_STORAGE_KEY = "pm_suite_projects_v1";
const SYNC_API_URL_KEY = "client_onboarding_ops_api_url_v1";
const SYNC_WORKSPACE_KEY = "client_onboarding_ops_workspace_key_v1";
const PM_SYNC_AUTO_KEY = "pm_suite_auto_sync_v1";
const PM_SYNC_PULL_INTERVAL_MS = 15000;
const PM_SYNC_REQUEST_TIMEOUT_MS = 20000;
const PM_APP_KEY = "project-management";

const PM_STAGES = [
  { id: "backlog", label: "Backlog" },
  { id: "planning", label: "Planning" },
  { id: "in-progress", label: "In Progress" },
  { id: "review", label: "Review" },
  { id: "completed", label: "Completed" }
];

const PM_PRIORITIES = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" }
];

const PM_OWNER_OPTIONS = [
  { value: "Jesse", label: "Jesse" },
  { value: "Giles", label: "Giles" }
];

const state = {
  projects: [],
  deletedRecords: [],
  selectedProjectId: null,
  dragProjectId: null,
  filters: {
    search: "",
    owner: "all",
    priority: "all",
    blocked: "all"
  },
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
  projectForm: document.getElementById("projectForm"),
  seedProjectsBtn: document.getElementById("seedProjectsBtn"),
  clearProjectsBtn: document.getElementById("clearProjectsBtn"),
  pmTopToggleBtn: document.getElementById("pmTopToggleBtn"),
  pmTopContent: document.getElementById("pmTopContent"),
  pmSyncToggleBtn: document.getElementById("pmSyncToggleBtn"),
  pmSyncContent: document.getElementById("pmSyncContent"),
  pmFiltersToggleBtn: document.getElementById("pmFiltersToggleBtn"),
  pmFiltersContent: document.getElementById("pmFiltersContent"),
  pmBoardToggleBtn: document.getElementById("pmBoardToggleBtn"),
  pmBoardContent: document.getElementById("pmBoardContent"),
  pmDetailToggleBtn: document.getElementById("pmDetailToggleBtn"),
  pmDetailContent: document.getElementById("pmDetailContent"),
  apiUrlInput: document.getElementById("apiUrlInput"),
  workspaceKeyInput: document.getElementById("workspaceKeyInput"),
  saveSyncBtn: document.getElementById("saveSyncBtn"),
  pullSharedBtn: document.getElementById("pullSharedBtn"),
  pushSharedBtn: document.getElementById("pushSharedBtn"),
  autoSyncCheckbox: document.getElementById("autoSyncCheckbox"),
  syncStatus: document.getElementById("syncStatus"),
  searchInput: document.getElementById("searchInput"),
  ownerFilter: document.getElementById("ownerFilter"),
  priorityFilter: document.getElementById("priorityFilter"),
  blockedFilter: document.getElementById("blockedFilter"),
  projectBoard: document.getElementById("projectBoard"),
  projectDetail: document.getElementById("projectDetail"),
  metricTotalProjects: document.getElementById("metricTotalProjects"),
  metricActiveProjects: document.getElementById("metricActiveProjects"),
  metricBlockedProjects: document.getElementById("metricBlockedProjects"),
  metricCompletedProjects: document.getElementById("metricCompletedProjects"),
  metricOverdueProjects: document.getElementById("metricOverdueProjects"),
  metricOpenTasks: document.getElementById("metricOpenTasks")
};

function init() {
  const snapshot = loadSnapshot();
  state.projects = snapshot.projects;
  state.deletedRecords = snapshot.deletedRecords;

  state.sync.apiUrl = normalizeApiUrl(localStorage.getItem(SYNC_API_URL_KEY) || "");
  state.sync.workspaceKey = localStorage.getItem(SYNC_WORKSPACE_KEY) || "";
  state.sync.autoSync = localStorage.getItem(PM_SYNC_AUTO_KEY) !== "0";

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
  els.projectForm.addEventListener("submit", handleCreateProject);
  els.seedProjectsBtn.addEventListener("click", seedDemoProjects);
  els.clearProjectsBtn.addEventListener("click", clearAllProjects);

  const panelToggles = [
    ["pmTopToggleBtn", "pmTopContent"],
    ["pmSyncToggleBtn", "pmSyncContent"],
    ["pmFiltersToggleBtn", "pmFiltersContent"],
    ["pmBoardToggleBtn", "pmBoardContent"],
    ["pmDetailToggleBtn", "pmDetailContent"]
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

  const filterMap = [
    [els.searchInput, "search"],
    [els.ownerFilter, "owner"],
    [els.priorityFilter, "priority"],
    [els.blockedFilter, "blocked"]
  ];

  filterMap.forEach(([element, key]) => {
    const eventName = key === "search" ? "input" : "change";
    element.addEventListener(eventName, () => {
      state.filters[key] = element.value;
      renderBoard();
      renderDetail();
    });
  });

  els.projectBoard.addEventListener("click", handleBoardClick);
  els.projectBoard.addEventListener("dragstart", handleDragStart);
  els.projectBoard.addEventListener("dragover", handleDragOver);
  els.projectBoard.addEventListener("dragleave", handleDragLeave);
  els.projectBoard.addEventListener("drop", handleDrop);
  els.projectBoard.addEventListener("dragend", clearDropHighlights);

  els.projectDetail.addEventListener("submit", handleDetailSubmit);
  els.projectDetail.addEventListener("change", handleDetailChange);
  els.projectDetail.addEventListener("click", handleDetailClick);
}

function togglePanelSection(toggleBtn, contentEl) {
  const isExpanded = toggleBtn.getAttribute("aria-expanded") === "true";
  const nextExpanded = !isExpanded;

  toggleBtn.setAttribute("aria-expanded", String(nextExpanded));
  contentEl.classList.toggle("is-collapsed", !nextExpanded);
}

function handleCreateProject(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);

  const name = String(formData.get("name") || "").trim();
  const owner = normalizeOwner(formData.get("owner"));
  if (!name) {
    alert("Project name is required.");
    return;
  }

  const now = isoNow();
  const project = {
    id: uid("project"),
    name,
    client: String(formData.get("client") || "").trim(),
    owner,
    priority: normalizePriority(formData.get("priority")),
    dueDate: normalizeDateOnly(formData.get("dueDate")),
    stageId: normalizeStage(formData.get("stageId")),
    blocked: false,
    description: String(formData.get("description") || "").trim(),
    tasks: [],
    activity: [buildActivity("Project created", now)],
    createdAt: now,
    updatedAt: now
  };

  clearDeletionRecord(project.id);
  state.projects.unshift(project);
  state.selectedProjectId = project.id;

  event.currentTarget.reset();
  persistSnapshot();
  render();
}

function clearAllProjects() {
  if (!confirm("Delete all project data from this browser?")) {
    return;
  }

  const now = isoNow();
  state.projects.forEach((project) => {
    recordDeletion(project.id, now);
  });

  state.projects = [];
  state.selectedProjectId = null;
  persistSnapshot();
  render();
  setSyncStatus("Local projects cleared. Push to propagate deletes to shared workspace.", "neutral");
}

function seedDemoProjects() {
  if (state.projects.length && !confirm("This adds demo projects to your current workspace. Continue?")) {
    return;
  }

  const now = new Date();
  const samples = [
    {
      name: "Northline Website Revamp",
      client: "Northline Studio",
      owner: "Jesse",
      priority: "high",
      dueDate: dateOnly(new Date(now.getTime() + 11 * 86400000)),
      stageId: "in-progress",
      blocked: false,
      description: "Refresh main site pages and align messaging to Q2 offer rollout.",
      tasks: [
        { title: "Audit current pages", done: true },
        { title: "Finalize new homepage copy", done: false },
        { title: "QA mobile breakpoints", done: false }
      ]
    },
    {
      name: "Beacon SEO Retainer Setup",
      client: "Beacon Wellness",
      owner: "Giles",
      priority: "medium",
      dueDate: dateOnly(new Date(now.getTime() + 21 * 86400000)),
      stageId: "planning",
      blocked: false,
      description: "Kick off 90-day SEO plan and reporting cadence.",
      tasks: [
        { title: "Keyword baseline report", done: false },
        { title: "Create monthly dashboard", done: false }
      ]
    },
    {
      name: "Ridgepoint Funnel Launch",
      client: "Ridgepoint Legal",
      owner: "Jesse",
      priority: "critical",
      dueDate: dateOnly(new Date(now.getTime() - 2 * 86400000)),
      stageId: "review",
      blocked: true,
      description: "Waiting on compliance review before go-live.",
      tasks: [
        { title: "Internal compliance pass", done: true },
        { title: "Collect final legal sign-off", done: false }
      ]
    }
  ];

  const seeded = samples.map((sample, index) => {
    const createdAt = new Date(now.getTime() - (index + 2) * 86400000).toISOString();

    return {
      id: uid("project"),
      name: sample.name,
      client: sample.client,
      owner: sample.owner,
      priority: sample.priority,
      dueDate: sample.dueDate,
      stageId: sample.stageId,
      blocked: sample.blocked,
      description: sample.description,
      tasks: sample.tasks.map((task) => ({
        id: uid("task"),
        title: task.title,
        done: Boolean(task.done),
        assignee: normalizeOwner(task.assignee || sample.owner),
        dueDate: "",
        createdAt,
        updatedAt: createdAt
      })),
      activity: [
        buildActivity("Project created", createdAt),
        buildActivity(`Moved to ${stageLabel(sample.stageId)}`, createdAt)
      ],
      createdAt,
      updatedAt: createdAt
    };
  });

  state.projects = [...seeded, ...state.projects];
  state.selectedProjectId = seeded[0]?.id || state.selectedProjectId;
  persistSnapshot();
  render();
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
  localStorage.setItem(PM_SYNC_AUTO_KEY, state.sync.autoSync ? "1" : "0");

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

  const project = getProject(actionEl.dataset.projectId);
  if (!project) {
    return;
  }

  const action = actionEl.dataset.action;
  if (action === "open-project") {
    state.selectedProjectId = project.id;
    renderDetail();
    return;
  }

  if (action === "toggle-blocked") {
    project.blocked = !project.blocked;
    touchProject(project, project.blocked ? "Marked as blocked" : "Marked as clear");
    persistSnapshot();
    render();
  }
}

function handleDragStart(event) {
  const card = event.target.closest(".pm-card");
  if (!card) {
    return;
  }

  state.dragProjectId = card.dataset.projectId;
  card.classList.add("is-dragging");

  if (event.dataTransfer) {
    event.dataTransfer.setData("text/plain", state.dragProjectId);
    event.dataTransfer.effectAllowed = "move";
  }
}

function handleDragOver(event) {
  const dropzone = event.target.closest(".pm-dropzone");
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
  const dropzone = event.target.closest(".pm-dropzone");
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
  const dropzone = event.target.closest(".pm-dropzone");
  if (!dropzone) {
    return;
  }

  event.preventDefault();
  dropzone.classList.remove("is-over");

  const projectId = (event.dataTransfer && event.dataTransfer.getData("text/plain")) || state.dragProjectId;
  const stageId = normalizeStage(dropzone.dataset.stageId);
  const project = getProject(projectId);

  if (!project || project.stageId === stageId) {
    clearDropHighlights();
    return;
  }

  moveProject(project, stageId);
  clearDropHighlights();
}

function clearDropHighlights() {
  document.querySelectorAll(".pm-dropzone.is-over").forEach((node) => {
    node.classList.remove("is-over");
  });

  document.querySelectorAll(".pm-card.is-dragging").forEach((node) => {
    node.classList.remove("is-dragging");
  });

  state.dragProjectId = null;
}

function moveProject(project, nextStageId) {
  project.stageId = nextStageId;
  touchProject(project, `Moved to ${stageLabel(nextStageId)}`);
  persistSnapshot();
  render();
}

function handleDetailSubmit(event) {
  event.preventDefault();

  const project = getSelectedProject();
  if (!project) {
    return;
  }

  const form = event.target;
  if (form.id === "detailProjectForm") {
    const formData = new FormData(form);
    const name = String(formData.get("name") || "").trim();
    const owner = normalizeOwner(formData.get("owner"));

    if (!name) {
      alert("Project name is required.");
      return;
    }

    const previousStage = project.stageId;
    const previousBlocked = project.blocked;

    project.name = name;
    project.client = String(formData.get("client") || "").trim();
    project.owner = owner;
    project.priority = normalizePriority(formData.get("priority"));
    project.dueDate = normalizeDateOnly(formData.get("dueDate"));
    project.stageId = normalizeStage(formData.get("stageId"));
    project.blocked = Boolean(formData.get("blocked"));
    project.description = String(formData.get("description") || "").trim();

    touchProject(project, "Project details updated");

    if (project.stageId !== previousStage) {
      project.activity.unshift(buildActivity(`Moved to ${stageLabel(project.stageId)}`, project.updatedAt));
    }

    if (project.blocked !== previousBlocked) {
      project.activity.unshift(buildActivity(project.blocked ? "Marked as blocked" : "Marked as clear", project.updatedAt));
    }

    persistSnapshot();
    render();
    return;
  }

  if (form.id === "newTaskForm") {
    const formData = new FormData(form);
    const title = String(formData.get("title") || "").trim();
    if (!title) {
      return;
    }

    const assignee = normalizeOwner(formData.get("assignee"));

    const task = {
      id: uid("task"),
      title,
      done: false,
      assignee,
      dueDate: normalizeDateOnly(formData.get("dueDate")),
      createdAt: isoNow(),
      updatedAt: isoNow()
    };

    project.tasks.unshift(task);
    touchProject(project, `Task added: ${task.title} (${task.assignee})`);
    form.reset();
    persistSnapshot();
    render();
  }
}

function handleDetailChange(event) {
  const action = event.target.dataset.action;
  if (action !== "task-toggle") {
    return;
  }

  const project = getSelectedProject();
  if (!project) {
    return;
  }

  const task = project.tasks.find((item) => item.id === event.target.dataset.taskId);
  if (!task) {
    return;
  }

  task.done = Boolean(event.target.checked);
  task.updatedAt = isoNow();
  touchProject(project, `${task.done ? "Completed" : "Reopened"} task: ${task.title}`);
  persistSnapshot();
  render();
}

function handleDetailClick(event) {
  const actionEl = event.target.closest("[data-action]");
  if (!actionEl) {
    return;
  }

  const project = getSelectedProject();
  if (!project) {
    return;
  }

  const action = actionEl.dataset.action;

  if (action === "delete-project") {
    if (!confirm(`Delete project \"${project.name}\"?`)) {
      return;
    }

    recordDeletion(project.id, isoNow());
    state.projects = state.projects.filter((item) => item.id !== project.id);
    state.selectedProjectId = state.projects[0]?.id || null;
    persistSnapshot();
    render();
    return;
  }

  if (action === "task-delete") {
    const taskId = actionEl.dataset.taskId;
    const task = project.tasks.find((item) => item.id === taskId);
    project.tasks = project.tasks.filter((item) => item.id !== taskId);
    touchProject(project, `Task removed: ${task ? task.title : "Task"}`);
    persistSnapshot();
    render();
  }
}

function touchProject(project, message) {
  const now = isoNow();
  project.updatedAt = now;
  project.activity.unshift(buildActivity(message, now));
}

function buildActivity(message, createdAt) {
  return {
    id: uid("activity"),
    message,
    createdAt
  };
}

function render() {
  renderFilterOptions();
  renderMetrics();
  renderBoard();
  renderDetail();
  renderSyncStatus();
}

function renderFilterOptions() {
  const owners = uniqueValues(state.projects.map((project) => project.owner));
  hydrateFilter(els.ownerFilter, owners, state.filters.owner);
}

function hydrateFilter(selectElement, values, selectedValue) {
  const oldValue = selectedValue || "all";
  const options = ["<option value=\"all\">All</option>"];

  values.forEach((value) => {
    const isSelected = oldValue === value ? " selected" : "";
    options.push(`<option value="${escapeHtml(value)}"${isSelected}>${escapeHtml(value)}</option>`);
  });

  selectElement.innerHTML = options.join("");
  selectElement.value = values.includes(oldValue) || oldValue === "all" ? oldValue : "all";
  state.filters.owner = selectElement.value;
}

function renderMetrics() {
  const total = state.projects.length;
  const active = state.projects.filter((project) => project.stageId !== "completed").length;
  const blocked = state.projects.filter((project) => project.blocked).length;
  const completed = state.projects.filter((project) => project.stageId === "completed").length;
  const overdue = state.projects.filter((project) => isOverdue(project)).length;
  const openTasks = state.projects.reduce((sum, project) => sum + project.tasks.filter((task) => !task.done).length, 0);

  els.metricTotalProjects.textContent = String(total);
  els.metricActiveProjects.textContent = String(active);
  els.metricBlockedProjects.textContent = String(blocked);
  els.metricCompletedProjects.textContent = String(completed);
  els.metricOverdueProjects.textContent = String(overdue);
  els.metricOpenTasks.textContent = String(openTasks);
}

function renderBoard() {
  const projects = filteredProjects();

  els.projectBoard.innerHTML = PM_STAGES.map((stage) => {
    const stageProjects = projects
      .filter((project) => project.stageId === stage.id)
      .sort((a, b) => compareIso(b.updatedAt, a.updatedAt));

    return `
      <section class="pm-column">
        <div class="pm-column-head">
          <h3>${escapeHtml(stage.label)}</h3>
          <span class="pm-count-pill">${stageProjects.length}</span>
        </div>
        <div class="pm-dropzone" data-stage-id="${stage.id}">
          ${stageProjects.length ? stageProjects.map(renderProjectCard).join("") : '<p class="pm-empty-col">No projects</p>'}
        </div>
      </section>
    `;
  }).join("");
}

function renderProjectCard(project) {
  const totalTasks = project.tasks.length;
  const doneTasks = project.tasks.filter((task) => task.done).length;
  const taskProgress = totalTasks ? `${doneTasks}/${totalTasks} tasks complete` : "No tasks yet";
  const dueText = project.dueDate ? `Due ${formatDate(project.dueDate)}` : "No due date";

  return `
    <article class="pm-card" draggable="true" data-project-id="${project.id}">
      <header>
        <h4>${escapeHtml(project.name)}</h4>
        <button class="pm-open-link" type="button" data-action="open-project" data-project-id="${project.id}">Open</button>
      </header>
      <p class="pm-card-meta">${escapeHtml(project.client || "Internal project")} • ${escapeHtml(project.owner)}</p>
      <div class="pm-badge-row">
        <span class="pm-badge ${priorityClass(project.priority)}">${escapeHtml(priorityLabel(project.priority))}</span>
        ${project.blocked ? '<span class="pm-badge pm-blocked">Blocked</span>' : ""}
      </div>
      <p class="pm-card-meta">${escapeHtml(taskProgress)}</p>
      <p class="pm-card-meta">${escapeHtml(dueText)}</p>
      ${isOverdue(project) ? '<p class="pm-card-overdue">Overdue</p>' : ""}
      <div class="pm-card-actions">
        <button class="pm-ghost" type="button" data-action="toggle-blocked" data-project-id="${project.id}">
          ${project.blocked ? "Mark Clear" : "Mark Blocked"}
        </button>
      </div>
      <p class="pm-card-updated">Updated ${escapeHtml(timeAgo(project.updatedAt))}</p>
    </article>
  `;
}

function renderDetail() {
  const project = getSelectedProject();
  if (!project) {
    els.projectDetail.textContent =
      state.projects.length === 0
        ? "No projects yet. Create your first project from the form above."
        : "Select a project card to manage details, tasks, and activity.";
    return;
  }

  if (!filteredProjects().some((item) => item.id === project.id)) {
    els.projectDetail.textContent = "Selected project is hidden by current filters.";
    return;
  }

  const taskMarkup = project.tasks.length
    ? project.tasks
        .map(
          (task) => `
            <li class="pm-list-item">
              <div class="pm-task-row">
                <label class="pm-task-check">
                  <input type="checkbox" data-action="task-toggle" data-task-id="${task.id}" ${task.done ? "checked" : ""} />
                  <span>${escapeHtml(task.title)}</span>
                </label>
                <button class="pm-ghost" type="button" data-action="task-delete" data-task-id="${task.id}">Delete</button>
              </div>
              <p class="pm-task-meta">Assigned to ${escapeHtml(task.assignee || "Jesse")} • ${
                task.dueDate ? `Due ${escapeHtml(formatDate(task.dueDate))}` : "No due date"
              }</p>
            </li>
          `
        )
        .join("")
    : '<p class="pm-empty-state">No tasks yet.</p>';

  const activityMarkup = project.activity.length
    ? project.activity
        .map(
          (item) => `
            <li class="pm-list-item">
              <p>${escapeHtml(item.message)}</p>
              <small>${escapeHtml(formatDateTime(item.createdAt))}</small>
            </li>
          `
        )
        .join("")
    : '<p class="pm-empty-state">No activity yet.</p>';

  els.projectDetail.innerHTML = `
    <div class="pm-detail-wrap">
      <form id="detailProjectForm" class="pm-detail-section">
        <h3>Project Profile</h3>
        <div class="pm-detail-grid">
          <label>
            Project Name
            <input name="name" required value="${escapeHtml(project.name)}" />
          </label>
          <label>
            Client
            <input name="client" value="${escapeHtml(project.client || "")}" />
          </label>
          <label>
            Owner
            <select name="owner" required>
              ${optionMarkup(PM_OWNER_OPTIONS, project.owner)}
            </select>
          </label>
          <label>
            Priority
            <select name="priority">
              ${optionMarkup(PM_PRIORITIES, project.priority)}
            </select>
          </label>
          <label>
            Stage
            <select name="stageId">
              ${optionMarkup(PM_STAGES.map((stage) => ({ value: stage.id, label: stage.label })), project.stageId)}
            </select>
          </label>
          <label>
            Due Date
            <input name="dueDate" type="date" value="${escapeHtml(project.dueDate || "")}" />
          </label>
          <label class="pm-form-span-2">
            Notes
            <textarea name="description">${escapeHtml(project.description || "")}</textarea>
          </label>
          <label>
            <span>Blocked</span>
            <input name="blocked" type="checkbox" ${project.blocked ? "checked" : ""} />
          </label>
        </div>
        <div class="pm-form-actions">
          <button type="submit">Save Project</button>
          <button class="pm-danger" type="button" data-action="delete-project">Delete Project</button>
        </div>
      </form>

      <section class="pm-detail-section pm-task-section">
        <h3>Tasks</h3>
        <ul class="pm-list pm-task-list">${taskMarkup}</ul>
        <form id="newTaskForm" class="pm-task-form">
          <label>
            Task Title
            <input name="title" required placeholder="Prepare handoff deck" />
          </label>
          <label>
            Assignee
            <select name="assignee" required>
              ${optionMarkup(PM_OWNER_OPTIONS, project.owner)}
            </select>
          </label>
          <label>
            Due Date
            <input name="dueDate" type="date" />
          </label>
          <button type="submit">Add Task</button>
        </form>

        <div class="pm-task-timeline">
          <h4>Activity Timeline</h4>
          <ul class="pm-list">${activityMarkup}</ul>
        </div>
      </section>
    </div>
  `;
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
    const url = `${state.sync.apiUrl}/ops/workspaces/${encodeURIComponent(state.sync.workspaceKey)}/records?app=${encodeURIComponent(PM_APP_KEY)}`;
    const res = await fetchWithTimeout(url, {}, PM_SYNC_REQUEST_TIMEOUT_MS);

    if (!res.ok) {
      const body = await res.text();
      throw new Error(body || `Pull failed (${res.status})`);
    }

    const json = await res.json();
    const records = Array.isArray(json.records) ? json.records : [];
    applyRemoteRecords(records);
    persistSnapshot(false);
    render();

    state.sync.lastSyncedAt = isoNow();
    setSyncStatus(`Pulled ${records.length} shared project record(s).`, "ok");
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
      upserts: state.projects.map((project) => ({
        id: project.id,
        updatedAt: normalizeTimestamp(project.updatedAt),
        payload: project
      })),
      deletions: state.deletedRecords.map((item) => ({
        id: item.id,
        updatedAt: normalizeTimestamp(item.updatedAt)
      }))
    };

    const url = `${state.sync.apiUrl}/ops/workspaces/${encodeURIComponent(state.sync.workspaceKey)}/sync?app=${encodeURIComponent(PM_APP_KEY)}`;

    const res = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      },
      PM_SYNC_REQUEST_TIMEOUT_MS
    );

    if (!res.ok) {
      const body = await res.text();
      throw new Error(body || `Push failed (${res.status})`);
    }

    const json = await res.json();
    state.deletedRecords = [];
    persistSnapshot(false);

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
  const projectMap = new Map(state.projects.map((project) => [project.id, project]));
  const deletedMap = new Map(state.deletedRecords.map((item) => [item.id, item.updatedAt]));

  records.forEach((record) => {
    const projectId = String(record.clientId || record.client_id || record.id || "").trim();
    if (!projectId) {
      return;
    }

    const recordUpdatedAt = normalizeTimestamp(record.updatedAt || record.updated_at || record.payload?.updatedAt || isoNow());
    const localProject = projectMap.get(projectId);
    const localProjectUpdated = localProject ? normalizeTimestamp(localProject.updatedAt || localProject.createdAt) : null;
    const localDeletedUpdated = deletedMap.get(projectId) || null;
    const localLatest = newerTimestamp(localProjectUpdated, localDeletedUpdated);

    if (record.deleted) {
      if (!localLatest || compareIso(recordUpdatedAt, localLatest) >= 0) {
        projectMap.delete(projectId);
        deletedMap.set(projectId, recordUpdatedAt);
      }
      return;
    }

    const sanitized = sanitizeProject({ ...record.payload, id: projectId });
    if (!sanitized) {
      return;
    }

    sanitized.updatedAt = newerTimestamp(normalizeTimestamp(sanitized.updatedAt), recordUpdatedAt);

    if (!localLatest || compareIso(recordUpdatedAt, localLatest) >= 0) {
      projectMap.set(projectId, sanitized);
      deletedMap.delete(projectId);
    }
  });

  state.projects = Array.from(projectMap.values()).sort((a, b) => compareIso(b.updatedAt, a.updatedAt));
  state.deletedRecords = Array.from(deletedMap.entries()).map(([id, updatedAt]) => ({ id, updatedAt }));

  if (state.selectedProjectId && !projectMap.has(state.selectedProjectId)) {
    state.selectedProjectId = state.projects[0]?.id || null;
  }
}

function recordDeletion(projectId, updatedAt) {
  const id = String(projectId || "").trim();
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

function clearDeletionRecord(projectId) {
  const id = String(projectId || "").trim();
  if (!id) {
    return;
  }

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
  }, PM_SYNC_PULL_INTERVAL_MS);
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

  return "Team sync ready. Use Pull Shared Data to load latest projects.";
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
  }, PM_SYNC_REQUEST_TIMEOUT_MS + 5000);

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

async function fetchWithTimeout(url, options = {}, timeoutMs = PM_SYNC_REQUEST_TIMEOUT_MS) {
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
    return `Request timed out after ${Math.round(PM_SYNC_REQUEST_TIMEOUT_MS / 1000)}s`;
  }
  return String(error?.message || error || "Unknown error");
}

function filteredProjects() {
  return state.projects.filter((project) => {
    const search = state.filters.search.trim().toLowerCase();
    const matchesSearch =
      !search ||
      project.name.toLowerCase().includes(search) ||
      project.owner.toLowerCase().includes(search) ||
      String(project.client || "").toLowerCase().includes(search) ||
      String(project.description || "").toLowerCase().includes(search);

    const matchesOwner = state.filters.owner === "all" || project.owner === state.filters.owner;
    const matchesPriority = state.filters.priority === "all" || project.priority === state.filters.priority;

    const blockedFilter = state.filters.blocked;
    const matchesBlocked =
      blockedFilter === "all" ||
      (blockedFilter === "blocked" && project.blocked) ||
      (blockedFilter === "clear" && !project.blocked);

    return matchesSearch && matchesOwner && matchesPriority && matchesBlocked;
  });
}

function getProject(projectId) {
  return state.projects.find((project) => project.id === projectId);
}

function getSelectedProject() {
  if (!state.selectedProjectId) {
    return null;
  }
  return getProject(state.selectedProjectId);
}

function persistSnapshot(autoPush = true) {
  localStorage.setItem(
    PM_STORAGE_KEY,
    JSON.stringify({
      version: 2,
      projects: state.projects,
      deletedRecords: state.deletedRecords
    })
  );

  if (autoPush) {
    scheduleAutoPush();
  }
}

function loadSnapshot() {
  try {
    const raw = localStorage.getItem(PM_STORAGE_KEY);
    if (!raw) {
      return { projects: [], deletedRecords: [] };
    }

    const parsed = JSON.parse(raw);

    if (Array.isArray(parsed)) {
      return {
        projects: parsed.map(sanitizeProject).filter(Boolean),
        deletedRecords: []
      };
    }

    const projectsRaw = Array.isArray(parsed?.projects) ? parsed.projects : [];
    const deletedRaw = Array.isArray(parsed?.deletedRecords) ? parsed.deletedRecords : [];

    return {
      projects: projectsRaw.map(sanitizeProject).filter(Boolean),
      deletedRecords: sanitizeDeletedRecords(deletedRaw)
    };
  } catch (_error) {
    return { projects: [], deletedRecords: [] };
  }
}

function sanitizeProject(input) {
  if (!input || typeof input !== "object") {
    return null;
  }

  const name = String(input.name || "").trim();
  const owner = normalizeOwner(input.owner);
  if (!name) {
    return null;
  }

  const now = isoNow();

  return {
    id: String(input.id || uid("project")),
    name,
    client: String(input.client || "").trim(),
    owner,
    priority: normalizePriority(input.priority),
    dueDate: normalizeDateOnly(input.dueDate),
    stageId: normalizeStage(input.stageId),
    blocked: Boolean(input.blocked),
    description: String(input.description || "").trim(),
    tasks: sanitizeTasks(input.tasks),
    activity: sanitizeActivity(input.activity),
    createdAt: normalizeTimestamp(input.createdAt || now),
    updatedAt: normalizeTimestamp(input.updatedAt || now)
  };
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
      done: Boolean(task.done),
      assignee: normalizeOwner(task.assignee),
      dueDate: normalizeDateOnly(task.dueDate),
      createdAt: normalizeTimestamp(task.createdAt || isoNow()),
      updatedAt: normalizeTimestamp(task.updatedAt || isoNow())
    }))
    .filter((task) => task.title);
}

function normalizeOwner(value) {
  const owner = String(value || "").trim();
  return PM_OWNER_OPTIONS.some((option) => option.value === owner) ? owner : "Jesse";
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

function normalizePriority(value) {
  const v = String(value || "").trim().toLowerCase();
  return PM_PRIORITIES.some((item) => item.value === v) ? v : "medium";
}

function normalizeStage(value) {
  const v = String(value || "").trim();
  return PM_STAGES.some((stage) => stage.id === v) ? v : "backlog";
}

function normalizeDateOnly(value) {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return dateOnly(parsed);
}

function normalizeTimestamp(value) {
  const parsed = new Date(value || Date.now());
  if (Number.isNaN(parsed.getTime())) {
    return isoNow();
  }
  return parsed.toISOString();
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

function stageLabel(stageId) {
  return PM_STAGES.find((stage) => stage.id === stageId)?.label || stageId;
}

function priorityLabel(priority) {
  return PM_PRIORITIES.find((item) => item.value === priority)?.label || priority;
}

function priorityClass(priority) {
  return `pm-priority-${priority}`;
}

function optionMarkup(options, selectedValue) {
  return options
    .map(
      (option) =>
        `<option value="${escapeHtml(option.value)}"${option.value === selectedValue ? " selected" : ""}>${escapeHtml(option.label)}</option>`
    )
    .join("");
}

function isOverdue(project) {
  return Boolean(project.dueDate && project.stageId !== "completed" && project.dueDate < todayIsoDate());
}

function uniqueValues(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
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

function todayIsoDate() {
  return dateOnly(new Date());
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

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value || "");
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value || "");
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function timeAgo(value) {
  const date = new Date(value);
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

  return formatDate(value);
}

function escapeHtml(input) {
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function isoNow() {
  return new Date().toISOString();
}

function uid(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

init();
