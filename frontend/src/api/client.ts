// api/client.ts
// Thin fetch wrapper. One place that knows the base URL, handles JSON
// parsing, throws on non-2xx, and normalizes the shapes the backend sends.
//
// Why a wrapper instead of fetch() at each call site:
//   1. Base URL in one place. When you deploy, you change VITE_API_URL
//      once, not every fetch call.
//   2. Non-2xx handling. Every call site would otherwise need
//      `if (!res.ok) throw ...`. That's noise.
//   3. Response normalization. error_count arrives as a string; we
//      convert it here so downstream code deals with numbers.

import type {
  ApiError,
  TicketDetailResponse,
  TicketListResponse,
  TopCustomersResponse,
} from '../types/ticket';

// Vite exposes env vars that start with VITE_ to the client bundle.
// This is safe because it's a public URL, not a secret. Do NOT put
// secrets in VITE_ vars — they end up in the JS the browser downloads.
const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:3001';

// Custom error type. Distinguishes "the backend said no" (400/404/500 with
// a JSON body) from "the network is down" (fetch threw). Components can
// catch this and render the right message.
export class ApiRequestError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

// Core request function. Not exported directly — the typed helpers below
// call it so every endpoint gets the same treatment.
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...init?.headers,
      },
    });
  } catch (err) {
    // fetch() only rejects on network failure (DNS, connection refused,
    // CORS preflight failure). HTTP errors are NOT rejections — they
    // arrive as a Response with ok: false.
    throw new ApiRequestError(0, `Network error: ${(err as Error).message}`);
  }

  // Try to parse the body regardless of status, because error responses
  // also have JSON bodies ({ error: "..." }). But the body might not be
  // valid JSON (e.g., a 502 from a proxy), so guard the parse.
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const message =
      body && typeof body === 'object' && 'error' in body
        ? String((body as ApiError).error)
        : `HTTP ${response.status}`;
    throw new ApiRequestError(response.status, message);
  }

  return body as T;
}

// ---------------------------------------------------------------------------
// Typed endpoint helpers.
// Each one is a thin wrapper that knows its own path and return type.
// ---------------------------------------------------------------------------

export interface TicketListParams {
  status?: string;
  priority?: string;
  page?: number;
  limit?: number;
}

export async function fetchTickets(
  params: TicketListParams = {},
): Promise<TicketListResponse> {
  // Build the query string manually. URLSearchParams handles escaping
  // and skips undefined values, so we don't send ?status=undefined.
  const qs = new URLSearchParams();
  if (params.status) qs.set('status', params.status);
  if (params.priority) qs.set('priority', params.priority);
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));

  const query = qs.toString();
  const path = `/api/tickets${query ? `?${query}` : ''}`;

  return request<TicketListResponse>(path);
}

export async function fetchTicketDetail(id: string): Promise<TicketDetailResponse> {
  return request<TicketDetailResponse>(`/api/tickets/${id}`);
}

export async function fetchTopCustomers(): Promise<TopCustomersResponse> {
  const raw = await request<TopCustomersResponse>('/api/analysis/top-customers');
  // Normalize error_count from string (pg bigint) to number. This is the
  // API boundary — downstream components should never see the string form.
  return {
    customers: raw.customers.map((c) => ({
      ...c,
      error_count: Number(c.error_count),
    })),
  };
}