// Adherence calculation (FR6). Kept pure so it can be checked against
// hand-calculated values on a seeded 30-day data set (P3 evaluation E1).

import type { DoseLog, DoseStatus, ScheduledDose } from './types';
import { doseStatus } from './schedule';

export interface AdherenceSummary {
  taken: number;
  skipped: number;
  missed: number;
  /** Doses whose outcome is known (taken + skipped + missed). Pending doses are excluded. */
  resolved: number;
  /** taken / resolved, 0–100, or null when there is nothing to measure yet. */
  percent: number | null;
}

export interface DailyAdherence extends AdherenceSummary {
  date: string;
}

function summarize(statuses: DoseStatus[]): AdherenceSummary {
  let taken = 0;
  let skipped = 0;
  let missed = 0;
  for (const s of statuses) {
    if (s === 'taken') taken++;
    else if (s === 'skipped') skipped++;
    else if (s === 'missed') missed++;
  }
  const resolved = taken + skipped + missed;
  return { taken, skipped, missed, resolved, percent: resolved === 0 ? null : Math.round((taken / resolved) * 1000) / 10 };
}

export function computeAdherence(doses: ScheduledDose[], logsByDose: Map<string, DoseLog>, now: number, graceMinutes: number): AdherenceSummary {
  return summarize(doses.map((d) => doseStatus(d, logsByDose.get(d.id), now, graceMinutes)));
}

export function dailyAdherence(doses: ScheduledDose[], logsByDose: Map<string, DoseLog>, now: number, graceMinutes: number, dates: string[]): DailyAdherence[] {
  const byDate = new Map<string, DoseStatus[]>();
  for (const date of dates) byDate.set(date, []);
  for (const d of doses) {
    const bucket = byDate.get(d.date);
    if (bucket) bucket.push(doseStatus(d, logsByDose.get(d.id), now, graceMinutes));
  }
  return dates.map((date) => ({ date, ...summarize(byDate.get(date) ?? []) }));
}

export function adherenceByMedication(doses: ScheduledDose[], logsByDose: Map<string, DoseLog>, now: number, graceMinutes: number): Map<string, AdherenceSummary> {
  const groups = new Map<string, ScheduledDose[]>();
  for (const d of doses) {
    const g = groups.get(d.medicationId) ?? [];
    g.push(d);
    groups.set(d.medicationId, g);
  }
  const out = new Map<string, AdherenceSummary>();
  for (const [medId, g] of groups) out.set(medId, computeAdherence(g, logsByDose, now, graceMinutes));
  return out;
}

export function indexLogs(logs: DoseLog[]): Map<string, DoseLog> {
  const m = new Map<string, DoseLog>();
  // Later records win, so an edit (e.g. Missed -> Taken) replaces the earlier one.
  // The sort is stable: records with the same timestamp keep insertion order
  // (the repository returns them ordered by recorded_at, rowid).
  for (const l of [...logs].sort((a, b) => a.recordedAt - b.recordedAt)) m.set(l.doseId, l);
  return m;
}
