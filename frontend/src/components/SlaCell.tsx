// components/SlaCell.tsx
//
// Renders the SLA cell for one ticket.
//
// This is a *pure* component: it takes a deadline and the current time,
// and returns a <span>. It does NOT run a timer. The parent passes `now`
// down, which means one timer for the whole page, not one per row.
//
// The `now` prop is a millisecond timestamp, not a Date object. Why:
//   - Primitive number comparison is cheap and unambiguous in React.
//   - Passing a Date would create a new object every render of the parent,
//     which would defeat React.memo optimization if we later add it.
//
// Re-render behavior: whenever the parent's `now` changes, this component
// re-renders because `now` is a prop. That happens once per minute. That's
// fine for 50 rows.

import { formatSlaCell, getSlaState } from '../utils/sla';

interface SlaCellProps {
  deadline: string | null;
  now: number;
}

function SlaCell({ deadline, now }: SlaCellProps) {
  const state = getSlaState(deadline, now);
  const text = formatSlaCell(deadline, now);

  // CSS class is derived from the state. The component doesn't decide
  // colors — that's the stylesheet's job. This is the separation of
  // concerns: logic decides "at_risk", CSS decides what at_risk looks like.
  return <span className={`sla sla--${state}`}>{text}</span>;
}

export default SlaCell;