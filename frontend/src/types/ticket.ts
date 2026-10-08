// types/ticket.ts
// TypeScript types that mirror the backend API responses.
//
// These are hand-written, not generated. That's a deliberate choice for v0.1:
// generating types from an OpenAPI spec or a GraphQL schema is a real
// practice, but it's premature here. Hand-writing forces you to look at the
// actual JSON shape and notice when it changes.
//
// The contract with the backend: if a field is renamed in a SELECT, this
// file must change too. TypeScript will catch usages in the app, but it
// won't catch the drift automatically. When this project grows, we either
// generate types or share a package.

// A single ticket in the list view. Matches the SELECT in GET /api/tickets.
// Note: no `body`, no `escalated_at` — the list view doesn't return them.
export interface TicketListItem {
  id: string;
  external_id: string;
  subject: string;
  category: string;
  status: string;
  priority: string;
  sla_deadline: string | null;
  created_at: string;
  updated_at: string;
  customer_name: string;
  customer_plan: string;
  assigned_to_name: string | null;
}

// Response shape for GET /api/tickets.
export interface TicketListResponse {
  tickets: TicketListItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

// A log entry nested inside a ticket detail response.
export interface TicketLog {
  id: string;
  occurred_at: string;
  level: 'info' | 'warn' | 'error';
  endpoint: string | null;
  status_code: number | null;
  message: string;
}

// A note nested inside a ticket detail response.
export interface TicketNote {
  id: string;
  author_id: string;
  author_name: string | null;
  body: string;
  created_at: string;
}

// Full ticket detail. Matches GET /api/tickets/:id.
// Superset of TicketListItem: adds body, escalated_at, customer_id,
// customer_region, assigned_to_id, logs, notes.
export interface TicketDetail {
  id: string;
  external_id: string;
  subject: string;
  body: string;
  category: string;
  status: string;
  priority: string;
  created_at: string;
  updated_at: string;
  sla_deadline: string | null;
  escalated_at: string | null;
  customer_id: string;
  customer_name: string;
  customer_plan: string;
  customer_region: string | null;
  assigned_to_id: string | null;
  assigned_to_name: string | null;
  logs: TicketLog[];
  notes: TicketNote[];
}

export interface TicketDetailResponse {
  ticket: TicketDetail;
}

// One row of the top-customers analysis.
// error_count comes as a string from the backend (pg returns bigint as string).
// We convert to number at the API boundary in api/client.ts so the rest of
// the app can treat it as a number.
export interface TopCustomer {
  customer_id: string;
  customer_name: string;
  plan: string;
  error_count: number;
}

export interface TopCustomersResponse {
  customers: TopCustomer[];
}

// Standard error shape from the backend. Every error response uses { error: string }.
export interface ApiError {
  error: string;
}