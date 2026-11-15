// Reminder engine – pure part. Expands schedules into concrete dose instances
// and decides each dose's status. The device-specific part (scheduling OS
// notifications) lives in src/services/notifications.ts and calls into this.

import type { DoseLog, DoseStatus, Schedule, ScheduledDose } from './types';
import { MINUTE, dateRange, isValidDateKey, isValidTime, localDateTime, parseDateKey } from './time';

export const DEFAULT_GRACE_MINUTES = 60;

export function doseId(scheduleId: string, date: string, time: string): string {
  return `${scheduleId}@${date}T${time}`;
}

export function parseDoseId(id: string): { scheduleId: string; date: string; time: string } | null {
  const m = /^(.+)@(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(id);
  if (!m) return null;
  return { scheduleId: m[1], date: m[2], time: m[3] };
}

export function validateSchedule(s: Pick<Schedule, 'time' | 'daysOfWeek' | 'startDate' | 'endDate'>): string[] {
  const errors: string[] = [];
  if (!isValidTime(s.time)) errors.push('Time must be HH:MM (24-hour).');
  if (!isValidDateKey(s.startDate)) errors.push('Start date must be YYYY-MM-DD.');
  if (s.endDate !== null && !isValidDateKey(s.endDate)) errors.push('End date must be YYYY-MM-DD.');
  if (s.endDate !== null && isValidDateKey(s.startDate) && s.endDate < s.startDate)
    errors.push('End date is before start date.');
  if (s.daysOfWeek.some((d) => d < 0 || d > 6 || !Number.isInteger(d))) errors.push('Invalid day of week.');
  return errors;
}

export function scheduleOccursOn(s: Schedule, date: string): boolean {
  if (date < s.startDate) return false;
  if (s.endDate !== null && date > s.endDate) return false;
  if (s.daysOfWeek.length === 0) return true;
  return s.daysOfWeek.includes(parseDateKey(date).getDay());
}

/**
 * All dose instances whose local date is in [fromDate, toDate] (inclusive),
 * sorted by time. Deterministic ids mean regenerating never duplicates.
 */
export function generateDoses(schedules: Schedule[], fromDate: string, toDate: string): ScheduledDose[] {
  const days = dateRange(fromDate, toDate);
  const out: ScheduledDose[] = [];
  for (const s of schedules) {
    if (!isValidTime(s.time)) continue;
    for (const date of days) {
      if (!scheduleOccursOn(s, date)) continue;
      out.push({
        id: doseId(s.id, date, s.time),
        scheduleId: s.id,
        medicationId: s.medicationId,
        date,
        time: s.time,
        at: localDateTime(date, s.time),
      });
    }
  }
  return out.sort((a, b) => a.at - b.at || a.medicationId.localeCompare(b.medicationId));
}

/**
 * Status of one dose at time `now`.
 *  - a log always wins (taken / skipped / missed)
 *  - before the scheduled time  -> upcoming
 *  - within the grace period    -> due
 *  - after the grace period     -> missed (auto)
 */
export function doseStatus(dose: Pick<ScheduledDose, 'at'>, log: DoseLog | undefined, now: number, graceMinutes: number): DoseStatus {
  if (log) return log.status;
  if (now < dose.at) return 'upcoming';
  if (now <= dose.at + graceMinutes * MINUTE) return 'due';
  return 'missed';
}

/**
 * Doses that have passed their grace period without a log. The app writes
 * these as `missed` logs with source "auto" so history is explicit and a
 * caregiver alert (future work) has a concrete record to react to.
 */
export function findAutoMissed(doses: ScheduledDose[], logsByDose: Map<string, DoseLog>, now: number, graceMinutes: number): ScheduledDose[] {
  return doses.filter((d) => !logsByDose.has(d.id) && now > d.at + graceMinutes * MINUTE);
}

/**
 * The rolling notification window. iOS keeps only the 64 soonest pending
 * local notifications, so we schedule at most `limit` future doses and
 * re-run this on every app open / data change (P3 risk R2 mitigation).
 */
export function notificationWindow(doses: ScheduledDose[], logsByDose: Map<string, DoseLog>, now: number, limit = 60): ScheduledDose[] {
  return doses.filter((d) => d.at > now && !logsByDose.has(d.id)).slice(0, limit);
}

/**
 * Drop doses whose grace period had already ended before the medication was
 * added – otherwise adding a twice-daily medication at 10 PM would instantly
 * show the 8 AM dose as "missed". Doses that have a log (e.g. imported or
 * back-filled history) are always kept.
 */
export function dropPreCreationDoses(doses: ScheduledDose[], createdAtByMed: Map<string, number>, logsByDose: Map<string, DoseLog>, graceMinutes: number): ScheduledDose[] {
  return doses.filter((d) => {
    if (logsByDose.has(d.id)) return true;
    const created = createdAtByMed.get(d.medicationId);
    return created === undefined || d.at + graceMinutes * MINUTE >= created;
  });
}

export function dosesPerDay(schedules: Schedule[], onDate: string): number {
  return schedules.filter((s) => scheduleOccursOn(s, onDate)).length;
}
