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
import { useSearchParams } from 'react-router-dom';
import { fetchTickets } from '../api/client';
import type { TicketListResponse } from '../types/ticket';
import TicketTable from '../components/TicketTable';
import TicketFilters from '../components/TicketFilters';
import Pagination from '../components/Pagination';

function TicketsPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Read filters from URL. Missing param -> empty string -> treated as
  // "no filter". This normalization happens once here, not scattered
  // through the component.
  const status = searchParams.get('status') ?? '';
  const priority = searchParams.get('priority') ?? '';

  // `page` is reserved for Step 12 — we read it here so the dependency
  // and the fetch call don't need to change when we add pagination
  // controls. For now it defaults to 1 and is never written.
  const page = Number(searchParams.get('page') ?? '1');

  const [data, setData] = useState<TicketListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());

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

  // 60-second ticker for the SLA column. Same as before.
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Called by TicketFilters when the user changes a dropdown.
  function handleFilterChange(key: 'status' | 'priority', value: string) {
    // Build a new params object from the current one. Mutating the
    // existing searchParams directly is not allowed (it's a read-only
    // view) and would be wrong anyway — we need a fresh object.
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
  //
  // If the user clicks page 1, we delete the `page` param entirely
  // instead of setting `page=1`. Two reasons:
  //   1. Cleaner URLs — the default state has no params.
  //   2. It avoids pushing a new history entry when clicking the
  //      already-active page 1, because React Router compares the
  //      resulting URL string, and it's identical.
  function handlePageChange(newPage: number) {
    const next = new URLSearchParams(searchParams);
    if (newPage <= 1) {
      next.delete('page');
    } else {
      next.set('page', String(newPage));
    }
    setSearchParams(next);

    // Scroll to top so the user isn't left at the bottom of the new page.
    // `behavior: 'instant'` rather than 'smooth' — smooth scroll on a
    // table that's about to re-render feels janky.
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

      {loading && <div className="page-loading">Loading tickets…</div>}

      {error && (
        <div className="page-error">
          <strong>Could not load tickets.</strong>
          <div>{error}</div>
        </div>
      )}

        {!loading && !error && data && (
        <>
        <TicketTable tickets={data.tickets} now={now} />
        <Pagination
         currentPage={data.pagination.page}
         totalPages={data.pagination.total_pages}
         onChange={handlePageChange}
        />
        </>
      )}
    </div>
  );
}

export default TicketsPage;