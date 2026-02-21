const STORAGE_KEY = "finance_os_transactions_v1";
const API_URL_KEY = "finance_os_api_url_v1";

const CATEGORY_RULES = [
  { keyword: "uber", category: "Transport" },
  { keyword: "lyft", category: "Transport" },
  { keyword: "amazon", category: "Supplies" },
  { keyword: "adobe", category: "Software" },
  { keyword: "google", category: "Software" },
  { keyword: "rent", category: "Rent" },
  { keyword: "stripe", category: "Bank Fees" },
  { keyword: "restaurant", category: "Meals" },
  { keyword: "doordash", category: "Meals" }
];

const DEFAULT_SPLITS = {
  Meals: 50,
  Transport: 50,
  Supplies: 50,
  Software: 50,
  Rent: 50,
  "Bank Fees": 50,
  Uncategorized: 50
};

const state = {
  transactions: [],
  recurring: []
};

const els = {
  fileInput: document.getElementById("fileInput"),
  importBtn: document.getElementById("importBtn"),
  clearBtn: document.getElementById("clearBtn"),
  downloadTemplateBtn: document.getElementById("downloadTemplateBtn"),
  apiUrlInput: document.getElementById("apiUrlInput"),
  syncBtn: document.getElementById("syncBtn"),
  pullBtn: document.getElementById("pullBtn"),
  searchInput: document.getElementById("searchInput"),
  reviewFilter: document.getElementById("reviewFilter"),
  dateFromInput: document.getElementById("dateFromInput"),
  dateToInput: document.getElementById("dateToInput"),
  tableBody: document.querySelector("#transactionsTable tbody"),
  recurringList: document.getElementById("recurringList"),
  metricTotal: document.getElementById("metricTotal"),
  metricCount: document.getElementById("metricCount"),
  metricNeedsReview: document.getElementById("metricNeedsReview"),
  metricRecurring: document.getElementById("metricRecurring")
};

function init() {
  state.transactions = loadTransactions();
  els.apiUrlInput.value = localStorage.getItem(API_URL_KEY) || "";
  refreshDerivedData();
  bindEvents();
  render();
}

function bindEvents() {
  els.importBtn.addEventListener("click", handleImportClick);
  els.clearBtn.addEventListener("click", handleClear);
  els.downloadTemplateBtn.addEventListener("click", downloadTemplate);
  els.syncBtn.addEventListener("click", syncToApi);
  els.pullBtn.addEventListener("click", pullFromApi);
  els.apiUrlInput.addEventListener("change", persistApiUrl);
  els.searchInput.addEventListener("input", render);
  els.reviewFilter.addEventListener("change", render);
  els.dateFromInput.addEventListener("change", render);
  els.dateToInput.addEventListener("change", render);
}

function handleImportClick() {
  const file = els.fileInput.files[0];
  if (!file) {
    alert("Pick a CSV file first.");
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const text = String(e.target.result || "");
    const imported = parseCSV(text).map(normalizeTransaction).filter(Boolean);

    if (!imported.length) {
      alert("No valid rows found.");
      return;
    }

    upsertTransactions(imported);
    refreshDerivedData();
    persist();
    render();
  };
  reader.readAsText(file);
}

function handleClear() {
  if (!confirm("Delete all imported data from this browser?")) {
    return;
  }
  state.transactions = [];
  state.recurring = [];
  persist();
  render();
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) {
    return [];
  }

  const headers = splitCSVLine(lines[0]).map((h) => h.trim().toLowerCase());

  return lines.slice(1).map((line) => {
    const values = splitCSVLine(line);
    const row = {};
    headers.forEach((header, i) => {
      row[header] = values[i]?.trim() ?? "";
    });
    return row;
  });
}

function splitCSVLine(line) {
  const out = [];
  let cur = "";
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += char;
  }
  out.push(cur);
  return out;
}

function normalizeTransaction(row) {
  const dateValue = row.date || row.posted || row.transaction_date;
  const description = row.description || row.memo || row.vendor || "";
  const amountValue = row.amount || row.debit || row.value;

  if (!dateValue || !description || !amountValue) {
    return null;
  }

  const amount = Math.abs(Number(String(amountValue).replace(/[^0-9.-]/g, "")));
  if (Number.isNaN(amount)) {
    return null;
  }

  const descriptionLower = description.toLowerCase();
  const matchedRule = CATEGORY_RULES.find((r) => descriptionLower.includes(r.keyword));
  const category = row.category || matchedRule?.category || "Uncategorized";
  const confidence = row.category ? 0.95 : matchedRule ? 0.9 : 0.45;
  const splitPct = Number(row.partner_split_pct) || DEFAULT_SPLITS[category] || 50;

  return {
    id: buildTransactionId(dateValue, description, amount),
    date: formatDate(dateValue),
    description: description.trim(),
    amount,
    category,
    partnerSplitPct: clamp(splitPct, 0, 100),
    status: confidence >= 0.8 ? "clean" : "needs-review"
  };
}

function buildTransactionId(date, description, amount) {
  return `${formatDate(date)}|${description.toLowerCase().trim()}|${amount.toFixed(2)}`;
}

function formatDate(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, "0");
  const d = String(parsed.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function upsertTransactions(items) {
  const map = new Map(state.transactions.map((t) => [t.id, t]));
  items.forEach((item) => {
    map.set(item.id, item);
  });
  state.transactions = Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
}

function refreshDerivedData() {
  state.recurring = detectRecurring(state.transactions);
}

function detectRecurring(transactions) {
  const byMerchant = new Map();

  transactions.forEach((t) => {
    const merchant = canonicalMerchant(t.description);
    if (!byMerchant.has(merchant)) {
      byMerchant.set(merchant, []);
    }
    byMerchant.get(merchant).push(t);
  });

  const recurring = [];
  byMerchant.forEach((items, merchant) => {
    if (items.length < 2) {
      return;
    }

    const sorted = items.slice().sort((a, b) => a.date.localeCompare(b.date));
    const avgAmount = sorted.reduce((sum, t) => sum + t.amount, 0) / sorted.length;
    const allNearAmount = sorted.every((t) => Math.abs(t.amount - avgAmount) / avgAmount < 0.2);

    if (!allNearAmount) {
      return;
    }

    const dayGaps = [];
    for (let i = 1; i < sorted.length; i++) {
      dayGaps.push(daysBetween(sorted[i - 1].date, sorted[i].date));
    }

    const avgGap = dayGaps.reduce((sum, d) => sum + d, 0) / dayGaps.length;
    if (avgGap >= 24 && avgGap <= 38) {
      recurring.push({ merchant, avgAmount, occurrences: sorted.length, avgGap });
    }
  });

  return recurring.sort((a, b) => b.occurrences - a.occurrences);
}

function canonicalMerchant(description) {
  return description
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 3)
    .join(" ");
}

function daysBetween(dateA, dateB) {
  const a = new Date(dateA);
  const b = new Date(dateB);
  const diff = Math.abs(b - a);
  return diff / (1000 * 60 * 60 * 24);
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.transactions));
}

function persistApiUrl() {
  localStorage.setItem(API_URL_KEY, els.apiUrlInput.value.trim());
}

function loadTransactions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed;
  } catch (_e) {
    return [];
  }
}

function render() {
  renderMetrics();
  renderTransactions();
  renderRecurring();
}

function renderMetrics() {
  const total = state.transactions.reduce((sum, t) => sum + t.amount, 0);
  const needsReview = state.transactions.filter((t) => t.status === "needs-review").length;

  els.metricTotal.textContent = formatCurrency(total);
  els.metricCount.textContent = String(state.transactions.length);
  els.metricNeedsReview.textContent = String(needsReview);
  els.metricRecurring.textContent = String(state.recurring.length);
}

function renderTransactions() {
  const filterText = els.searchInput.value.trim().toLowerCase();
  const reviewFilter = els.reviewFilter.value;
  const dateFrom = els.dateFromInput.value;
  const dateTo = els.dateToInput.value;

  const filtered = state.transactions.filter((t) => {
    const matchesText =
      !filterText ||
      t.description.toLowerCase().includes(filterText) ||
      t.category.toLowerCase().includes(filterText);

    const matchesReview =
      reviewFilter === "all" ||
      (reviewFilter === "needs-review" && t.status === "needs-review") ||
      (reviewFilter === "clean" && t.status === "clean");

    const matchesDateFrom = !dateFrom || t.date >= dateFrom;
    const matchesDateTo = !dateTo || t.date <= dateTo;

    return matchesText && matchesReview && matchesDateFrom && matchesDateTo;
  });

  els.tableBody.innerHTML = "";

  filtered.forEach((t) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${t.date}</td>
      <td class="description-cell">${escapeHtml(t.description)}</td>
      <td>${formatCurrency(t.amount)}</td>
      <td>
        <input value="${escapeHtml(t.category)}" data-id="${t.id}" data-field="category" />
      </td>
      <td>
        <input type="number" min="0" max="100" value="${t.partnerSplitPct}" data-id="${t.id}" data-field="partnerSplitPct" />
      </td>
      <td><span class="status ${t.status}">${t.status === "clean" ? "Clean" : "Needs Review"}</span></td>
    `;

    tr.querySelectorAll("input").forEach((input) => {
      input.addEventListener("change", onCellChange);
    });

    els.tableBody.appendChild(tr);
  });
}

function renderRecurring() {
  els.recurringList.innerHTML = "";

  if (!state.recurring.length) {
    const li = document.createElement("li");
    li.textContent = "No recurring candidates yet.";
    els.recurringList.appendChild(li);
    return;
  }

  state.recurring.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = `${item.merchant} - ${formatCurrency(item.avgAmount)} (${item.occurrences} hits, ~${Math.round(item.avgGap)} day cadence)`;
    els.recurringList.appendChild(li);
  });
}

function onCellChange(event) {
  const id = event.target.dataset.id;
  const field = event.target.dataset.field;
  const tx = state.transactions.find((t) => t.id === id);
  if (!tx) {
    return;
  }

  if (field === "partnerSplitPct") {
    tx.partnerSplitPct = clamp(Number(event.target.value), 0, 100);
  }

  if (field === "category") {
    tx.category = event.target.value.trim() || "Uncategorized";
  }

  tx.status = tx.category === "Uncategorized" ? "needs-review" : "clean";

  refreshDerivedData();
  persist();
  render();
}

function downloadTemplate() {
  const csv = [
    "date,description,amount,account,category,partner_split_pct",
    "2026-02-01,Adobe Creative Cloud,59.99,Business Checking,Software,50",
    "2026-02-03,Uber Trip,22.15,Business Card,Transport,50"
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "finance_os_template.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function formatCurrency(num) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(num || 0);
}

function escapeHtml(input) {
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function clamp(value, min, max) {
  if (Number.isNaN(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

function getApiBaseUrl() {
  return (els.apiUrlInput.value || "").trim().replace(/\/+$/, "");
}

async function syncToApi() {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) {
    alert("Enter API URL first.");
    return;
  }

  try {
    const payload = {
      items: state.transactions.map((t) => ({
        tx_date: t.date,
        description: t.description,
        amount_cents: Math.round(t.amount * 100),
        category: t.category,
        partner_split_pct: t.partnerSplitPct,
        source: "ui-import"
      }))
    };

    const res = await fetch(`${baseUrl}/transactions/bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(err || `Sync failed (${res.status})`);
    }

    const json = await res.json();
    persistApiUrl();
    alert(`Synced ${json.inserted || 0} transaction(s) to API.`);
  } catch (error) {
    alert(`Sync failed: ${String(error.message || error)}`);
  }
}

async function pullFromApi() {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) {
    alert("Enter API URL first.");
    return;
  }

  try {
    const res = await fetch(`${baseUrl}/transactions`);
    if (!res.ok) {
      const err = await res.text();
      throw new Error(err || `Pull failed (${res.status})`);
    }

    const rows = await res.json();
    const imported = rows.map((row) => ({
      id: buildTransactionId(row.tx_date, row.description, Math.abs(Number(row.amount_cents) / 100)),
      date: formatDate(row.tx_date),
      description: String(row.description || ""),
      amount: Math.abs(Number(row.amount_cents) / 100),
      category: String(row.category || "Uncategorized"),
      partnerSplitPct: clamp(Number(row.partner_split_pct || 50), 0, 100),
      status: row.category && row.category !== "Uncategorized" ? "clean" : "needs-review"
    }));

    upsertTransactions(imported);
    refreshDerivedData();
    persistApiUrl();
    persist();
    render();
    alert(`Pulled ${imported.length} transaction(s) from API.`);
  } catch (error) {
    alert(`Pull failed: ${String(error.message || error)}`);
  }
}

init();
