// components/PriorityBadge.tsx
//
// Small colored chip for ticket priority. Extracted into its own
// component for two reasons:
//   1. Reused in the table row, the detail panel, and the analysis view.
//   2. The color mapping (priority -> CSS class) lives in one place.
//      When we add "urgent" priority in v0.2, this file changes and
//      every usage updates automatically.
//
// Styles are in a separate CSS file, keyed off the class name.

interface PriorityBadgeProps {
  priority: string;
}

function PriorityBadge({ priority }: PriorityBadgeProps) {
  // The priority comes from the DB, which has a CHECK constraint. It's
  // guaranteed to be one of these four values. But we don't assume that
  // at the type level — the DB constraint is the enforcement, and this
  // switch is presentation.
  const className = `badge badge-priority badge-priority--${priority}`;
  return <span className={className}>{priority}</span>;
}

export default PriorityBadge;