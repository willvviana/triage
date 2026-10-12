// components/TicketTable.tsx
//
// The ticket list, rendered as a table.
// Row rendering is delegated to TicketRow. This file owns the table
// structure and the empty state.

import type { TicketListItem } from '../types/ticket';
import TicketRow from './TicketRow';
import './TicketTable.css';

interface TicketTableProps {
  tickets: TicketListItem[];
  now: number;
  onRowClick?: (id: string) => void;
}

function TicketTable({ tickets, now, onRowClick }: TicketTableProps) {
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
          <TicketRow
            key={ticket.id}
            ticket={ticket}
            now={now}
            onRowClick={onRowClick}
          />
        ))}
      </tbody>
    </table>
  );
}

export default TicketTable;