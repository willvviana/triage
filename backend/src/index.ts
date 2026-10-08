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

// GET /api/tickets?status=open&priority=high&page=1&limit=20
//
// Filters and pagination. This is the query pattern every list view in
// the app will use, so it's worth understanding, not copying.
//
// Two problems solved here:
//
// 1. DYNAMIC WHERE CLAUSES WITHOUT SQL INJECTION.
//    You cannot do `WHERE status = '${status}'` — that's injection.
//    You build the clause as "$1", "$2", ... and pass values separately.
//    The array `params` must stay in sync with the placeholder numbers.
//    That sync is the whole job.
//
// 2. PAGINATION WITH A TOTAL COUNT.
//    LIMIT/OFFSET gives you the page. But a UI also needs to know
//    "how many total?" to render "Page 1 of 4". So we run two queries:
//    one for the page, one for COUNT(*). Both must use the SAME WHERE
//    clause, or the count and the list disagree.
//
// We also validate inputs. `limit` is capped at 100 — a client asking
// for limit=1000000 is either a bug or an attack, and either way you
// don't want to run it.
app.get('/api/tickets', async (req, res) => {
  try {
    // ---- Parse and validate query params ----
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const priority = typeof req.query.priority === 'string' ? req.query.priority : undefined;

    const page = Math.max(1, Number(req.query.page) || 1);
    const limitRaw = Number(req.query.limit) || 20;
    const limit = Math.min(100, Math.max(1, limitRaw)); // clamp to [1, 100]
    const offset = (page - 1) * limit;

    // Whitelist validation. A filter value not in this list is rejected,
    // not passed to Postgres. Defense in depth: even with parameterized
    // queries, rejecting junk early gives clearer errors and prevents
    // weird empty-result debugging sessions.
    const VALID_STATUSES = ['open', 'pending', 'waiting', 'escalated', 'resolved'];
    const VALID_PRIORITIES = ['low', 'medium', 'high', 'critical'];

    if (status && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `invalid status: ${status}` });
    }
    if (priority && !VALID_PRIORITIES.includes(priority)) {
      return res.status(400).json({ error: `invalid priority: ${priority}` });
    }

    // ---- Build the WHERE clause dynamically ----
    // `conditions` holds SQL fragments. `params` holds the values.
    // For each filter added, we push a $N placeholder AND the value.
    // The index of the placeholder is params.length + 1, so they stay aligned.
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (status) {
      params.push(status);
      conditions.push(`t.status = $${params.length}`);
    }
    if (priority) {
      params.push(priority);
      conditions.push(`t.priority = $${params.length}`);
    }

    // If no filters were applied, the WHERE clause is empty. If some
    // were, we join them with AND. Note: we do NOT prepend "WHERE " here —
    // we do it in the final query template so an empty conditions array
    // doesn't produce a dangling "WHERE".
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // ---- Query 1: the page of data ----
    // Note LIMIT/OFFSET use their own placeholders, continuing the count.
    const dataParams = [...params, limit, offset];
    const limitPlaceholder = `$${dataParams.length - 1}`;
    const offsetPlaceholder = `$${dataParams.length}`;

    const dataResult = await pool.query(
      `
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
        ${whereClause}
        ORDER BY t.created_at DESC, t.external_id ASC
        LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}
      `,
      dataParams,
    );

    // ---- Query 2: total count for pagination ----
    // Same WHERE, same params array — but WITHOUT limit/offset.
    // This is the query the UI needs to render "Page 1 of 4".
    const countResult = await pool.query<{ total: string }>(
      `
        SELECT COUNT(*) AS total
        FROM tickets t
        ${whereClause}
      `,
      params,
    );

    const total = Number(countResult.rows[0]?.total ?? 0);

    res.json({
      tickets: dataResult.rows,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error('[GET /api/tickets] failed', err);
    res.status(500).json({ error: 'internal error' });
  }
});

// GET /api/tickets/:id
//
// The ticket detail endpoint — everything the detail panel needs in one
// response: the ticket, its customer, its assigned agent, its logs, and
// its notes.
//
// ONE query, using json_agg. Three things this buys us:
//
//   1. One round trip. The alternative (3-4 separate awaits) is N+1 by
//      hand and scales badly once you're rendering 20 detail panels.
//
//   2. The nested data comes back as JSON arrays already — no combining
//      rows in JS, no GROUP BY blowup in Node.
//
//   3. Subqueries with json_agg avoid the classic JOIN trap where you
//      join logs AND notes to tickets and get a cartesian product
//      (logs × notes rows per ticket). Subqueries sidestep that entirely.
//
// The COALESCE(..., '[]'::json) is important: json_agg returns NULL when
// there are no rows, not an empty array. A ticket with no logs should
// serialize as [] not null, so the frontend can safely .map() over it.
app.get('/api/tickets/:id', async (req, res) => {
  try {
    const ticketId = req.params.id;

    // Validate the UUID format before hitting Postgres. Otherwise a bad
    // id gets passed to the query and Postgres throws "invalid input
    // syntax for type uuid" — a 500 error where it should be a 400.
    // This regex matches v1-v5 UUIDs. Close enough for validation.
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(ticketId)) {
      return res.status(400).json({ error: 'invalid ticket id format' });
    }

    const result = await pool.query(
      `
        SELECT
          t.id,
          t.external_id,
          t.subject,
          t.body,
          t.category,
          t.status,
          t.priority,
          t.created_at,
          t.updated_at,
          t.sla_deadline,
          t.escalated_at,

          -- Customer: joined flat because it's 1:1 with the ticket.
          c.id     AS customer_id,
          c.name   AS customer_name,
          c.plan   AS customer_plan,
          c.region AS customer_region,

          -- Agent: nullable, so we return null when unassigned.
          u.id           AS assigned_to_id,
          u.display_name AS assigned_to_name,

          -- Logs: aggregated into a JSON array. Subquery, not JOIN,
          -- to avoid cartesian product with notes below.
          COALESCE(
            (
              SELECT json_agg(
                json_build_object(
                  'id',          l.id,
                  'occurred_at', l.occurred_at,
                  'level',       l.level,
                  'endpoint',    l.endpoint,
                  'status_code', l.status_code,
                  'message',     l.message
                )
                ORDER BY l.occurred_at DESC
              )
              FROM ticket_logs l
              WHERE l.ticket_id = t.id
            ),
            '[]'::json
          ) AS logs,

          -- Notes: same pattern. Separate subquery.
          COALESCE(
            (
              SELECT json_agg(
                json_build_object(
                  'id',          n.id,
                  'author_id',   n.author_id,
                  'author_name', u2.display_name,
                  'body',        n.body,
                  'created_at',  n.created_at
                )
                ORDER BY n.created_at ASC
              )
              FROM ticket_notes n
              LEFT JOIN users u2 ON u2.id = n.author_id
              WHERE n.ticket_id = t.id
            ),
            '[]'::json
          ) AS notes

        FROM tickets t
        JOIN customers c ON c.id = t.customer_id
        LEFT JOIN users u ON u.id = t.assigned_to
        WHERE t.id = $1
      `,
      [ticketId],
    );

    const ticket = result.rows[0];
    if (!ticket) {
      return res.status(404).json({ error: 'ticket not found' });
    }

    res.json({ ticket });
  } catch (err) {
    console.error('[GET /api/tickets/:id] failed', err);
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