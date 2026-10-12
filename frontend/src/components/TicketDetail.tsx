// components/TicketDetail.tsx
//
// The ticket detail drawer. Renders when the URL is /tickets/:id.
//
// This component is "dumb" in the sense that it doesn't fetch its own
// data — the parent (TicketsPage) fetches and passes the ticket in. Why:
//   - The parent knows the :id from the URL. One place that reads routing.
//   - Loading and error states for the detail fetch belong next to the
//     list's states, so we can show a unified "something is loading" UI.
//   - The drawer becomes testable: pass a ticket prop, assert it renders.
//
// Layout: header (external ID + close button + status/priority badges),
// meta (customer + agent + SLA), body, logs table, notes list.

import type { TicketDetail as TicketDetailType } from '../types/ticket';
import { formatSlaCell, getSlaState } from '../utils/sla';
import PriorityBadge from './PriorityBadge';
import StatusBadge from './StatusBadge';
import './TicketDetail.css';

interface TicketDetailProps {
  ticket: TicketDetailType;
  now: number;
  onClose: () => void;
}

// Format an ISO timestamp as a compact local datetime for the log rows.
// Uses the browser's locale. For a support tool, showing local time of
// the viewer is usually what you want — agents read "when did this
// happen" in their own timezone.
function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString([], {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function TicketDetail({ ticket, now, onClose }: TicketDetailProps) {
  const slaState = getSlaState(ticket.sla_deadline, now);
  const slaText = formatSlaCell(ticket.sla_deadline, now);

  return (
    <aside
      className="ticket-detail"
      // `role="complementary"` tells screen readers this is a side panel,
      // not main content. It pairs with the list, doesn't replace it.
      // `aria-label` gives it an accessible name for navigation.
      role="complementary"
      aria-label={`Ticket ${ticket.external_id} detail`}
    >
      <header className="ticket-detail__header">
        <div className="ticket-detail__title">
          <span className="ticket-detail__id">{ticket.external_id}</span>
          <PriorityBadge priority={ticket.priority} />
          <StatusBadge status={ticket.status} />
        </div>
        <button
          type="button"
          className="ticket-detail__close"
          onClick={onClose}
          aria-label="Close detail panel"
        >
          ×
        </button>
      </header>

      <h2 className="ticket-detail__subject">{ticket.subject}</h2>

      <dl className="ticket-detail__meta">
        <div className="ticket-detail__meta-item">
          <dt>Customer</dt>
          <dd>
            {ticket.customer_name}
            <span className="ticket-detail__meta-sub">
              {' '}({ticket.customer_plan})
            </span>
          </dd>
        </div>
        <div className="ticket-detail__meta-item">
          <dt>Assigned</dt>
          <dd>{ticket.assigned_to_name ?? 'Unassigned'}</dd>
        </div>
        <div className="ticket-detail__meta-item">
          <dt>SLA</dt>
          <dd className={`sla sla--${slaState}`}>{slaText}</dd>
        </div>
        <div className="ticket-detail__meta-item">
          <dt>Created</dt>
          <dd>{formatDateTime(ticket.created_at)}</dd>
        </div>
      </dl>

      <section className="ticket-detail__section">
        <h3 className="ticket-detail__section-title">Description</h3>
        <p className="ticket-detail__body">{ticket.body}</p>
      </section>

      <section className="ticket-detail__section">
        <h3 className="ticket-detail__section-title">
          Logs ({ticket.logs.length})
        </h3>
        {ticket.logs.length === 0 ? (
          <p className="ticket-detail__empty">No logs attached.</p>
        ) : (
          <table className="log-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Level</th>
                <th>Endpoint</th>
                <th>Code</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              {ticket.logs.map((log) => (
                <tr key={log.id} className={`log-row log-row--${log.level}`}>
                  <td className="log-cell log-cell--time">
                    {formatDateTime(log.occurred_at)}
                  </td>
                  <td className="log-cell log-cell--level">{log.level}</td>
                  <td className="log-cell log-cell--endpoint">
                    {log.endpoint ?? '—'}
                  </td>
                  <td className="log-cell log-cell--code">
                    {log.status_code ?? '—'}
                  </td>
                  <td className="log-cell log-cell--message">{log.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="ticket-detail__section">
        <h3 className="ticket-detail__section-title">
          Notes ({ticket.notes.length})
        </h3>
        {ticket.notes.length === 0 ? (
          <p className="ticket-detail__empty">No internal notes yet.</p>
        ) : (
          <ul className="note-list">
            {ticket.notes.map((note) => (
              <li key={note.id} className="note-item">
                <div className="note-item__meta">
                  <span className="note-item__author">
                    {note.author_name ?? 'Unknown'}
                  </span>
                  <span className="note-item__time">
                    {formatDateTime(note.created_at)}
                  </span>
                </div>
                <p className="note-item__body">{note.body}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
}

export default TicketDetail;