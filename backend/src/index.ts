// src/index.ts
// HTTP entrypoint for Triage.
//
// Responsibilities, in order:
//   1. Load .env before anything reads process.env
//   2. Create the Express app
//   3. Register middleware (json body parser, CORS)
//   4. Register routes
//   5. Start listening
//
// What's deliberately NOT here yet:
//   - Auth middleware (Step 6)
//   - Error-handling middleware (Step 5, once we have routes that can fail)
//   - Request logging (not needed while running locally)
//   - Rate limiting, helmet, etc. (production concerns, not v0.1)

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { pool } from './db/client.js';

const app = express();

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

// Parse JSON request bodies. Without this, req.body is undefined for POSTs.
app.use(express.json());

// CORS. The React app will run on a different port (Vite default 5173),
// and the browser will block requests to localhost:3001 unless the server
// says "yes, I allow that origin."
//
// For dev, we allow the Vite origin explicitly rather than "*".
// Why not "*": it's a habit worth breaking early. Wildcard CORS works in
// dev and becomes a security bug in prod. Being explicit now means the
// config you ship to production is the config you tested.
app.use(
  cors({
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  }),
);

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// Health check. Every service needs one. Used by uptime monitors, load
// balancers, and by you at 2am wondering "is the server even up?"
app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

// Deep health check: verifies the DB connection too. Separate from /health
// so a DB outage doesn't mark the process as dead — the process is fine,
// its dependency isn't. Different consumers care about different things.
app.get('/health/db', async (_req, res) => {
  try {
    const result = await pool.query<{ now: string }>('SELECT now() AS now');
    res.json({ ok: true, db_time: result.rows[0]?.now });
  } catch (err) {
    console.error('[health/db] failed', err);
    res.status(503).json({ ok: false, error: 'database unavailable' });
  }
});

// GET /api/tickets
// List view. Joins customer name so the frontend doesn't need a second call.
// No filters, no pagination yet — those come in Step 5.
//
// Why join here and not in the frontend:
//   - One round trip vs N+1 (fetch tickets, then fetch each customer).
//   - The DB is good at joins. The frontend isn't.
app.get('/api/tickets', async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        t.id,
        t.external_id,
        t.subject,
        t.category,
        t.status,
        t.priority,
        t.sla_deadline,
        t.created_at,
        t.updated_at,
        c.name AS customer_name,
        c.plan AS customer_plan,
        u.display_name AS assigned_to_name
      FROM tickets t
      JOIN customers c ON c.id = t.customer_id
      LEFT JOIN users u ON u.id = t.assigned_to
      ORDER BY t.created_at DESC
      LIMIT 100
    `);
    res.json({ tickets: result.rows });
  } catch (err) {
    console.error('[GET /api/tickets] failed', err);
    res.status(500).json({ error: 'internal error' });
  }
});

// GET /api/analysis/top-customers
// The endpoint that makes Triage Triage. Same SQL as scripts/analyze.ts —
// moved here so the frontend can render it. The script remains for
// command-line debugging.
app.get('/api/analysis/top-customers', async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        c.id            AS customer_id,
        c.name          AS customer_name,
        c.plan          AS plan,
        COUNT(tl.id)    AS error_count
      FROM customers c
      LEFT JOIN tickets t
        ON t.customer_id = c.id
      LEFT JOIN ticket_logs tl
        ON tl.ticket_id = t.id
       AND tl.level = 'error'
       AND tl.occurred_at >= NOW() - INTERVAL '7 days'
      GROUP BY c.id, c.name, c.plan
      ORDER BY error_count DESC, c.name ASC
    `);
    res.json({ customers: result.rows });
  } catch (err) {
    console.error('[GET /api/analysis/top-customers] failed', err);
    res.status(500).json({ error: 'internal error' });
  }
});

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const PORT = Number(process.env.PORT ?? 3001);

// Bind to 127.0.0.1, not 0.0.0.0. On a dev machine, there's no reason to
// expose the server to your LAN. 0.0.0.0 is correct for production/container
// environments, wrong for local development.
app.listen(PORT, '127.0.0.1', () => {
  console.log(`[server] listening on http://127.0.0.1:${PORT}`);
});