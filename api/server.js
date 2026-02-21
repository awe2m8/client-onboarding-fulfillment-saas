import "dotenv/config";
import cors from "cors";
import express from "express";
import pg from "pg";

const app = express();
const PORT = Number(process.env.PORT || 3001);
const DATABASE_URL = process.env.DATABASE_URL;
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";

app.use(cors({ origin: CORS_ORIGIN === "*" ? true : CORS_ORIGIN.split(",") }));
app.use(express.json({ limit: "2mb" }));

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

app.listen(PORT, () => {
  // Intentional minimal log for Render startup visibility.
  console.log(`finance-api listening on ${PORT}`);
});
