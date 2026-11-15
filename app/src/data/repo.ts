// Data-access layer. Every screen and service goes through these functions,
// so SQL lives in one place and is covered by the Node test suite.

import type { Db } from './schema';
import { newId } from './ids';
import type { DoseLog, DrugLabel, EffectNote, LoggedStatus, Medication, Profile, Role, Schedule, Settings } from '../core/types';
import { DEFAULT_GRACE_MINUTES, validateSchedule } from '../core/schedule';
import { validateNote } from '../core/effects';

const nowIso = () => new Date().toISOString();

// ---------- row mappers ----------
const toProfile = (r: any): Profile => ({ id: r.id, name: r.name, relation: r.relation, createdAt: r.created_at });
const toMed = (r: any): Medication => ({
  id: r.id,
  profileId: r.profile_id,
  name: r.name,
  rxcui: r.rxcui ?? null,
  tty: r.tty ?? null,
  dosage: r.dosage,
  form: r.form,
  quantityPerDose: Number(r.quantity_per_dose),
  instructions: r.instructions,
  supplyRemaining: r.supply_remaining === null || r.supply_remaining === undefined ? null : Number(r.supply_remaining),
  refillThresholdDays: Number(r.refill_threshold_days),
  active: !!r.active,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
const toSchedule = (r: any): Schedule => ({
  id: r.id,
  medicationId: r.medication_id,
  time: r.time,
  daysOfWeek: JSON.parse(r.days_of_week || '[]'),
  startDate: r.start_date,
  endDate: r.end_date ?? null,
});
const toLog = (r: any): DoseLog => ({
  id: r.id,
  doseId: r.dose_id,
  medicationId: r.medication_id,
  scheduledAt: Number(r.scheduled_at),
  status: r.status,
  recordedAt: Number(r.recorded_at),
  source: r.source,
});
const toNote = (r: any): EffectNote => ({
  id: r.id,
  medicationId: r.medication_id,
  doseLogId: r.dose_log_id ?? null,
  createdAt: Number(r.created_at),
  minutesAfterDose: r.minutes_after_dose === null || r.minutes_after_dose === undefined ? null : Number(r.minutes_after_dose),
  mood: Number(r.mood),
  effectiveness: r.effectiveness === null || r.effectiveness === undefined ? null : Number(r.effectiveness),
  effects: JSON.parse(r.effects || '[]'),
  severity: r.severity === null || r.severity === undefined ? null : Number(r.severity),
  text: r.text,
});

// ---------- profiles ----------
export async function listProfiles(db: Db): Promise<Profile[]> {
  return (await db.getAllAsync<any>('SELECT * FROM profiles ORDER BY created_at', [])).map(toProfile);
}

export async function createProfile(db: Db, name: string, relation = 'Self'): Promise<Profile> {
  const p: Profile = { id: newId(), name: name.trim() || 'Me', relation: relation.trim() || 'Self', createdAt: nowIso() };
  await db.runAsync('INSERT INTO profiles (id, name, relation, created_at) VALUES (?, ?, ?, ?)', [p.id, p.name, p.relation, p.createdAt]);
  return p;
}

export async function updateProfile(db: Db, id: string, name: string, relation: string): Promise<void> {
  await db.runAsync('UPDATE profiles SET name = ?, relation = ? WHERE id = ?', [name.trim(), relation.trim(), id]);
}

export async function deleteProfile(db: Db, id: string): Promise<void> {
  await db.runAsync('DELETE FROM profiles WHERE id = ?', [id]);
}

// ---------- settings ----------
export async function getSetting(db: Db, key: string): Promise<string | null> {
  const r = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
  return r?.value ?? null;
}

export async function setSetting(db: Db, key: string, value: string): Promise<void> {
  await db.runAsync('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, value]);
}

/** Loads settings, creating a first profile on a fresh install. */
export async function loadSettings(db: Db): Promise<Settings> {
  let profiles = await listProfiles(db);
  if (profiles.length === 0) profiles = [await createProfile(db, 'Me', 'Self')];
  let active = await getSetting(db, 'activeProfileId');
  if (!active || !profiles.some((p) => p.id === active)) {
    active = profiles[0].id;
    await setSetting(db, 'activeProfileId', active);
  }
  const grace = Number(await getSetting(db, 'graceMinutes'));
  return {
    activeProfileId: active,
    role: ((await getSetting(db, 'role')) as Role) || 'personal',
    graceMinutes: Number.isFinite(grace) && grace > 0 ? grace : DEFAULT_GRACE_MINUTES,
    promptForNoteAfterDose: (await getSetting(db, 'promptForNoteAfterDose')) !== 'false',
  };
}

// ---------- medications ----------
export type MedicationInput = Omit<Medication, 'id' | 'createdAt' | 'updatedAt'>;

export function validateMedication(m: Partial<MedicationInput>): string[] {
  const errors: string[] = [];
  if (!m.name || !m.name.trim()) errors.push('Medication name is required.');
  if (m.quantityPerDose !== undefined && (!(m.quantityPerDose > 0) || m.quantityPerDose > 100)) errors.push('Quantity per dose must be between 0 and 100.');
  if (m.supplyRemaining !== undefined && m.supplyRemaining !== null && (m.supplyRemaining < 0 || !Number.isFinite(m.supplyRemaining))) errors.push('Supply on hand cannot be negative.');
  if (m.refillThresholdDays !== undefined && (m.refillThresholdDays < 0 || m.refillThresholdDays > 90)) errors.push('Refill reminder must be 0–90 days.');
  return errors;
}

export async function listMedications(db: Db, profileId: string, includeInactive = true): Promise<Medication[]> {
  const rows = await db.getAllAsync<any>(
    `SELECT * FROM medications WHERE profile_id = ? ${includeInactive ? '' : 'AND active = 1'} ORDER BY active DESC, name COLLATE NOCASE`,
    [profileId],
  );
  return rows.map(toMed);
}

export async function getMedication(db: Db, id: string): Promise<Medication | null> {
  const r = await db.getFirstAsync<any>('SELECT * FROM medications WHERE id = ?', [id]);
  return r ? toMed(r) : null;
}

export async function createMedication(db: Db, m: MedicationInput): Promise<Medication> {
  const errors = validateMedication(m);
  if (errors.length) throw new Error(errors.join(' '));
  const t = nowIso();
  const med: Medication = { ...m, name: m.name.trim(), id: newId(), createdAt: t, updatedAt: t };
  await db.runAsync(
    `INSERT INTO medications (id, profile_id, name, rxcui, tty, dosage, form, quantity_per_dose, instructions, supply_remaining, refill_threshold_days, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [med.id, med.profileId, med.name, med.rxcui, med.tty, med.dosage, med.form, med.quantityPerDose, med.instructions, med.supplyRemaining, med.refillThresholdDays, med.active ? 1 : 0, t, t],
  );
  return med;
}

export async function updateMedication(db: Db, id: string, patch: Partial<MedicationInput>): Promise<Medication> {
  const cur = await getMedication(db, id);
  if (!cur) throw new Error('Medication not found');
  const next = { ...cur, ...patch };
  const errors = validateMedication(next);
  if (errors.length) throw new Error(errors.join(' '));
  next.updatedAt = nowIso();
  await db.runAsync(
    `UPDATE medications SET name = ?, rxcui = ?, tty = ?, dosage = ?, form = ?, quantity_per_dose = ?, instructions = ?, supply_remaining = ?, refill_threshold_days = ?, active = ?, updated_at = ? WHERE id = ?`,
    [next.name.trim(), next.rxcui, next.tty, next.dosage, next.form, next.quantityPerDose, next.instructions, next.supplyRemaining, next.refillThresholdDays, next.active ? 1 : 0, next.updatedAt, id],
  );
  return next;
}

/** Hard delete – cascades to schedules, logs and notes. The UI offers "Stop taking" (inactive) first. */
export async function deleteMedication(db: Db, id: string): Promise<void> {
  await db.runAsync('DELETE FROM medications WHERE id = ?', [id]);
}

// ---------- schedules ----------
export async function listSchedules(db: Db, medicationIds?: string[]): Promise<Schedule[]> {
  if (medicationIds && medicationIds.length === 0) return [];
  const rows = medicationIds
    ? await db.getAllAsync<any>(`SELECT * FROM schedules WHERE medication_id IN (${medicationIds.map(() => '?').join(',')}) ORDER BY time`, medicationIds)
    : await db.getAllAsync<any>('SELECT * FROM schedules ORDER BY time', []);
  return rows.map(toSchedule);
}

/** Schedules of active medications for a profile – what the reminder engine runs on. */
export async function listActiveSchedules(db: Db, profileId?: string): Promise<Schedule[]> {
  const rows = profileId
    ? await db.getAllAsync<any>('SELECT s.* FROM schedules s JOIN medications m ON m.id = s.medication_id WHERE m.active = 1 AND m.profile_id = ? ORDER BY s.time', [profileId])
    : await db.getAllAsync<any>('SELECT s.* FROM schedules s JOIN medications m ON m.id = s.medication_id WHERE m.active = 1 ORDER BY s.time', []);
  return rows.map(toSchedule);
}

/** Replace a medication's schedule set (editing times after reminders exist – P3 E1 case). */
export async function replaceSchedules(db: Db, medicationId: string, items: Omit<Schedule, 'id' | 'medicationId'>[]): Promise<Schedule[]> {
  for (const s of items) {
    const errors = validateSchedule(s);
    if (errors.length) throw new Error(errors.join(' '));
  }
  const existing = await listSchedules(db, [medicationId]);
  const out: Schedule[] = [];
  // Keep ids for unchanged times so existing dose ids (and their logs) stay linked.
  const byKey = new Map(existing.map((s) => [`${s.time}|${JSON.stringify([...s.daysOfWeek].sort())}|${s.startDate}`, s]));
  const keep = new Set<string>();
  for (const s of items) {
    const key = `${s.time}|${JSON.stringify([...s.daysOfWeek].sort())}|${s.startDate}`;
    const prev = byKey.get(key);
    if (prev) {
      keep.add(prev.id);
      await db.runAsync('UPDATE schedules SET end_date = ? WHERE id = ?', [s.endDate, prev.id]);
      out.push({ ...prev, endDate: s.endDate });
    } else {
      const sch: Schedule = { id: newId(), medicationId, ...s, daysOfWeek: [...s.daysOfWeek].sort() };
      await db.runAsync('INSERT INTO schedules (id, medication_id, time, days_of_week, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?)', [
        sch.id,
        medicationId,
        sch.time,
        JSON.stringify(sch.daysOfWeek),
        sch.startDate,
        sch.endDate,
      ]);
      out.push(sch);
    }
  }
  for (const s of existing) if (!keep.has(s.id)) await db.runAsync('DELETE FROM schedules WHERE id = ?', [s.id]);
  return out.sort((a, b) => a.time.localeCompare(b.time));
}

// ---------- dose logs ----------
export async function recordDose(
  db: Db,
  d: { doseId: string; medicationId: string; scheduledAt: number },
  status: LoggedStatus,
  source: DoseLog['source'] = 'app',
  recordedAt = Date.now(),
): Promise<DoseLog> {
  const log: DoseLog = { id: newId(), doseId: d.doseId, medicationId: d.medicationId, scheduledAt: d.scheduledAt, status, recordedAt, source };
  await db.runAsync('INSERT INTO dose_logs (id, dose_id, medication_id, scheduled_at, status, recorded_at, source) VALUES (?, ?, ?, ?, ?, ?, ?)', [
    log.id,
    log.doseId,
    log.medicationId,
    log.scheduledAt,
    log.status,
    log.recordedAt,
    log.source,
  ]);
  return log;
}

export async function listLogs(db: Db, medicationIds: string[], fromMs: number, toMs: number): Promise<DoseLog[]> {
  if (medicationIds.length === 0) return [];
  const rows = await db.getAllAsync<any>(
    `SELECT * FROM dose_logs WHERE medication_id IN (${medicationIds.map(() => '?').join(',')}) AND scheduled_at BETWEEN ? AND ? ORDER BY scheduled_at DESC, recorded_at ASC, rowid ASC`,
    [...medicationIds, fromMs, toMs],
  );
  return rows.map(toLog);
}

export async function getLog(db: Db, id: string): Promise<DoseLog | null> {
  const r = await db.getFirstAsync<any>('SELECT * FROM dose_logs WHERE id = ?', [id]);
  return r ? toLog(r) : null;
}

// ---------- effects journal ----------
export type NoteInput = Omit<EffectNote, 'id' | 'createdAt'> & { createdAt?: number };

export async function addNote(db: Db, n: NoteInput): Promise<EffectNote> {
  const errors = validateNote(n);
  if (errors.length) throw new Error(errors.join(' '));
  const note: EffectNote = { ...n, id: newId(), createdAt: n.createdAt ?? Date.now(), text: n.text.trim() };
  await db.runAsync(
    'INSERT INTO effect_notes (id, medication_id, dose_log_id, created_at, minutes_after_dose, mood, effectiveness, effects, severity, text) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [note.id, note.medicationId, note.doseLogId, note.createdAt, note.minutesAfterDose, note.mood, note.effectiveness, JSON.stringify(note.effects), note.severity, note.text],
  );
  return note;
}

export async function updateNote(db: Db, id: string, n: Omit<NoteInput, 'medicationId' | 'doseLogId'>): Promise<void> {
  const errors = validateNote(n);
  if (errors.length) throw new Error(errors.join(' '));
  await db.runAsync('UPDATE effect_notes SET minutes_after_dose = ?, mood = ?, effectiveness = ?, effects = ?, severity = ?, text = ? WHERE id = ?', [
    n.minutesAfterDose,
    n.mood,
    n.effectiveness,
    JSON.stringify(n.effects),
    n.severity,
    n.text.trim(),
    id,
  ]);
}

export async function deleteNote(db: Db, id: string): Promise<void> {
  await db.runAsync('DELETE FROM effect_notes WHERE id = ?', [id]);
}

export async function getNote(db: Db, id: string): Promise<EffectNote | null> {
  const r = await db.getFirstAsync<any>('SELECT * FROM effect_notes WHERE id = ?', [id]);
  return r ? toNote(r) : null;
}

export async function listNotes(db: Db, medicationIds: string[], sinceMs = 0): Promise<EffectNote[]> {
  if (medicationIds.length === 0) return [];
  const rows = await db.getAllAsync<any>(
    `SELECT * FROM effect_notes WHERE medication_id IN (${medicationIds.map(() => '?').join(',')}) AND created_at >= ? ORDER BY created_at DESC`,
    [...medicationIds, sinceMs],
  );
  return rows.map(toNote);
}

// ---------- public drug-information caches ----------
export async function getCachedLabel(db: Db, rxcui: string): Promise<DrugLabel | null> {
  const r = await db.getFirstAsync<{ json: string }>('SELECT json FROM label_cache WHERE rxcui = ?', [rxcui]);
  return r ? (JSON.parse(r.json) as DrugLabel) : null;
}

export async function putCachedLabel(db: Db, label: DrugLabel): Promise<void> {
  await db.runAsync('INSERT INTO label_cache (rxcui, json, fetched_at) VALUES (?, ?, ?) ON CONFLICT(rxcui) DO UPDATE SET json = excluded.json, fetched_at = excluded.fetched_at', [
    label.rxcui,
    JSON.stringify(label),
    label.fetchedAt,
  ]);
}

/** RxNorm search results cache (public data; NLM suggests caching 12–24 h). */
export async function getCachedSearch(db: Db, query: string, maxAgeMs: number): Promise<any | null> {
  const r = await db.getFirstAsync<{ json: string; fetched_at: number }>('SELECT json, fetched_at FROM search_cache WHERE query = ?', [query]);
  if (!r || Date.now() - Number(r.fetched_at) > maxAgeMs) return null;
  return JSON.parse(r.json);
}

export async function putCachedSearch(db: Db, query: string, value: unknown): Promise<void> {
  await db.runAsync('INSERT INTO search_cache (query, json, fetched_at) VALUES (?, ?, ?) ON CONFLICT(query) DO UPDATE SET json = excluded.json, fetched_at = excluded.fetched_at', [
    query,
    JSON.stringify(value),
    Date.now(),
  ]);
}

/** Erase all personal data (Settings → Delete my data). */
export async function eraseAll(db: Db): Promise<void> {
  await db.execAsync('DELETE FROM effect_notes; DELETE FROM dose_logs; DELETE FROM schedules; DELETE FROM medications; DELETE FROM profiles; DELETE FROM settings;');
}
