// utils/sla.ts
//
// SLA state and formatting logic. Pure functions, no React, no side effects.
//
// Three exports:
//   - getSlaState(deadline, now): 'none' | 'breached' | 'at_risk' | 'on_track'
//   - formatSlaDuration(ms): compact string like "2h 14m", "47m", "3d 4h"
//   - formatSlaCell(deadline, now): the full text for the table cell
//
// Keeping the state decision separate from the display decision means we
// can reuse getSlaState for row highlighting, sorting, filtering, without
// touching the display string.

// Threshold: an SLA is "at risk" when this many milliseconds or fewer
// remain. One hour, per the design decision.
//
// Note: this constant is the single point of change if we ever decide
// at-risk should be 30 minutes or 2 hours. Do not inline the number.
const AT_RISK_THRESHOLD_MS = 60 * 60 * 1000;

export type SlaState = 'none' | 'breached' | 'at_risk' | 'on_track';

export function getSlaState(
  deadline: string | null,
  now: number,
): SlaState {
  // Null deadline = ticket has no SLA. This is a real case (low-priority
  // tickets without an SLA policy), not a data error. Handle it explicitly.
  if (deadline === null) return 'none';

  const deadlineMs = new Date(deadline).getTime();
  const remaining = deadlineMs - now;

  // Breached: the deadline is in the past. Not "< 0", because exactly
  // 0 is also breached — the SLA has been used up.
  if (remaining <= 0) return 'breached';

  // At risk: within the threshold of breaching.
  if (remaining <= AT_RISK_THRESHOLD_MS) return 'at_risk';

  return 'on_track';
}

// Format a millisecond duration as a compact human string.
//
// Rules:
//   - >= 1 day:  "3d 4h"
//   - >= 1 hour: "2h 14m"
//   - < 1 hour:  "47m"
//   - < 1 minute: "<1m"
//
// We deliberately do NOT show seconds. Sub-minute precision is noise in
// a queue that ticks once per minute.
export function formatSlaDuration(ms: number): string {
  // Negative durations would arise from breached deadlines. The caller
  // should use formatSlaCell, which handles the breached case separately,
  // but we guard here too so this function is safe to call blindly.
  if (ms <= 0) return '0m';

  const totalMinutes = Math.floor(ms / (60 * 1000));
  const totalHours = Math.floor(totalMinutes / 60);
  const totalDays = Math.floor(totalHours / 24);

  if (totalDays >= 1) {
    const hoursRemainder = totalHours - totalDays * 24;
    return `${totalDays}d ${hoursRemainder}h`;
  }

  if (totalHours >= 1) {
    const minutesRemainder = totalMinutes - totalHours * 60;
    return `${totalHours}h ${minutesRemainder}m`;
  }

  if (totalMinutes >= 1) {
    return `${totalMinutes}m`;
  }

  return '<1m';
}

// The full text for the SLA cell.
//
// This is the only place that decides what the cell says. The cell
// component just renders it. If the format changes — e.g., "in 2h 14m"
// instead of "2h 14m" — this function changes and the cell doesn't.
export function formatSlaCell(
  deadline: string | null,
  now: number,
): string {
  const state = getSlaState(deadline, now);

  if (state === 'none') return '—';
  if (state === 'breached') return 'BREACHED';

  const remaining = new Date(deadline!).getTime() - now;
  return formatSlaDuration(remaining);
}