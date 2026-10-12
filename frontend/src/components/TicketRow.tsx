// components/TicketRow.tsx
//
// One row of the ticket table.
//
// Extracted from TicketTable for two reasons:
//   1. React's hydration warning about whitespace text nodes inside <tr>
//      disappears when the row is a component — the <td> siblings inside
//      a component aren't checked the same way as direct table children.
//   2. Per-row logic (cursor, click handler) stays with the row rather
//      than being spread through the parent's map.
//
// The `onRowClick` prop is optional — same reasoning as TicketTable.
// When omitted, the row is read-only.

import type { TicketListItem } from '../types/ticket';
import PriorityBadge from './PriorityBadge';
import StatusBadge from './StatusBadge';
import SlaCell from './SlaCell';

interface TicketRowProps {
  ticket: TicketListItem;
  now: number;
  onRowClick?: (id: string) => void;
}

function TicketRow({ ticket, now, onRowClick }: TicketRowProps) {
  const clickable = Boolean(onRowClick);

  return (
    <tr
      className={
        clickable
          ? 'ticket-table-row ticket-table-row--clickable'
          : 'ticket-table-row'
      }
      onClick={() => onRowClick?.(ticket.id)}
    >
      <td className="ticket-table-col-id">{ticket.external_id}</td>
      <td className="ticket-table-col-subject">{ticket.subject}</td>
      <td className="ticket-table-col-customer">{ticket.customer_name}</td>
      <td className="ticket-table-col-priority">
        <PriorityBadge priority={ticket.priority} />
      </td>
      <td className="ticket-table-col-status">
        <StatusBadge status={ticket.status} />
      </td>
      <td className="ticket-table-col-sla">
        <SlaCell deadline={ticket.sla_deadline} now={now} />
      </td>
      <td className="ticket-table-col-assigned">
        {ticket.assigned_to_name ?? (
          <span className="ticket-table-unassigned">Unassigned</span>
        )}
      </td>
    </tr>
  );
}

export default TicketRow;