// pages/TicketsPage.tsx
//
// The ticket list page.
//
// Filters are stored in the URL query string, not in React state. That
// means:
//   - Refresh keeps the filters.
//   - The URL is shareable ("look at these tickets" is a link).
//   - Browser back/forward work as expected.
//
// Three things this file has to get right, because they're the common
// bugs with this pattern:
//
//   1. Reading from useSearchParams every render can cause an infinite
//      loop if the resulting object is put directly into a useEffect
//      dependency array. We depend on `status`, `priority`, and `page`
//      *values* (strings/numbers), not on the searchParams object.
//
//   2. Changing a filter must reset page to 1. If you're on page 3 of
//      60 tickets and filter down to 5 tickets, page 3 doesn't exist
//      in that filtered set. Reset on every filter change.
//
//   3. The URL only stores strings. An absent param and an empty-string
//      param should behave identically to the API. We pass `undefined`
//      to fetchTickets for empty strings, so URLSearchParams strips them.

import { useEffect, useState } from 'react';
import { useSearchParams, useParams, useNavigate } from 'react-router-dom';
import { fetchTickets, fetchTicketDetail } from '../api/client';
import type {
  TicketListResponse,
  TicketDetail as TicketDetailType,
} from '../types/ticket';
import TicketTable from '../components/TicketTable';
import TicketFilters from '../components/TicketFilters';
import Pagination from '../components/Pagination';
import TicketDetail from '../components/TicketDetail';

function TicketsPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Read filters from URL. Missing param -> empty string -> treated as
  // "no filter". This normalization happens once here, not scattered
  // through the component.
  const status = searchParams.get('status') ?? '';
  const priority = searchParams.get('priority') ?? '';
  const page = Number(searchParams.get('page') ?? '1');

  const [data, setData] = useState<TicketListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());

  const { id: detailId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [detail, setDetail] = useState<TicketDetailType | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Fetch the ticket detail whenever the URL's :id changes. If the URL
  // has no :id, we skip the fetch and clear state.
  useEffect(() => {
    if (!detailId) {
      setDetail(null);
      setDetailError(null);
      setDetailLoading(false);
      return;
    }

    setDetailLoading(true);
    setDetailError(null);
    setDetail(null); // clear previous detail so we don't flash old data

    fetchTicketDetail(detailId)
      .then((res) => setDetail(res.ticket))
      .catch((err: Error) => setDetailError(err.message))
      .finally(() => setDetailLoading(false));
  }, [detailId]);

  // Fetch when any filter changes.
  //
  // Dependencies are primitive values (status, priority, page), NOT the
  // searchParams object. searchParams is a fresh object every render,
  // so depending on it would refetch on every render forever.
  useEffect(() => {
    setLoading(true);
    setError(null);

    fetchTickets({
      status: status || undefined,
      priority: priority || undefined,
      page,
      limit: 50,
    })
      .then(setData)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [status, priority, page]);

  // 60-second ticker for the SLA column.
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  function handleRowClick(ticketId: string) {
    // Navigate to the detail URL. Because TicketsPage is rendered for
    // BOTH /tickets and /tickets/:id (see App.tsx), navigating here does
    // not unmount the list — only the :id param changes, and the detail
    // fetch effect fires.
    //
    // Preserve the current query string (filters, page) so closing the
    // detail returns to the exact same list state.
    navigate({
      pathname: `/tickets/${ticketId}`,
      search: searchParams.toString(),
    });
  }

  function handleDetailClose() {
    // Return to /tickets, keeping any existing filters in the URL.
    navigate({
      pathname: '/tickets',
      search: searchParams.toString(),
    });
  }

  // Called by TicketFilters when the user changes a dropdown.
  function handleFilterChange(key: 'status' | 'priority', value: string) {
    const next = new URLSearchParams(searchParams);

    if (value === '') {
      // Empty value means "clear this filter." Remove the param entirely
      // rather than setting it to "". Cleaner URLs, and both behave the
      // same to the backend.
      next.delete(key);
    } else {
      next.set(key, value);
    }

    // Reset to page 1. Changing a filter while on page 3 would otherwise
    // show an empty page if the filtered set has fewer pages.
    next.delete('page');

    setSearchParams(next);
  }

  // Called by the Pagination component. Writes `page` to the URL.
  function handlePageChange(newPage: number) {
    const next = new URLSearchParams(searchParams);
    if (newPage <= 1) {
      next.delete('page');
    } else {
      next.set('page', String(newPage));
    }
    setSearchParams(next);

    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  return (
    <div>
      <div className="page-header">
        <h1>Tickets</h1>
        {data && (
          <span className="page-header-meta">{data.pagination.total} total</span>
        )}
      </div>

      <TicketFilters
        status={status}
        priority={priority}
        onChange={handleFilterChange}
      />

      {loading && (
        <div className="page-loading">
          Loading tickets…
          <span
            style={{
              display: 'block',
              fontSize: 12,
              color: 'var(--color-text-dim)',
              marginTop: 4,
            }}
          >
            The backend may take 30–60 seconds to wake up on the first request.
          </span>
        </div>
      )}

      {error && (
        <div className="page-error">
          <strong>Could not load tickets.</strong>
          <div>{error}</div>
        </div>
      )}

      {!loading && !error && data && (
        <>
          <TicketTable
            tickets={data.tickets}
            now={now}
            onRowClick={handleRowClick}
          />
          <Pagination
            currentPage={data.pagination.page}
            totalPages={data.pagination.total_pages}
            onChange={handlePageChange}
          />
        </>
      )}

      {detailId && detailLoading && (
        <aside className="ticket-detail ticket-detail--loading">
          Loading ticket…
        </aside>
      )}

      {detailId && detailError && (
        <aside className="ticket-detail ticket-detail--error">
          <header className="ticket-detail__header">
            <strong>Could not load ticket</strong>
            <button
              type="button"
              className="ticket-detail__close"
              onClick={handleDetailClose}
              aria-label="Close detail panel"
            >
              ×
            </button>
          </header>
          <p>{detailError}</p>
        </aside>
      )}

      {detail && (
        <TicketDetail ticket={detail} now={now} onClose={handleDetailClose} />
      )}
    </div>
  );
}

export default TicketsPage;