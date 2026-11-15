// Dose Log and History use cases (FR4, FR5, FR6) used by the screens.

import type { Db } from '../data/schema';
import * as repo from '../data/repo';
import { doseStatus, dropPreCreationDoses, findAutoMissed, generateDoses } from '../core/schedule';
import { indexLogs, computeAdherence, dailyAdherence, adherenceByMedication } from '../core/adherence';
import { decrementSupply } from '../core/refill';
import { addDays, dateKey, dateRange, DAY, localDateTime } from '../core/time';
import type { DoseLog, DoseStatus, LoggedStatus, Medication, ScheduledDose } from '../core/types';

export interface DoseItem {
  dose: ScheduledDose;
  med: Medication;
  status: DoseStatus;
  log: DoseLog | undefined;
}

const createdMap = (meds: Medication[]) => new Map(meds.map((m) => [m.id, Date.parse(m.createdAt)]));

export async function loadDoses(db: Db, profileId: string, fromDate: string, toDate: string, graceMinutes: number, now = Date.now()): Promise<DoseItem[]> {
  const meds = await repo.listMedications(db, profileId, true);
  const medById = new Map(meds.map((m) => [m.id, m]));
  const schedules = (await repo.listSchedules(db, meds.map((m) => m.id))).filter((s) => medById.get(s.medicationId)?.active);
  const logs = indexLogs(await repo.listLogs(db, meds.map((m) => m.id), localDateTime(fromDate, '00:00'), localDateTime(toDate, '23:59') + 60_000));
  const doses = dropPreCreationDoses(generateDoses(schedules, fromDate, toDate), createdMap(meds), logs, graceMinutes);
  return doses.map((d) => ({ dose: d, med: medById.get(d.medicationId)!, log: logs.get(d.id), status: doseStatus(d, logs.get(d.id), now, graceMinutes) }));
}

/** Write explicit "missed" records for doses past the grace period (last 14 days). */
export async function applyAutoMissed(db: Db, graceMinutes: number, now = Date.now()): Promise<number> {
  const profiles = await repo.listProfiles(db);
  let written = 0;
  for (const p of profiles) {
    const meds = await repo.listMedications(db, p.id, false);
    if (!meds.length) continue;
    const schedules = await repo.listSchedules(db, meds.map((m) => m.id));
    const today = dateKey(now);
    const from = addDays(today, -14);
    const logs = indexLogs(await repo.listLogs(db, meds.map((m) => m.id), localDateTime(from, '00:00'), now + DAY));
    const doses = dropPreCreationDoses(generateDoses(schedules, from, today), createdMap(meds), logs, graceMinutes);
    for (const d of findAutoMissed(doses, logs, now, graceMinutes)) {
      await repo.recordDose(db, { doseId: d.id, medicationId: d.medicationId, scheduledAt: d.at }, 'missed', 'auto', now);
      written++;
    }
  }
  return written;
}

/** Record Taken/Skipped/Missed from the app; keeps the supply count consistent when a record is corrected. */
export async function markDose(db: Db, item: Pick<DoseItem, 'dose' | 'med' | 'log'>, status: LoggedStatus): Promise<DoseLog> {
  const prev = item.log?.status;
  const log = await repo.recordDose(db, { doseId: item.dose.id, medicationId: item.med.id, scheduledAt: item.dose.at }, status, 'app');
  const med = await repo.getMedication(db, item.med.id);
  if (med && med.supplyRemaining !== null) {
    if (status === 'taken' && prev !== 'taken') await repo.updateMedication(db, med.id, { supplyRemaining: decrementSupply(med) });
    if (prev === 'taken' && status !== 'taken') await repo.updateMedication(db, med.id, { supplyRemaining: med.supplyRemaining + med.quantityPerDose });
  }
  return log;
}

/** An extra / as-needed dose that is not on the schedule. */
export async function logExtraDose(db: Db, med: Medication, at = Date.now()): Promise<DoseLog> {
  const log = await repo.recordDose(db, { doseId: `prn@${at}`, medicationId: med.id, scheduledAt: at }, 'taken', 'app', at);
  const cur = await repo.getMedication(db, med.id);
  if (cur) await repo.updateMedication(db, cur.id, { supplyRemaining: decrementSupply(cur) });
  return log;
}

export async function loadAdherence(db: Db, profileId: string, days: number, graceMinutes: number, now = Date.now()) {
  const today = dateKey(now);
  const from = addDays(today, -(days - 1));
  const items = await loadDoses(db, profileId, from, today, graceMinutes, now);
  const doses = items.map((i) => i.dose);
  const logs = new Map<string, DoseLog>();
  for (const i of items) if (i.log) logs.set(i.dose.id, i.log);
  return {
    items,
    overall: computeAdherence(doses, logs, now, graceMinutes),
    daily: dailyAdherence(doses, logs, now, graceMinutes, dateRange(from, today)),
    byMedication: adherenceByMedication(doses, logs, now, graceMinutes),
  };
}
