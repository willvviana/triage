// scripts/seed.ts
// Deterministic development seed for Triage v0.1.
//
// Design constraints (locked in from the design review):
//   1. Deterministic — same logical data on every run. No Math.random anywhere.
//   2. Idempotent — safe to re-run. We DELETE then re-INSERT, not append.
//   3. Covers the edge cases the dashboard must handle:
//        - overdue ticket
//        - ticket approaching SLA deadline
//        - ticket waiting on customer
//        - unassigned ticket
//        - ticket with no logs
//        - ticket with logs but no errors
//        - ticket with multiple error logs
//        - endpoint appearing in the endpoint analysis
//   4. Endpoint normalization: lowercase, no trailing slash (except root "/").
//   5. Development-only. Never run this against production.
//
// Run with: npm run seed

// dotenv/config MUST be the first import. In ESM, imports are hoisted, so
// if client.ts is imported before this line runs, client.ts throws on a
// missing DATABASE_URL. Order matters.
import 'dotenv/config';

import { pool } from '../src/db/client.js';

// ---------------------------------------------------------------------------
// Guard: refuse to run against anything but a local/dev database.
// This is the "do not create fake production users" rule made executable.
// ---------------------------------------------------------------------------
if (process.env.NODE_ENV === 'production') {
  console.error('[seed] refusing to run with NODE_ENV=production');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Fixed IDs. We hardcode UUIDs so relationships are stable across runs and
// so you can eyeball them in psql without joining. In a real system these
// would be generated; in a dev seed, stable IDs are a feature.
// ---------------------------------------------------------------------------
const AGENT_ALEX = '11111111-1111-1111-1111-111111111111';
const AGENT_SAM = '22222222-2222-2222-2222-222222222222';
const AGENT_JORDAN = '33333333-3333-3333-3333-333333333333';

const CUSTOMER_ACME = 'a0000000-0000-0000-0000-000000000001';
const CUSTOMER_GLOBEX = 'a0000000-0000-0000-0000-000000000002';
const CUSTOMER_INITECH = 'a0000000-0000-0000-0000-000000000003';
const CUSTOMER_UMBRELLA = 'a0000000-0000-0000-0000-000000000004';
const CUSTOMER_SOYLENT = 'a0000000-0000-0000-0000-000000000005';
const CUSTOMER_HOOLI = 'a0000000-0000-0000-0000-000000000006';
const CUSTOMER_PIEDPIPER = 'a0000000-0000-0000-0000-000000000007';
const CUSTOMER_WONKA = 'a0000000-0000-0000-0000-000000000008';
const CUSTOMER_STARK = 'a0000000-0000-0000-0000-000000000009';
const CUSTOMER_WAYNE = 'a0000000-0000-0000-0000-00000000000a';

// Fixed "now" offset. We anchor all timestamps to this so the seed produces
// the same relative picture (overdue, approaching-SLA, on-track) every run.
// Using real now() would make the data shift daily and break reproducibility.
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const NOW = new Date('2026-10-08T12:00:00Z');

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * DAY);
}
function hoursAgo(hours: number): Date {
  return new Date(NOW.getTime() - hours * HOUR);
}
function hoursFromNow(hours: number): Date {
  return new Date(NOW.getTime() + hours * HOUR);
}

// ---------------------------------------------------------------------------
// Endpoint normalization. Single source of truth for the rule.
// Lowercase, strip trailing slash unless the path is exactly "/".
// ---------------------------------------------------------------------------
function normalizeEndpoint(endpoint: string): string {
  const lower = endpoint.toLowerCase();
  if (lower === '/') return '/';
  return lower.replace(/\/+$/, '');
}

async function seed(): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // -----------------------------------------------------------------------
    // 1. Clean slate. DELETE order is reverse of FK dependency order.
    //    ticket_notes and ticket_logs reference tickets; tickets references
    //    customers and users. So: notes -> logs -> tickets -> customers -> users.
    //    TRUNCATE would be faster but requires CASCADE, which silently
    //    cascades to tables you didn't think about. DELETE is explicit.
    // -----------------------------------------------------------------------
    await client.query('DELETE FROM ticket_notes');
    await client.query('DELETE FROM ticket_logs');
    await client.query('DELETE FROM tickets');
    await client.query('DELETE FROM customers');
    await client.query('DELETE FROM users');

    // -----------------------------------------------------------------------
    // 2. Users (agents). Fixed identities. Password hash is a placeholder
    //    for a real bcrypt hash — auth comes later, this is just to satisfy
    //    the NOT NULL constraint and give assignment targets.
    // -----------------------------------------------------------------------
    const PLACEHOLDER_HASH = '$2b$10$placeholderplaceholderplaceholderplaceholderpla';
    await client.query(
      `INSERT INTO users (id, email, password_hash, display_name) VALUES
        ($1, $2, $3, $4),
        ($5, $6, $7, $8),
        ($9, $10, $11, $12)`,
      [
        AGENT_ALEX, 'alex@triage.dev', PLACEHOLDER_HASH, 'Alex Morgan',
        AGENT_SAM, 'sam@triage.dev', PLACEHOLDER_HASH, 'Sam Taylor',
        AGENT_JORDAN, 'jordan@triage.dev', PLACEHOLDER_HASH, 'Jordan Lee',
      ],
    );

    // -----------------------------------------------------------------------
    // 3. Customers. 10 accounts across all three plans.
    //    Note the deliberate mix: some enterprise (high SLA), some free (low SLA).
    //    This makes the SLA analysis meaningful.
    // -----------------------------------------------------------------------
    await client.query(
      `INSERT INTO customers (id, name, plan, region) VALUES
        ($1, $2, $3, $4),
        ($5, $6, $7, $8),
        ($9, $10, $11, $12),
        ($13, $14, $15, $16),
        ($17, $18, $19, $20),
        ($21, $22, $23, $24),
        ($25, $26, $27, $28),
        ($29, $30, $31, $32),
        ($33, $34, $35, $36),
        ($37, $38, $39, $40)`,
      [
        CUSTOMER_ACME, 'Acme Corp', 'enterprise', 'us-east',
        CUSTOMER_GLOBEX, 'Globex', 'pro', 'us-west',
        CUSTOMER_INITECH, 'Initech', 'free', 'eu-west',
        CUSTOMER_UMBRELLA, 'Umbrella Corp', 'enterprise', 'us-east',
        CUSTOMER_SOYLENT, 'Soylent Corp', 'pro', 'ap-south',
        CUSTOMER_HOOLI, 'Hooli', 'enterprise', 'us-west',
        CUSTOMER_PIEDPIPER, 'Pied Piper', 'free', 'us-east',
        CUSTOMER_WONKA, 'Wonka Industries', 'pro', 'eu-west',
        CUSTOMER_STARK, 'Stark Industries', 'enterprise', 'us-east',
        CUSTOMER_WAYNE, 'Wayne Enterprises', 'pro', 'us-west',
      ],
    );

    // -----------------------------------------------------------------------
    // 4. Tickets. Hand-authored scenarios for edge cases, then a loop for
    //    volume. Every ticket has a stable external_id so re-runs produce
    //    the same UI ("Ticket #ZD-4821").
    // -----------------------------------------------------------------------

    // --- Scenario tickets (each covers a required edge case) ---

    // Overdue: SLA deadline in the past.
    const t1 = await insertTicket(client, {
      externalId: 'ZD-4801',
      customerId: CUSTOMER_ACME,
      subject: 'Production API returning 401 on all requests',
      body: 'All our production calls started returning 401 about an hour ago. No config change on our side.',
      category: 'authentication',
      status: 'open',
      priority: 'critical',
      assignedTo: AGENT_SAM,
      slaDeadline: hoursAgo(3), // overdue
      escalatedAt: null,
    });

    // Approaching SLA: deadline in <1 hour.
    const t2 = await insertTicket(client, {
      externalId: 'ZD-4802',
      customerId: CUSTOMER_GLOBEX,
      subject: 'Webhook deliveries failing intermittently',
      body: 'About 1 in 10 webhook deliveries fails. Retries eventually succeed but latency is bad.',
      category: 'integration',
      status: 'open',
      priority: 'high',
      assignedTo: AGENT_ALEX,
      slaDeadline: hoursFromNow(0.5), // approaching
      escalatedAt: null,
    });

    // Waiting on customer.
    const t3 = await insertTicket(client, {
      externalId: 'ZD-4803',
      customerId: CUSTOMER_INITECH,
      subject: 'Billing discrepancy on last invoice',
      body: 'Our invoice shows a charge for 12 seats but we only have 8 active users.',
      category: 'billing',
      status: 'waiting',
      priority: 'medium',
      assignedTo: AGENT_JORDAN,
      slaDeadline: hoursFromNow(20),
      escalatedAt: null,
    });

    // Unassigned.
    const t4 = await insertTicket(client, {
      externalId: 'ZD-4804',
      customerId: CUSTOMER_UMBRELLA,
      subject: 'Cannot invite new team members',
      body: 'Invitations fail silently. No error shown, no email received.',
      category: 'account',
      status: 'open',
      priority: 'high',
      assignedTo: null, // unassigned
      slaDeadline: hoursFromNow(4),
      escalatedAt: null,
    });

    // Escalated.
    const t5 = await insertTicket(client, {
      externalId: 'ZD-4805',
      customerId: CUSTOMER_SOYLENT,
      subject: 'Data export endpoint timing out',
      body: 'Export of >100k rows times out after 30s. Needs engineering review.',
      category: 'api',
      status: 'escalated',
      priority: 'high',
      assignedTo: AGENT_SAM,
      slaDeadline: hoursFromNow(2),
      escalatedAt: hoursAgo(1),
    });

    // No logs. Tests the "empty detail panel" state.
    const t6 = await insertTicket(client, {
      externalId: 'ZD-4806',
      customerId: CUSTOMER_HOOLI,
      subject: 'Question about API rate limits',
      body: 'What are the current rate limits for the search endpoint?',
      category: 'api',
      status: 'open',
      priority: 'low',
      assignedTo: null,
      slaDeadline: null, // low priority, no SLA
      escalatedAt: null,
    });

    // --- Volume tickets. Deterministic loop, not random. ---
    // We generate 54 more tickets spread across customers and categories,
    // cycling deterministically so the pattern is stable across runs.
    const categories = ['api', 'authentication', 'billing', 'integration', 'account'] as const;
    const statuses = ['open', 'pending', 'waiting', 'escalated', 'resolved'] as const;
    const priorities = ['low', 'medium', 'high', 'critical'] as const;
    const customers = [
      CUSTOMER_ACME, CUSTOMER_GLOBEX, CUSTOMER_INITECH, CUSTOMER_UMBRELLA,
      CUSTOMER_SOYLENT, CUSTOMER_HOOLI, CUSTOMER_PIEDPIPER, CUSTOMER_WONKA,
      CUSTOMER_STARK, CUSTOMER_WAYNE,
    ];
    const agents = [AGENT_ALEX, AGENT_SAM, AGENT_JORDAN, null] as const;

    const volumeTicketIds: string[] = [];
    for (let i = 0; i < 54; i++) {
      const externalId = `ZD-${4900 + i}`;
      const id = await insertTicket(client, {
        externalId,
        customerId: customers[i % customers.length]!,
        subject: `Support request #${4900 + i}`,
        body: `Automated seed body for ticket ${externalId}.`,
        category: categories[i % categories.length]!,
        status: statuses[i % statuses.length]!,
        priority: priorities[i % priorities.length]!,
        assignedTo: agents[i % agents.length]!,
        slaDeadline: hoursFromNow(4 + (i % 48)),
        escalatedAt: null,
      });
      volumeTicketIds.push(id);
    }

    // -----------------------------------------------------------------------
    // 5. Logs. Intentional clustering:
    //      - Acme (t1) gets MANY error logs — it's the top of the dashboard.
    //      - Globex (t2) gets a moderate amount.
    //      - Some volume tickets get a few logs.
    //      - t6 has NO logs.
    //    This is what makes the analysis query return a meaningful ranking
    //    instead of a uniform field of noise.
    // -----------------------------------------------------------------------

    // Acme — the heavy error customer.
    await insertLogs(client, t1, [
      { endpoint: '/api/v1/auth', level: 'error', status: 401, message: 'Invalid credentials' },
      { endpoint: '/api/v1/auth', level: 'error', status: 401, message: 'Invalid credentials' },
      { endpoint: '/api/v1/auth', level: 'error', status: 401, message: 'Token expired' },
      { endpoint: '/api/v1/auth', level: 'error', status: 401, message: 'Invalid credentials' },
      { endpoint: '/api/v1/users', level: 'error', status: 403, message: 'Forbidden' },
      { endpoint: '/api/v1/auth', level: 'warn', status: 429, message: 'Rate limit approaching' },
      { endpoint: '/api/v1/auth', level: 'info', status: 200, message: 'OK' },
    ]);

    // Globex — webhook issues.
    await insertLogs(client, t2, [
      { endpoint: '/api/v1/webhooks/deliver', level: 'error', status: 502, message: 'Upstream timeout' },
      { endpoint: '/api/v1/webhooks/deliver', level: 'error', status: 502, message: 'Upstream timeout' },
      { endpoint: '/api/v1/webhooks/retry', level: 'warn', status: 200, message: 'Retry succeeded' },
      { endpoint: '/api/v1/webhooks/deliver', level: 'info', status: 200, message: 'Delivered' },
    ]);

    // Umbrella — one warn, no errors. Tests "has logs but no errors".
    await insertLogs(client, t4, [
      { endpoint: '/api/v1/invitations', level: 'warn', status: 202, message: 'Invitation queued' },
    ]);

    // Soylent — escalation context.
    await insertLogs(client, t5, [
      { endpoint: '/api/v1/export', level: 'error', status: 504, message: 'Gateway timeout' },
      { endpoint: '/api/v1/export', level: 'error', status: 504, message: 'Gateway timeout' },
    ]);

    // A few volume tickets get logs so the endpoint analysis has volume.
    // We only attach to the first 20 volume tickets to keep the seed readable.
    for (let i = 0; i < 20; i++) {
      const ticketId = volumeTicketIds[i]!;
      await insertLogs(client, ticketId, [
        {
          endpoint: normalizeEndpoint('/api/v1/search'),
          level: i % 3 === 0 ? 'error' : 'info',
          status: i % 3 === 0 ? 500 : 200,
          message: i % 3 === 0 ? 'Internal server error' : 'OK',
        },
      ]);
    }

    // -----------------------------------------------------------------------
    // 6. Report. Print counts so the operator (you) sees what happened.
    // -----------------------------------------------------------------------
    const counts = await client.query<{
      users: string; customers: string; tickets: string; logs: string; notes: string;
    }>(`
      SELECT
        (SELECT COUNT(*) FROM users)        AS users,
        (SELECT COUNT(*) FROM customers)    AS customers,
        (SELECT COUNT(*) FROM tickets)      AS tickets,
        (SELECT COUNT(*) FROM ticket_logs)  AS logs,
        (SELECT COUNT(*) FROM ticket_notes) AS notes
    `);
    console.log('[seed] inserted:', counts.rows[0]);

    await client.query('COMMIT');
    console.log('[seed] committed.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[seed] failed, rolled back:', err);
    throw err;
  } finally {
    client.release();
    // Close the pool so the process can exit. Without this, tsx hangs.
    await pool.end();
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface TicketInput {
  externalId: string;
  customerId: string;
  subject: string;
  body: string;
  category: string;
  status: string;
  priority: string;
  assignedTo: string | null;
  slaDeadline: Date | null;
  escalatedAt: Date | null;
}

async function insertTicket(
  client: import('pg').PoolClient,
  t: TicketInput,
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO tickets
       (external_id, customer_id, subject, body, category, status, priority,
        assigned_to, sla_deadline, escalated_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)
     RETURNING id`,
    [
      t.externalId, t.customerId, t.subject, t.body, t.category, t.status,
      t.priority, t.assignedTo, t.slaDeadline, t.escalatedAt, daysAgo(2),
    ],
  );
  return result.rows[0]!.id;
}

interface LogInput {
  endpoint: string;
  level: 'info' | 'warn' | 'error';
  status: number | null;
  message: string;
}

async function insertLogs(
  client: import('pg').PoolClient,
  ticketId: string,
  logs: LogInput[],
): Promise<void> {
  for (const log of logs) {
    await client.query(
      `INSERT INTO ticket_logs
         (ticket_id, occurred_at, level, endpoint, status_code, message)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        ticketId,
        hoursAgo(1),
        log.level,
        normalizeEndpoint(log.endpoint),
        log.status,
        log.message,
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Entrypoint
// ---------------------------------------------------------------------------
seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });