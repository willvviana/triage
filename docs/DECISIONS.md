# Design Decisions

This document records the non-obvious choices made while building Triage, and — more importantly — the reasoning behind each one. It exists because "what does this code do" is answered by reading the code, but "why did you build it this way" is not.

Every section here is a potential interview question. Read it before any technical conversation about this project.

---

## Schema

### `external_id` is separate from `id`

**Decision:** tickets have both a UUID primary key (`id`) and a human-facing string (`external_id`, e.g. `ZD-4821`).

**Why:** UUIDs are terrible for humans. Support agents say "ticket 4821" on the phone, not "ticket 550e8400-e29b-41d4-a716-446655440000." The `external_id` is the operational identifier — what's printed, referenced, and spoken. The UUID is the internal identifier — what foreign keys point to and what the database indexes.

**What this buys us:** the numbering scheme can change (e.g. from sequential to prefixed with a system code) without touching any foreign keys. Integration with a real system like Zendesk would import their IDs as `external_id` while keeping our own `id`.

**What it costs:** one extra column, and a rule that the UI only ever displays `external_id`.

### `sla_deadline` is a stored snapshot, not a computed value

**Decision:** the ticket stores a fixed `sla_deadline` timestamp, set at creation time from the customer's plan at that moment. It is not recomputed if the customer's plan changes.

**Why:** consider a Pro customer whose SLA is 8 hours. A ticket is created at 10:00, so the deadline is 18:00. At 12:00 the customer upgrades to Enterprise, whose SLA is 2 hours. Should the deadline retroactively become 12:00 (breached) or stay 18:00?

The answer is 18:00. The ticket was handled under the Pro SLA. Rewriting history mid-ticket would produce inconsistent reports and make audits impossible. Real support systems work this way — the SLA is a contract at the moment of ticket creation.

**What this buys us:** auditability, determinism, and a simple query (`WHERE sla_deadline < NOW()` for breached tickets).

**What it costs:** the schema needs a migration if we ever want per-ticket SLA policies beyond what the customer's plan implies. The mature version adds an `sla_policy_id` foreign key so we know exactly which policy produced the deadline. For v0.1, that's premature complexity.

### `status` carries "waiting on customer", not a separate boolean

**Decision:** the `status` enum includes `waiting` as a value. There is no separate `waiting_on_customer` boolean.

**Why:** a boolean and a status value representing the same fact creates two sources of truth. If `status = 'open'` and `waiting_on_customer = true`, what does that mean? The system has to decide. Worse: `status = 'waiting'` with `waiting_on_customer = false` is a state the code has to guard against but shouldn't exist.

**The single source of truth rule:** if two fields can disagree, they will. Don't have two fields.

**What this costs:** if we ever need to distinguish "waiting on customer" from "waiting on internal team" from "waiting on vendor," we'd add `waiting_customer`, `waiting_internal`, `waiting_vendor` as status values — or introduce a separate `waiting_on` column. But that's a real need, not a hypothetical one. v0.1 doesn't have it.

### `updated_at` is maintained by a PostgreSQL trigger

**Decision:** the `tickets` table has a `BEFORE UPDATE` trigger that sets `updated_at = now()`. Application code does not set it.

**Why:** application code forgets. A junior developer adds a new `UPDATE tickets SET status = ...` somewhere and doesn't think about `updated_at`. Six months later, "sort by recently updated" silently doesn't work for the rows touched by that code path, and nobody knows why.

Putting it in the database means it's impossible to forget. Every `UPDATE`, from anywhere, gets the timestamp set.

**What this costs:** a tiny bit of magic. When a developer reads the application code, they don't see `updated_at` being set and have to know the trigger exists. Documented here, and readable in `001_init.sql`.

### Categories use a `CHECK` constraint, not a separate table

**Decision:** the `category` column is `TEXT` with `CHECK (category IN ('api', 'authentication', 'billing', 'integration', 'account'))`.

**Why:** with five fixed values and no metadata, a separate `categories` table is overkill. It would introduce a join, an extra migration for a foreign key, and a seed step, to model something that fits in a constraint.

**The trigger to migrate:** when categories need metadata (owner team, default SLA, whether the category is active) or when adding a new category requires a deploy. When either of those becomes true, drop the `CHECK` and introduce `categories(id, name, ...)` with `tickets.category_id`.

**This is a documented decision, not a final one.** The constraint is right for v0.1. It has a known expiry condition.

### Endpoint values are normalized (lowercase, no trailing slash)

**Decision:** endpoints in `ticket_logs` are stored lowercase with no trailing slash. Enforced in the seed script; planned for enforcement at the API boundary when writes exist.

**Why:** Postgres treats `/api/v1/auth` and `/api/v1/Auth` and `/api/v1/auth/` as three different strings. The analysis query groups by endpoint. Without normalization, "top failing endpoints" becomes meaningless because the same endpoint appears three times with different casing.

**What we chose not to do:** a database-level `CHECK` constraint enforcing the format. It would work, but it's a category of validation better done at the API boundary where it can produce a helpful error message.

**This is a v0.1 simplification.** Real integrations (Zendesk, Jira) return endpoints as-is, and would need normalization on ingestion.

---

## API

### Raw SQL, not an ORM

**Decision:** queries are written as raw SQL strings, parameterized, executed via `pg`. There is no Prisma, Drizzle, Knex, or any other ORM.

**Why:** for a project of this size, an ORM adds indirection without adding value. The interesting queries in Triage — the `LEFT JOIN` analysis, the `json_agg` detail endpoint — are simpler to read as SQL than as ORM chains. And the SQL is visible in the code, which means anyone reviewing the repo can see exactly what hits the database.

**What this buys us:** complete visibility into the queries, no hidden N+1s, no "why is the ORM generating this weird SQL" debugging. Type safety is still available — the generic parameter on `pool.query<T>` gives callers typed rows.

**What this costs:** manual handling of dynamic queries (see "Dynamic WHERE clauses" below). Also, no migration tooling — migrations are numbered `.sql` files run manually. For a real team, that's a problem. For one developer, it's fine.

**When to revisit:** when the project has more than one developer, or when migrations become frequent enough that manual application is a bottleneck.

### Dynamic WHERE clauses with parameterized placeholders

**Decision:** filter queries are built by pushing SQL fragments (`$1`, `$2`, ...) and values into parallel arrays, then joining.

```typescript
const conditions: string[] = [];
const params: unknown[] = [];

if (status) {
  params.push(status);
  conditions.push(`t.status = $${params.length}`);
}
```

**Why:** the naive alternative — string interpolation — is SQL injection. Parameterized placeholders prevent it because Postgres treats the values as data, never as SQL. The `$${params.length}` trick keeps the fragment index and the value index aligned automatically.

**What this buys us:** no SQL injection, no manual counting of `$1` through `$N`, and the same pattern extends to any number of filters.

**What this costs:** the code is less readable than a query builder would be. There's a discipline involved: you must remember to push the value *before* using `params.length`, and you must not accidentally reference `$n` beyond what's in `params`. TypeScript can't catch either mistake.

### Analysis returns `error_count` as a string, and the frontend converts it

**Decision:** `GET /api/analysis/top-customers` returns `error_count` as a string. `client.ts` in the frontend converts it to a number at the API boundary.

**Why:** Postgres `COUNT()` returns `bigint`. The `pg` driver serializes bigints as strings because JavaScript's `Number` type can't safely hold integers larger than 2^53. Silently converting a large count to a number would lose precision.

**The alternative:** cast to `int` in the SQL (`COUNT(tl.id)::int`). This works for counts that will never exceed 2^31, which is true here. But it's a lie — the query *could* return a bigint, and casting to a smaller type hides that.

**Why we chose strings:** the honest representation. Postgres sends a bigint, the driver sends a string, the API boundary (in `client.ts`) converts to a number because the frontend knows its counts are small. Every layer preserves the truth until the layer that knows better.

### Subqueries with `json_agg` for the ticket detail endpoint

**Decision:** `GET /api/tickets/:id` returns the ticket with its logs and notes as JSON arrays. The SQL uses two subqueries with `json_agg`, not JOINs.

**Why:** joining logs and notes directly would produce a cartesian product. A ticket with 3 logs and 2 notes, joined naively, produces 6 rows. Each log appears twice (once per note) and each note appears 3 times (once per log). The API would then have to dedupe in JavaScript, and the whole thing breaks once a third child table is added.

Subqueries with `json_agg` aggregate independently. One row per ticket, with arrays inside.

**What this buys us:** one round trip to the database, no deduplication, no N+1. The result maps directly to the frontend's type.

**What this costs:** the SQL is harder to read. The `COALESCE(..., '[]'::json)` wrapper is necessary because `json_agg` returns `NULL` for empty results, and the frontend should receive `[]` instead.

### Routes use `req.query.status` with a whitelist, not raw input

**Decision:** filter values are validated against a whitelist before reaching the database.

```typescript
const VALID_STATUSES = ['open', 'pending', 'waiting', 'escalated', 'resolved'];
if (status && !VALID_STATUSES.includes(status)) {
  return res.status(400).json({ error: `invalid status: ${status}` });
}
```

**Why:** parameterized queries prevent SQL injection, but they don't prevent invalid values from producing confusing empty results. A client that sends `?status=opne` gets back `{"tickets":[]}` and has no idea why. With the whitelist, they get a 400 and a clear error.

**Defense in depth.** Two independent mechanisms (parameterization, whitelisting) protecting the same boundary.

---

## Frontend

### Filters live in the URL, not in React state

**Decision:** the ticket list's filter state (status, priority, page) lives in the URL query string. It's read via `useSearchParams` from React Router and written by updating the query string.

**Why:** three things become free when the URL is the state:

1. **Refresh keeps the filters.** In local React state, refreshing resets everything.
2. **Filters are shareable.** "Look at these tickets" is a link, not a screenshot.
3. **Browser back/forward work.** Navigation history reflects user intent.

**What this costs:** two specific bugs to avoid.

First, `useSearchParams` returns a new object every render. Putting it directly in a `useEffect` dependency array causes an infinite loop. The dependency array must contain the *values* (`status`, `priority`, `page`), not the object.

Second, changing a filter must reset `page` to 1. Otherwise, filtering from page 3 down to 5 results leaves you looking at an empty page.

### The ticket detail drawer is derived from the URL, not from a modal state

**Decision:** opening a ticket navigates to `/tickets/:id`. The drawer renders when that URL param is present. Closing navigates back to `/tickets`.

**Why:** a modal's `isOpen` state would need to be synced with the URL anyway (for back button, shareability). Making the URL the source of truth removes the sync problem entirely.

**What this buys us:** the same benefits as URL filters — refresh keeps the drawer open, drawer URLs are shareable, and the back button closes the drawer. No `useEffect` synchronizing URL and state.

**What this costs:** the ticket list must remain mounted when the URL changes from `/tickets` to `/tickets/:id`. That's why `App.tsx` routes both to `<TicketsPage>`, and the drawer appears as an overlay.

### `tsx` is a runtime dependency, not a dev dependency

**Decision:** `tsx` lives in `dependencies` in `backend/package.json`.

**Why:** the production `start` script is `tsx src/index.ts`. It runs the TypeScript directly, without a build step. That means `tsx` is needed at runtime, not just during development.

Render's default `npm install` skips `devDependencies`. When `tsx` was in `devDependencies`, the deployed service failed with `tsx: not found`. The fix was to move it.

**The general rule:** `dependencies` vs `devDependencies` isn't "important vs unimportant." It's "needed at runtime vs only needed for building/testing." `tsx` is needed at runtime in our setup, so it goes in `dependencies`.

**When to revisit:** if we add a `tsc` build step that compiles to JavaScript, `tsx` becomes a build-only tool and moves back to `devDependencies`.

### Backend listens on `0.0.0.0` in production, `127.0.0.1` in development

**Decision:**

```typescript
const HOST = process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1';
```

**Why:** in production, Render's HTTP proxy forwards requests to the container from outside its loopback interface. If the app binds to `127.0.0.1`, only processes inside the container can reach it, and the proxy can't.

In development on a laptop, `0.0.0.0` would expose the dev server to anyone on the local network. Not a security incident for a demo project, but not a good default either.

**This is a common first-deploy failure.** The app starts, the log says "listening," but health checks fail because the proxy can't reach the bound port.

### CORS origins are explicit, never `*`

**Decision:** the CORS middleware allows an explicit list of origins. In development, `localhost:5173` and `127.0.0.1:5173`. In production, the `FRONTEND_URL` env var is added to that list.

**Why:** wildcard CORS (`origin: '*'`) is a habit that works in development and becomes a security bug in production. Being explicit now means the configuration that runs in production is the configuration that's tested in development.

**Gotcha:** the value must include the scheme (`https://example.com`, not `example.com`). CORS does an exact string match against the `Origin` header, which always includes the scheme.

### The frontend API boundary normalizes response shapes

**Decision:** `api/client.ts` converts `error_count` from string to number. Components never see the string form.

**Why:** the API returns what Postgres sends (string, per the earlier decision). The frontend wants a number. The conversion has to happen *somewhere*. Putting it in the API client means components write `if (customer.error_count > 5)`, not `if (Number(customer.error_count) > 5)`.

**The general principle:** convert at boundaries. The database boundary speaks SQL types. The HTTP boundary speaks JSON. The application boundary speaks domain types. Each conversion happens exactly once, at the layer that knows it needs to happen.

---

## Deployment

### Backend + database on Render, frontend on Vercel

**Decision:** two platforms, one for each half of the stack.

**Why:** Vercel is purpose-built for static frontends and has excellent DX for Vite. Render is a good middle ground for Node services and manages a Postgres instance with the same account. Splitting them means each half uses the platform that's best for its type of workload.

**What this costs:** two dashboards, two sets of environment variables, and a CORS configuration that must stay in sync. Also, Render's free tier spins down the API after 15 minutes of inactivity, so the first request after a pause takes 30–60 seconds.

### Migrations are run manually against the deployed database

**Decision:** there is no automatic migration on deploy. To apply the schema to a fresh database, run `001_init.sql` manually using the External Database URL.

**Why:** automatic migrations are the right pattern when you have a team, a staging environment, and code review. For a solo project, the risk is asymmetric — an automatic migration with a bug runs on every deploy, whereas a manual one runs exactly once, and you're watching when it does.

**When to revisit:** the moment there's a second environment (staging), or a second developer. Then migrations become a pipeline step with a proper tool (e.g. `node-pg-migrate`), not manual application.

---

## What we deliberately did not do for v0.1

These are not oversights. They are choices, made to ship a working project sooner rather than build every feature.

- **Authentication.** Three to five days of work. Invisible in a demo. The app is read-only and there is no sensitive data. Adding auth now would delay shipping by a week for zero benefit to a portfolio reviewer.
- **Tests.** The most important tests — the analysis query, the filter building, the SLA state logic — are the pieces most likely to break silently. But writing them before the app has a stable shape means rewriting them. v0.2, once the surface is settled.
- **A `tsc` build step for the backend.** `tsx` in production is unusual but functional. The savings (no second tsconfig, no build pipeline, no output directory to manage) exceed the cost (200ms slower cold start) for this project.
- **Real integrations.** The fake seed data tells the story better than a half-working Zendesk connector would. Real integrations are a v0.3 concern, after the app itself is solid.
- **Multiple themes.** Dark mode ships. Light mode is a v0.2 refactor of `tokens.css` only, if it's ever needed.

Each of these has a trigger condition — a point at which the deferral stops making sense. When any trigger arrives, revisit the decision.