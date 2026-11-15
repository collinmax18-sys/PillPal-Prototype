// Synthetic demo data. NO real patient information is used anywhere in
// PillPal (P3 §5.2). RxCUIs are real public RxNorm identifiers so the drug
// information screens work against live openFDA data during the demo.

import type { Db } from './schema';
import * as repo from './repo';
import { generateDoses } from '../core/schedule';
import { addDays, dateKey, localDateTime, MINUTE } from '../core/time';

/** Deterministic PRNG so the seeded data set (and its adherence) is reproducible. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const DEMO_MEDS = [
  { name: 'metformin hydrochloride 500 MG Oral Tablet', rxcui: '861007', tty: 'SCD', dosage: '500 mg', form: 'tablet', instructions: 'Take with meals', times: ['08:00', '18:00'], supply: 40, takeRate: 0.9 },
  { name: 'lisinopril 10 MG Oral Tablet', rxcui: '314076', tty: 'SCD', dosage: '10 mg', form: 'tablet', instructions: 'Same time each morning', times: ['08:00'], supply: 6, takeRate: 0.95 },
  { name: 'atorvastatin 10 MG Oral Tablet', rxcui: '617312', tty: 'SCD', dosage: '10 mg', form: 'tablet', instructions: 'Take in the evening', times: ['21:00'], supply: 25, takeRate: 0.75 },
  { name: 'sertraline 50 MG Oral Tablet', rxcui: '312941', tty: 'SCD', dosage: '50 mg', form: 'tablet', instructions: '', times: ['09:00'], supply: 28, takeRate: 0.85 },
];

const NOTE_TEMPLATES: { med: number; mood: number; eff: number | null; effects: string[]; sev: number | null; text: string; mins: number }[] = [
  { med: 0, mood: 3, eff: null, effects: ['nausea', 'stomach'], sev: 2, text: 'Felt queasy about an hour after breakfast dose.', mins: 60 },
  { med: 0, mood: 4, eff: null, effects: ['nausea'], sev: 1, text: 'Taking it with a full meal helped – only mild nausea.', mins: 45 },
  { med: 0, mood: 4, eff: null, effects: [], sev: null, text: 'No stomach issues today.', mins: 90 },
  { med: 1, mood: 3, eff: null, effects: ['dizziness'], sev: 1, text: 'A bit lightheaded when I stood up quickly.', mins: 120 },
  { med: 1, mood: 4, eff: null, effects: ['cough'], sev: 1, text: 'Dry tickly cough again in the evening.', mins: 600 },
  { med: 3, mood: 2, eff: 2, effects: ['insomnia', 'anxiety'], sev: 2, text: 'First week – hard to fall asleep, felt jittery.', mins: 720 },
  { med: 3, mood: 3, eff: 3, effects: ['insomnia'], sev: 1, text: 'Sleep a little better. Moved dose to morning.', mins: 600 },
  { med: 3, mood: 4, eff: 4, effects: ['calmer'], sev: null, text: 'Noticeably calmer this week.', mins: 240 },
  { med: 3, mood: 5, eff: 4, effects: ['calmer', 'slept_well'], sev: null, text: 'Good week overall, sleeping well.', mins: 240 },
  { med: 2, mood: 4, eff: null, effects: ['muscle_pain'], sev: 1, text: 'Slight ache in my legs after a long walk – not sure if related.', mins: 900 },
];

export async function seedDemo(db: Db, opts: { days?: number; seed?: number; now?: number; profileName?: string } = {}): Promise<{ profileId: string; medicationIds: string[] }> {
  const days = opts.days ?? 30;
  const now = opts.now ?? Date.now();
  const rand = mulberry32(opts.seed ?? 4310);
  // On a fresh install the app auto-creates an empty "Me" profile; replace it instead of leaving it beside the demo.
  const existing = await repo.listProfiles(db);
  const emptyDefault = existing.length === 1 && (await repo.listMedications(db, existing[0].id)).length === 0 ? existing[0] : null;
  const profile = await repo.createProfile(db, opts.profileName ?? 'Alex (demo)', 'Self');
  const today = dateKey(now);
  const start = addDays(today, -days);
  const medIds: string[] = [];
  for (const m of DEMO_MEDS) {
    const med = await repo.createMedication(db, {
      profileId: profile.id,
      name: m.name,
      rxcui: m.rxcui,
      tty: m.tty,
      dosage: m.dosage,
      form: m.form,
      quantityPerDose: 1,
      instructions: m.instructions,
      supplyRemaining: m.supply,
      refillThresholdDays: 7,
      active: true,
    });
    medIds.push(med.id);
    // The synthetic history starts `days` ago, so the medication "existed" from then.
    await db.runAsync('UPDATE medications SET created_at = ? WHERE id = ?', [new Date(localDateTime(start, '00:00')).toISOString(), med.id]);
    const schedules = await repo.replaceSchedules(
      db,
      med.id,
      m.times.map((t) => ({ time: t, daysOfWeek: [], startDate: start, endDate: null })),
    );
    // Past doses only (before today) get a log; today's stay pending for the demo.
    for (const d of generateDoses(schedules, start, addDays(today, -1))) {
      const r = rand();
      const status = r < m.takeRate ? 'taken' : r < m.takeRate + 0.04 ? 'skipped' : 'missed';
      const delay = Math.floor(rand() * 25) * MINUTE;
      await repo.recordDose(db, { doseId: d.id, medicationId: med.id, scheduledAt: d.at }, status, status === 'missed' ? 'auto' : 'app', d.at + (status === 'missed' ? 61 * MINUTE : delay));
    }
  }
  // Spread journal notes over the period, oldest first.
  for (let i = 0; i < NOTE_TEMPLATES.length; i++) {
    const n = NOTE_TEMPLATES[i];
    const dayOffset = Math.round(days - 1 - (i * (days - 2)) / NOTE_TEMPLATES.length);
    const at = now - dayOffset * 24 * 60 * MINUTE;
    await repo.addNote(db, {
      medicationId: medIds[n.med],
      doseLogId: null,
      minutesAfterDose: n.mins,
      mood: n.mood,
      effectiveness: n.eff,
      effects: n.effects,
      severity: n.sev,
      text: n.text,
      createdAt: at,
    });
  }
  await repo.setSetting(db, 'activeProfileId', profile.id);
  if (emptyDefault) await repo.deleteProfile(db, emptyDefault.id);
  return { profileId: profile.id, medicationIds: medIds };
}

/** Large synthetic data set for the performance check (P3 E3): 3 profiles, 15 meds, 90 days. */
export async function seedLarge(db: Db, now = Date.now()): Promise<{ profileIds: string[]; doses: number }> {
  const rand = mulberry32(99);
  const today = dateKey(now);
  const start = addDays(today, -90);
  const profileIds: string[] = [];
  let doses = 0;
  for (let p = 0; p < 3; p++) {
    const prof = await repo.createProfile(db, `Synthetic patient ${p + 1}`, p === 0 ? 'Self' : 'Family');
    profileIds.push(prof.id);
    for (let k = 0; k < 5; k++) {
      const med = await repo.createMedication(db, {
        profileId: prof.id,
        name: `Synthetic med ${p + 1}-${k + 1}`,
        rxcui: null,
        tty: null,
        dosage: '10 mg',
        form: 'tablet',
        quantityPerDose: 1,
        instructions: '',
        supplyRemaining: 60,
        refillThresholdDays: 7,
        active: true,
      });
      // 2–4 doses a day: 14 schedules per profile × 3 profiles × 90 days ≈ 3,800 dose records
      const times = ['08:00', '13:00', '18:00', '22:00'].slice(0, 2 + (k % 3));
      const sch = await repo.replaceSchedules(db, med.id, times.map((t) => ({ time: t, daysOfWeek: [], startDate: start, endDate: null })));
      for (const d of generateDoses(sch, start, addDays(today, -1))) {
        const r = rand();
        await repo.recordDose(db, { doseId: d.id, medicationId: med.id, scheduledAt: d.at }, r < 0.85 ? 'taken' : r < 0.9 ? 'skipped' : 'missed', 'app', d.at + 5 * MINUTE);
        doses++;
      }
    }
  }
  return { profileIds, doses };
}
