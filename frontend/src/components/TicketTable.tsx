// components/TicketTable.tsx
//
// The ticket list, rendered as a table.
//
// Design decisions in this file:
//
// 1. Semantic <table>, not a grid of <div>s.
//    Screen readers, keyboard navigation, and copy-paste all work
//    naturally with <table>. A div-grid requires re-implementing all of
//    that. The visual result is identical; the accessibility isn't.
//
// 2. The whole row is clickable, not just the ID.
//    Large click targets. Support agents scanning a queue shouldn't have
//    to aim for a small link. We wrap the row's primary cells in an <a>
//    at the CSS level instead of nesting <a> in every cell — more on that
//    in the CSS file.
//
// 3. No SLA countdown yet.
//    Step 10 owns that. For now the SLA column shows the raw deadline
//    formatted as HH:MM. When we add the countdown, only this file and
//    a new SlaCell component change.
//
// 4. Empty state is explicit.
//    If the API returns 0 tickets, "nothing here" is the correct render,
//    not an empty <tbody> that looks broken.

import type { TicketListItem } from '../types/ticket';
import PriorityBadge from './PriorityBadge';
import StatusBadge from './StatusBadge';
import './TicketTable.css';

interface TicketTableProps {
  tickets: TicketListItem[];
}

// Format an ISO timestamp as a short local time. We'll replace this with
// a real countdown in Step 10 — for now it's just readable.
function formatShortTime(iso: string): string {
  const d = new Date(iso);
  // toLocaleTimeString with these options gives e.g. "09:00" or "14:30".
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function TicketTable({ tickets }: TicketTableProps) {
  if (tickets.length === 0) {
    return (
      <div className="ticket-table-empty">
        No tickets match the current filters.
      </div>
    );
  }

  return (
    <table className="ticket-table">
      <thead>
        <tr>
          <th className="ticket-table-col-id">ID</th>
          <th className="ticket-table-col-subject">Subject</th>
          <th className="ticket-table-col-customer">Customer</th>
          <th className="ticket-table-col-priority">Priority</th>
          <th className="ticket-table-col-status">Status</th>
          <th className="ticket-table-col-sla">SLA</th>
          <th className="ticket-table-col-assigned">Assigned</th>
        </tr>
      </thead>
      <tbody>
        {tickets.map((ticket) => (
          <tr key={ticket.id} className="ticket-table-row">
            <td className="ticket-table-col-id">{ticket.external_id}</td>
            <td className="ticket-table-col-subject">{ticket.subject}</td>
            <td className="ticket-table-col-customer">
              {ticket.customer_name}
            </td>
            <td className="ticket-table-col-priority">
              <PriorityBadge priority={ticket.priority} />
            </td>
            <td className="ticket-table-col-status">
              <StatusBadge status={ticket.status} />
            </td>
            <td className="ticket-table-col-sla">
              {ticket.sla_deadline
                ? formatShortTime(ticket.sla_deadline)
                : '—'}
            </td>
            <td className="ticket-table-col-assigned">
              {ticket.assigned_to_name ?? (
                <span className="ticket-table-unassigned">Unassigned</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default TicketTable;