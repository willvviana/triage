// pages/TicketsPage.tsx
//
// Fetches tickets and renders the table. Owns loading, error, and
// success states. Does NOT own the table layout — that's TicketTable's
// job. This separation means: when we add filters (Step 11), only the
// fetch call changes here; the table doesn't move.
//
// Loading/error/empty is three states, handled explicitly. The common
// bug is treating "data hasn't loaded yet" and "data loaded but empty"
// as the same thing. They're not: one should show a spinner, the other
// should show "no tickets."

import { useEffect, useState } from 'react';
import { fetchTickets } from '../api/client';
import type { TicketListResponse } from '../types/ticket';
import TicketTable from '../components/TicketTable';

function TicketsPage() {
  const [data, setData] = useState<TicketListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Current time in milliseconds. Updated once per minute by a timer
  // below. Passed down to the table so SLA cells re-render with fresh
  // values. This is the *single* timer for the whole page — the table
  // and its cells do not run their own timers.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setLoading(true);
    setError(null);

    fetchTickets({ limit: 50 })
      .then((response) => {
        setData(response);
      })
      .catch((err: Error) => {
        setError(err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  // Update `now` every 60 seconds. Returns a cleanup function that
  // clears the interval on unmount — without this, the timer keeps
  // running after navigating away, which leaks memory and causes
  // "state update on unmounted component" warnings.
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 60 * 1000);

    return () => clearInterval(interval);
  }, []);

    return (
    <div>
      <div className="page-header">
        <h1>Tickets</h1>
        {data && (
          <span className="page-header-meta">
            {data.pagination.total} total
          </span>
        )}
      </div>

      {!loading && !error && data && (
        <TicketTable tickets={data.tickets} now={now} />
      )}

      {loading && <div className="page-loading">Loading tickets…</div>}

      {error && (
        <div className="page-error">
          <strong>Could not load tickets.</strong>
          <div>{error}</div>
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-text-muted)' }}>
            Is the backend running at http://127.0.0.1:3001?
          </div>
        </div>
      )}
    </div>
  );
}

export default TicketsPage;