// components/Pagination.tsx
//
// Page navigation control. Prev / page numbers / next.
//
// The interesting part is `buildPageList`: given currentPage and
// totalPages, produce the list of page numbers to render, with ellipsis
// markers ('...') when there are gaps. This is a small algorithm and it's
// the kind of thing that separates a real UI from a toy one — most toy
// pagination just shows every page number, which breaks at 50 pages.
//
// Design: it does NOT own state. It receives currentPage, totalPages,
// and an onChange callback. Same controlled-component pattern as
// TicketFilters. The parent decides what to do with the new page.

import './Pagination.css';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onChange: (page: number) => void;
}

// Produce the array of page numbers and gaps to display.
//
// Strategy: always show page 1 and the last page. Show a window of
// +/- 1 around the current page. Insert '...' where numbers are skipped.
//
// Examples (currentPage, totalPages -> output):
//   1, 5  -> [1, 2, 3, 4, 5]
//   3, 10 -> [1, 2, 3, 4, '...', 10]
//   7, 10 -> [1, '...', 6, 7, 8, '...', 10]
//   10, 10 -> [1, '...', 9, 10]
//
// This is deliberately simple. More sophisticated pagination (e.g.,
// always showing 7 slots, or "back 5 / forward 5") is a v0.2 refinement.
function buildPageList(currentPage: number, totalPages: number): (number | '...')[] {
  // Small case: if total pages is small enough, show them all.
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pages: (number | '...')[] = [];

  // Always show page 1.
  pages.push(1);

  // Window around the current page.
  const windowStart = Math.max(2, currentPage - 1);
  const windowEnd = Math.min(totalPages - 1, currentPage + 1);

  // Gap between page 1 and the window start: use ellipsis.
  if (windowStart > 2) {
    pages.push('...');
  }

  // The window.
  for (let p = windowStart; p <= windowEnd; p++) {
    pages.push(p);
  }

  // Gap between window end and the last page: use ellipsis.
  if (windowEnd < totalPages - 1) {
    pages.push('...');
  }

  // Always show the last page.
  pages.push(totalPages);

  return pages;
}

function Pagination({ currentPage, totalPages, onChange }: PaginationProps) {
  // If there's only one page or none, don't render the control at all.
  // An empty or single-page pagination bar is visual noise.
  if (totalPages <= 1) return null;

  const pages = buildPageList(currentPage, totalPages);

  return (
    <div className="pagination">
      <button
        type="button"
        className="pagination-button"
        disabled={currentPage <= 1}
        onClick={() => onChange(currentPage - 1)}
      >
        ← Prev
      </button>

      {pages.map((p, idx) =>
        p === '...' ? (
          // The key for ellipsis uses the index because there can be two
          // ellipses and they'd collide if keyed by value.
          <span key={`ellipsis-${idx}`} className="pagination-ellipsis">
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            className={
              p === currentPage
                ? 'pagination-button pagination-button--active'
                : 'pagination-button'
            }
            onClick={() => onChange(p)}
          >
            {p}
          </button>
        ),
      )}

      <button
        type="button"
        className="pagination-button"
        disabled={currentPage >= totalPages}
        onClick={() => onChange(currentPage + 1)}
      >
        Next →
      </button>
    </div>
  );
}

export default Pagination;