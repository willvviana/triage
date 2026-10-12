// components/TicketFilters.tsx
//
// Filter controls for the ticket list. Two dropdowns: status, priority.
//
// This component does NOT own filter state. It receives the current
// values and calls `onChange` when the user picks something. The page
// decides what to do with that (in our case: write to the URL).
//
// Why "controlled component" (values from props, changes via callback):
//   - The URL is the source of truth, not this component.
//   - This component could be reused with a different data source
//     (e.g., local state, a query store) without changing its internals.
//   - Makes the component testable in isolation: pass values, assert
//     it renders the right option as selected.
//
// Placeholder pattern: the first option is "(All)" with value ''. An
// empty string means "no filter." This is deliberate — the backend treats
// a missing param and an empty param the same way (both = no filter), so
// we normalize to '' on the client and strip empty values when building
// the request.

import './TicketFilters.css';

const STATUSES = ['open', 'pending', 'waiting', 'escalated', 'resolved'] as const;
const PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;

interface TicketFiltersProps {
  status: string;
  priority: string;
  onChange: (key: 'status' | 'priority', value: string) => void;
}

function TicketFilters({ status, priority, onChange }: TicketFiltersProps) {
  return (
    <div className="filters">
      <label className="filters-field">
        <span className="filters-label">Status</span>
        <select
          className="filters-select"
          value={status}
          onChange={(e) => onChange('status', e.target.value)}
        >
          <option value="">All</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>

      <label className="filters-field">
        <span className="filters-label">Priority</span>
        <select
          className="filters-select"
          value={priority}
          onChange={(e) => onChange('priority', e.target.value)}
        >
          <option value="">All</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

export default TicketFilters;