// db/client.ts
// Single shared Postgres connection pool for the whole backend.
//
// Why a pool and not a single client:
//   - A single `Client` opens one TCP connection. Under concurrency (two
//     requests at once), the second request waits or errors. A `Pool`
//     multiplexes N connections and hands them out per query.
//   - Postgres has a hard connection limit. A pool caps how many we open.
//
// Why module-level:
//   - Node caches modules. Importing this file from anywhere returns the
//     SAME pool instance. Creating a new Pool per file would open dozens of
//     connections and exhaust Postgres. One pool, imported everywhere.

import { Pool } from 'pg';

// Fail fast if the env var is missing. Silent fallbacks hide misconfig.
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    'DATABASE_URL is not set. Copy backend/.env.example to backend/.env and fill it in.',
  );
}

export const pool = new Pool({
  connectionString,
  // Cap concurrent connections. 10 is plenty for local dev and a single
  // Node process. Raise only if you measure a real bottleneck.
  max: 10,
  // Close idle connections after 30s so local Postgres doesn't hold dead
  // TCP connections between dev sessions.
  idleTimeoutMillis: 30_000,
  // Fail a query if it can't get a connection within 5s, rather than
  // hanging forever. Better to surface an error than deadlock.
  connectionTimeoutMillis: 5_000,
});

// Postgres can drop a connection (restart, network blip). The pool emits
// 'error' on the idle client. Without this handler, Node crashes the
// whole process. Log it — do not swallow it.
pool.on('error', (err) => {
  console.error('[db] unexpected idle client error', err);
});

// Small helper so callers don't import `pool` directly. Makes it easier to
// swap the pool later (e.g., for tests with a mock) without touching every
// call site.
export async function query<T extends Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  const result = await pool.query<T>(text, params);
  return result.rows;
}