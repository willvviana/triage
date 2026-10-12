// components/StatusBadge.tsx
//
// Same pattern as PriorityBadge. Status and priority are different
// concepts and get different visual treatments (priority is colored by
// severity, status is colored by lifecycle stage). Keeping them as
// separate components means neither has to know about the other.

interface StatusBadgeProps {
  status: string;
}

function StatusBadge({ status }: StatusBadgeProps) {
  const className = `badge badge-status badge-status--${status}`;
  return <span className={className}>{status}</span>;
}

export default StatusBadge;