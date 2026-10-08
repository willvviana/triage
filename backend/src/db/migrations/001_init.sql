-- 001_init.sql
-- Triage — initial schema (v0.1)
--
-- Design notes (kept here, not in a separate doc, so it travels with the schema):
--   1. No ORM. Raw SQL so the schema is explicit and reviewable.
--   2. category is CHECK-constrained for v0.1. Migrate to a `categories` table
--      when categories need metadata (owner team, default SLA) or when adding
--      one requires a deploy.
--   3. sla_deadline is a SNAPSHOT of the SLA policy at ticket-creation time.
--      We do NOT recalculate it when the customer's plan changes. Audit wins
--      over "always current". A future version adds sla_policy_id for full
--      traceability.
--   4. endpoint is stored lowercase, no trailing slash. Enforced in the seed
--      script, not by the DB. If this drifts, analytics on endpoints breaks.
--   5. updated_at is maintained by a trigger, not by application code. You
--      cannot forget to update it.

-- pgcrypto provides gen_random_uuid() on older Postgres. Harmless if present.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------
-- users: support agents who log into Triage. No roles yet (v0.2).
-- ---------------------------------------------------------------
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------
-- customers: the accounts submitting tickets.
-- A customer is NOT a login. Do not merge with users.
-- ---------------------------------------------------------------
CREATE TABLE customers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  plan        TEXT NOT NULL CHECK (plan IN ('free', 'pro', 'enterprise')),
  region      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------
-- tickets: the central object.
--   - external_id: what humans see ("4821", "ZD-4821"). Not the UUID.
--   - status carries "waiting on customer". No separate boolean — that would
--     be two sources of truth.
--   - assigned_to NULL means unassigned.
-- ---------------------------------------------------------------
CREATE TABLE tickets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id  TEXT NOT NULL UNIQUE,
  customer_id  UUID NOT NULL REFERENCES customers(id),

  subject      TEXT NOT NULL,
  body         TEXT NOT NULL,

  category     TEXT NOT NULL CHECK (
    category IN ('api', 'authentication', 'billing', 'integration', 'account')
  ),

  status       TEXT NOT NULL CHECK (
    status IN ('open', 'pending', 'waiting', 'escalated', 'resolved')
  ),

  priority     TEXT NOT NULL CHECK (
    priority IN ('low', 'medium', 'high', 'critical')
  ),

  assigned_to  UUID REFERENCES users(id),

  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  sla_deadline TIMESTAMPTZ,
  escalated_at TIMESTAMPTZ
);

-- ---------------------------------------------------------------
-- ticket_logs: integration logs attached to a ticket.
-- This is the table that makes Triage more than a CRUD demo.
-- ON DELETE CASCADE: logs are meaningless without their ticket.
-- ---------------------------------------------------------------
CREATE TABLE ticket_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  occurred_at TIMESTAMPTZ NOT NULL,
  level       TEXT NOT NULL CHECK (level IN ('info', 'warn', 'error')),
  endpoint    TEXT,
  status_code INT,
  message     TEXT NOT NULL
);

-- ---------------------------------------------------------------
-- ticket_notes: internal agent notes.
-- author_id is RESTRICT-by-default: you can't delete a user who wrote notes.
-- (No ON DELETE clause = default NO ACTION, which enforces this.)
-- ---------------------------------------------------------------
CREATE TABLE ticket_notes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id  UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  author_id  UUID NOT NULL REFERENCES users(id),
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------
-- Indexes. Each one exists because a specific query needs it.
-- If you can't name the query, don't add the index.
-- ---------------------------------------------------------------

-- List view filters and sorts.
CREATE INDEX idx_tickets_status   ON tickets(status);
CREATE INDEX idx_tickets_priority ON tickets(priority);
CREATE INDEX idx_tickets_sla      ON tickets(sla_deadline);
CREATE INDEX idx_tickets_assigned ON tickets(assigned_to);

-- Detail panel: fetch logs for a ticket.
CREATE INDEX idx_logs_ticket ON ticket_logs(ticket_id);

-- "Which endpoints are failing?" — endpoint grouped by level.
CREATE INDEX idx_logs_endpoint_level ON ticket_logs(endpoint, level);

-- The core analytics query: error-level logs within a time window.
CREATE INDEX idx_logs_level_occurred_at ON ticket_logs(level, occurred_at);

-- ---------------------------------------------------------------
-- updated_at maintenance. Application code must NOT set updated_at.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tickets_set_updated_at
BEFORE UPDATE ON tickets
FOR EACH ROW EXECUTE FUNCTION set_updated_at();