# Triage

A support ticket triage dashboard. It answers one question: **what should a support agent work on next, and why?**

Built as a portfolio project to demonstrate full-stack engineering — TypeScript end to end, Postgres, Express, React.

<!--
  TODO: Replace this block with a real screenshot once the tickets page
  is rendered. A README without an image is a README half-read.
  ![Tickets dashboard](./docs/screenshot-tickets.png)
-->

---

## What it does

- **Ticket queue** with priority, status, category, SLA deadline, and assignee
- **SLA awareness** — tickets approaching or past their SLA are visually flagged
- **Filters** on status and priority, with pagination
- **Ticket detail** showing the full body, integration logs, and internal notes
- **Analysis view** ranking customers by error volume over the last 7 days

## What it does *not* do (yet)

Honest list of gaps, kept here on purpose. v0.1 focuses on the workflow, not auth or polish.

- **No authentication.** Every endpoint is open. Auth is planned for v0.2.
- **No real integrations.** Tickets and logs are seeded from fake data. There is no Zendesk or Jira connector.
- **No write operations.** The API is read-only. Replying, assigning, escalating are not implemented.
- **No tests.** Planned.
- **Single theme.** Dark mode only.

---

## Stack

| Layer      | Choice                                       |
|------------|----------------------------------------------|
| Database   | PostgreSQL 16 (Docker for local dev)         |
| Backend    | Node.js + TypeScript + Express + `pg`        |
| Frontend   | React + TypeScript + Vite + React Router     |
| Styling    | Plain CSS with design tokens                 |
| Dev tooling| `tsx` for TypeScript execution, ESLint       |

No ORM. Raw SQL in migration files and query strings. This is a deliberate choice for a project this size — it keeps the SQL visible and reviewable.

---

## Getting started

**Requirements:** Docker Desktop, Node.js 20+.

### 1. Clone and install

```bash
git clone https://github.com/willvviana/triage.git
cd triage

# Backend
cd backend
npm install
cp .env.example .env

# Frontend
cd ../frontend
npm install
```

### 2. Start Postgres

From the repo root:

```bash
docker compose up -d
```

### 3. Run the schema migration

```bash
cd backend
docker compose exec -T db psql -U triage -d triage < backend/src/db/migrations/001_init.sql
```

*(On Windows PowerShell, use: `Get-Content backend\src\db\migrations\001_init.sql | docker compose exec -T db psql -U triage -d triage`)*

### 4. Seed development data

```bash
cd backend
npm run seed
```

Expected output:

```
[seed] inserted: { users: '3', customers: '10', tickets: '60', logs: '34', notes: '0' }
[seed] committed.
```

The seed is deterministic and idempotent — safe to re-run. It wipes and reseeds.

### 5. Run both servers

Terminal 1 — backend:

```bash
cd backend
npm run dev
# listening on http://127.0.0.1:3001
```

Terminal 2 — frontend:

```bash
cd frontend
npm run dev
# ready at http://localhost:5173
```

Open `http://localhost:5173`.

---

## API

| Method | Path                                | Notes                                    |
|--------|-------------------------------------|------------------------------------------|
| GET    | `/health`                           | Liveness check                           |
| GET    | `/health/db`                        | Liveness + DB connectivity               |
| GET    | `/api/tickets`                      | List with filters and pagination         |
| GET    | `/api/tickets/:id`                  | Detail with nested logs and notes        |
| GET    | `/api/analysis/top-customers`       | Customers ranked by error volume (7 days)|

**`GET /api/tickets` query parameters:**

- `status` — one of `open`, `pending`, `waiting`, `escalated`, `resolved`
- `priority` — one of `low`, `medium`, `high`, `critical`
- `page` — 1-based, default `1`
- `limit` — 1–100, default `20`

Invalid values are rejected with `400` before reaching the database.

---

## Schema

Five tables. See `backend/src/db/migrations/001_init.sql` for the full definitions.

- `users` — support agents
- `customers` — accounts submitting tickets
- `tickets` — the central object
- `ticket_logs` — integration log entries attached to a ticket
- `ticket_notes` — internal agent notes

### Design decisions worth knowing

- **`external_id` is separate from `id`.** UUIDs are internal. Humans see `ZD-4821`, not `550e8400-...`.
- **`sla_deadline` is a snapshot.** Set at ticket creation from the customer's plan at that moment. It does *not* recompute if the plan changes. Auditability beats freshness here.
- **`status` carries "waiting on customer."** There is no separate boolean — that would be two sources of truth.
- **`updated_at` is maintained by a trigger.** Application code cannot forget to set it.
- **Categories use a `CHECK` constraint for v0.1.** Migrate to a `categories` table when categories need metadata (owner team, default SLA) or when adding one requires a deploy.
- **`error_count` from the analysis endpoint is a string.** Postgres returns `COUNT()` as `bigint`, and `pg` serializes bigints as strings to avoid precision loss. The frontend converts it to a number at the API boundary.

---

## Project structure

```
triage/
├── backend/
│   ├── src/
│   │   ├── index.ts              # Express server
│   │   └── db/
│   │       ├── client.ts         # Postgres connection pool
│   │       └── migrations/
│   │           └── 001_init.sql
│   └── scripts/
│       ├── seed.ts               # deterministic dev data
│       └── analyze.ts            # CLI version of the analysis query
└── frontend/
    └── src/
        ├── api/client.ts         # typed fetch wrapper
        ├── types/ticket.ts       # shared response types
        ├── styles/tokens.css     # design tokens
        └── ...
```

---

## Roadmap

- [x] Schema and migration
- [x] Deterministic seed data
- [x] REST API: tickets, filters, pagination, detail, analysis
- [x] Frontend scaffold and design tokens
- [ ] Tickets page with table, SLA countdown, filters
- [ ] Ticket detail panel (logs, notes)
- [ ] Analysis page
- [ ] Authentication (v0.2)
- [ ] Tests on the analysis and filter logic (v0.2)
- [ ] Deploy (v0.2)

---

## Why this project

Most portfolio projects are tutorials with a new coat of paint. This one is built around a problem the author actually understood from working in technical support: agents drown in queues, and the tools that are supposed to help often make it worse. Triage is the opposite — a small, focused tool that answers one question well.

See `docs/DECISIONS.md` for the reasoning behind the schema and API shape.