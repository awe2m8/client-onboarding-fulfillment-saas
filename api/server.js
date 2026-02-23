import "dotenv/config";
import cors from "cors";
import express from "express";
import pg from "pg";

const app = express();
const PORT = Number(process.env.PORT || 3001);
const DATABASE_URL = process.env.DATABASE_URL;
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";

const corsPolicy = buildCorsPolicy(CORS_ORIGIN);
app.use(
  cors({
    origin(origin, callback) {
      if (corsPolicy.allowAll || !origin) {
        callback(null, true);
        return;
      }

      const normalizedOrigin = normalizeOrigin(origin);
      if (normalizedOrigin && corsPolicy.allowed.has(normalizedOrigin)) {
        callback(null, true);
        return;
      }

      callback(new Error("CORS origin not allowed"));
    }
  })
);
app.use(express.json({ limit: "8mb" }));

const pool = DATABASE_URL
  ? new pg.Pool({
      connectionString: DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    })
  : null;

app.get("/health", async (_req, res) => {
  if (!pool) {
    return res.status(200).json({ ok: true, db: false, message: "No DATABASE_URL configured" });
  }

  try {
    await pool.query("select 1");
    return res.status(200).json({ ok: true, db: true });
  } catch (error) {
    return res.status(500).json({ ok: false, db: false, error: String(error.message || error) });
  }
});

app.get("/transactions", async (_req, res) => {
  if (!pool) {
    return res.status(500).json({ error: "DATABASE_URL is required" });
  }

  try {
    const { rows } = await pool.query(
      `select id, tx_date, description, amount_cents, category, partner_split_pct, source, created_at
       from transactions
       order by tx_date desc, created_at desc
       limit 1000`
    );
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ error: String(error.message || error) });
  }
});

app.post("/transactions/bulk", async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: "DATABASE_URL is required" });
  }

  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!items.length) {
    return res.status(400).json({ error: "items[] is required" });
  }

  const client = await pool.connect();
  let inserted = 0;

  try {
    await client.query("begin");

    for (const item of items) {
      const txDate = item.tx_date || item.date;
      const description = String(item.description || "").trim();
      const amount = Number(item.amount_cents ?? Math.round(Number(item.amount || 0) * 100));
      const category = String(item.category || "Uncategorized");
      const partnerSplitPct = Number(item.partner_split_pct ?? 50);
      const source = String(item.source || "manual");

      if (!txDate || !description || Number.isNaN(amount)) {
        continue;
      }

      await client.query(
        `insert into transactions (tx_date, description, amount_cents, category, partner_split_pct, source)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (tx_date, description, amount_cents) do update
           set category = excluded.category,
               partner_split_pct = excluded.partner_split_pct,
               source = excluded.source`,
        [txDate, description, amount, category, partnerSplitPct, source]
      );

      inserted += 1;
    }

    await client.query("commit");
    return res.status(201).json({ inserted });
  } catch (error) {
    await client.query("rollback");
    return res.status(500).json({ error: String(error.message || error) });
  } finally {
    client.release();
  }
});

app.get("/ops/workspaces/:workspaceKey/records", async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: "DATABASE_URL is required" });
  }

  const workspaceKey = normalizeWorkspaceKey(req.params.workspaceKey);
  const appKey = normalizeAppKey(req.query.app || "onboarding");
  if (!workspaceKey) {
    return res.status(400).json({ error: "workspaceKey must be 2-64 chars: letters, numbers, dash, underscore" });
  }
  if (!appKey) {
    return res.status(400).json({ error: "app must be 2-64 chars: letters, numbers, dash, underscore" });
  }

  try {
    const { rows } = await pool.query(
      `select client_id, payload, deleted, updated_at
       from ops_client_records
       where workspace_key = $1
         and app_key = $2
       order by updated_at desc
       limit 10000`,
      [workspaceKey, appKey]
    );

    return res.json({
      workspaceKey,
      appKey,
      records: rows.map((row) => ({
        clientId: row.client_id,
        payload: row.payload,
        deleted: Boolean(row.deleted),
        updatedAt: row.updated_at
      }))
    });
  } catch (error) {
    return res.status(500).json({ error: String(error.message || error) });
  }
});

app.post("/ops/workspaces/:workspaceKey/sync", async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: "DATABASE_URL is required" });
  }

  const workspaceKey = normalizeWorkspaceKey(req.params.workspaceKey);
  const appKey = normalizeAppKey(req.query.app || req.body?.app || "onboarding");
  if (!workspaceKey) {
    return res.status(400).json({ error: "workspaceKey must be 2-64 chars: letters, numbers, dash, underscore" });
  }
  if (!appKey) {
    return res.status(400).json({ error: "app must be 2-64 chars: letters, numbers, dash, underscore" });
  }

  const upserts = Array.isArray(req.body?.upserts) ? req.body.upserts : [];
  const deletions = Array.isArray(req.body?.deletions) ? req.body.deletions : [];

  if (!upserts.length && !deletions.length) {
    return res.status(400).json({ error: "Provide upserts[] or deletions[]" });
  }

  if (upserts.length > 10000 || deletions.length > 10000) {
    return res.status(400).json({ error: "Too many records in one request" });
  }

  const client = await pool.connect();
  let appliedUpserts = 0;
  let appliedDeletions = 0;

  try {
    await client.query("begin");

    for (const item of upserts) {
      const clientId = String(item?.id || "").trim();
      const payload = item?.payload;
      const updatedAt = parseIncomingTimestamp(item?.updatedAt);

      if (!clientId || !payload || typeof payload !== "object") {
        continue;
      }

      const result = await client.query(
        `insert into ops_client_records (workspace_key, app_key, client_id, payload, deleted, updated_at)
         values ($1, $2, $3, $4::jsonb, false, $5)
         on conflict (workspace_key, app_key, client_id) do update
           set payload = excluded.payload,
               deleted = false,
               updated_at = excluded.updated_at
         where ops_client_records.updated_at <= excluded.updated_at`,
        [workspaceKey, appKey, clientId, JSON.stringify(payload), updatedAt]
      );

      appliedUpserts += result.rowCount;
    }

    for (const item of deletions) {
      const clientId = String(item?.id || "").trim();
      const updatedAt = parseIncomingTimestamp(item?.updatedAt);

      if (!clientId) {
        continue;
      }

      const result = await client.query(
        `insert into ops_client_records (workspace_key, app_key, client_id, payload, deleted, updated_at)
         values ($1, $2, $3, '{}'::jsonb, true, $4)
         on conflict (workspace_key, app_key, client_id) do update
           set payload = '{}'::jsonb,
               deleted = true,
               updated_at = excluded.updated_at
         where ops_client_records.updated_at <= excluded.updated_at`,
        [workspaceKey, appKey, clientId, updatedAt]
      );

      appliedDeletions += result.rowCount;
    }

    await client.query("commit");
    return res.status(200).json({
      workspaceKey,
      appKey,
      appliedUpserts,
      appliedDeletions,
      serverTime: new Date().toISOString()
    });
  } catch (error) {
    await client.query("rollback");
    return res.status(500).json({ error: String(error.message || error) });
  } finally {
    client.release();
  }
});

function normalizeWorkspaceKey(value) {
  return normalizeSlug(value);
}

function normalizeAppKey(value) {
  return normalizeSlug(value);
}

function normalizeSlug(value) {
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

function parseIncomingTimestamp(value) {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString();
  }
  return date.toISOString();
}

app.use((error, _req, res, next) => {
  if (error && /cors/i.test(String(error.message || ""))) {
    return res.status(403).json({
      error: "CORS blocked this origin. Add your frontend URL to CORS_ORIGIN (comma-separated, no spaces needed)."
    });
  }

  return next(error);
});

function buildCorsPolicy(rawValue) {
  const entries = String(rawValue || "")
    .split(",")
    .map((item) => normalizeOrigin(item))
    .filter(Boolean);

  if (!entries.length || entries.includes("*")) {
    return {
      allowAll: true,
      allowed: new Set()
    };
  }

  return {
    allowAll: false,
    allowed: new Set(entries)
  };
}

function normalizeOrigin(value) {
  const cleaned = String(value || "").trim();
  if (!cleaned) {
    return "";
  }
  if (cleaned === "*") {
    return "*";
  }
  return cleaned.replace(/\/+$/, "");
}

app.listen(PORT, () => {
  console.log(`ops-api listening on ${PORT}`);
});
