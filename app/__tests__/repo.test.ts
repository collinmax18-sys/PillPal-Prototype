/** @jest-environment node */
import { createTestDb } from './helpers/nodeDb';
import * as repo from '../src/data/repo';
import { seedDemo, seedLarge } from '../src/data/seed';
import { loadAdherence, loadDoses, markDose, applyAutoMissed } from '../src/services/doses';
import { dateKey, localDateTime } from '../src/core/time';

const baseMed = (profileId: string) => ({
  profileId, name: 'amlodipine 5 MG Oral Tablet', rxcui: '197361', tty: 'SCD', dosage: '5 mg', form: 'tablet', quantityPerDose: 1,
  instructions: '', supplyRemaining: 30, refillThresholdDays: 7, active: true,
});

describe('data layer (FR1, FR5)', () => {
  test('fresh install creates a default profile and settings', async () => {
    const db = await createTestDb();
    const s = await repo.loadSettings(db);
    expect(s.role).toBe('personal');
    expect(s.graceMinutes).toBe(60);
    expect((await repo.listProfiles(db))).toHaveLength(1);
  });

  test('add, edit and remove a medication; delete cascades to schedules, logs and notes', async () => {
    const db = await createTestDb();
    const { activeProfileId } = await repo.loadSettings(db);
    const m = await repo.createMedication(db, baseMed(activeProfileId));
    await repo.updateMedication(db, m.id, { dosage: '10 mg' });
    expect((await repo.getMedication(db, m.id))!.dosage).toBe('10 mg');
    const [s] = await repo.replaceSchedules(db, m.id, [{ time: '08:00', daysOfWeek: [], startDate: '2026-11-01', endDate: null }]);
    await repo.recordDose(db, { doseId: `${s.id}@2026-11-01T08:00`, medicationId: m.id, scheduledAt: 1 }, 'taken');
    await repo.addNote(db, { medicationId: m.id, doseLogId: null, minutesAfterDose: 30, mood: 4, effectiveness: null, effects: ['headache'], severity: 1, text: 'mild headache' });
    await repo.deleteMedication(db, m.id);
    expect(await repo.listSchedules(db, [m.id])).toEqual([]);
    expect(await repo.listLogs(db, [m.id], 0, Date.now())).toEqual([]);
    expect(await repo.listNotes(db, [m.id])).toEqual([]);
  });

  test('validation rejects empty name and negative supply', async () => {
    const db = await createTestDb();
    const { activeProfileId } = await repo.loadSettings(db);
    await expect(repo.createMedication(db, { ...baseMed(activeProfileId), name: '  ' })).rejects.toThrow('name is required');
    await expect(repo.createMedication(db, { ...baseMed(activeProfileId), supplyRemaining: -1 })).rejects.toThrow('negative');
  });

  test('editing a schedule keeps ids of unchanged times (logs stay linked)', async () => {
    const db = await createTestDb();
    const { activeProfileId } = await repo.loadSettings(db);
    const m = await repo.createMedication(db, baseMed(activeProfileId));
    const a = await repo.replaceSchedules(db, m.id, [
      { time: '08:00', daysOfWeek: [], startDate: '2026-11-01', endDate: null },
      { time: '20:00', daysOfWeek: [], startDate: '2026-11-01', endDate: null },
    ]);
    const b = await repo.replaceSchedules(db, m.id, [
      { time: '08:00', daysOfWeek: [], startDate: '2026-11-01', endDate: null },
      { time: '21:00', daysOfWeek: [], startDate: '2026-11-01', endDate: null },
    ]);
    expect(b.find((s) => s.time === '08:00')!.id).toBe(a.find((s) => s.time === '08:00')!.id);
    expect(b.map((s) => s.time)).toEqual(['08:00', '21:00']);
    await expect(repo.replaceSchedules(db, m.id, [{ time: '99:00', daysOfWeek: [], startDate: '2026-11-01', endDate: null }])).rejects.toThrow();
  });

  test('markDose updates supply, and correcting Taken -> Skipped restores it', async () => {
    const db = await createTestDb();
    const { activeProfileId } = await repo.loadSettings(db);
    const m = await repo.createMedication(db, baseMed(activeProfileId));
    const today = dateKey(Date.now());
    await repo.replaceSchedules(db, m.id, [{ time: '08:00', daysOfWeek: [], startDate: today, endDate: null }]);
    db.raw.exec(`UPDATE medications SET created_at = '2026-01-01T00:00:00.000Z'`);
    let [item] = await loadDoses(db, activeProfileId, today, today, 60);
    const log = await markDose(db, item, 'taken');
    expect((await repo.getMedication(db, m.id))!.supplyRemaining).toBe(29);
    item = { ...item, log };
    await markDose(db, item, 'skipped');
    expect((await repo.getMedication(db, m.id))!.supplyRemaining).toBe(30);
    [item] = await loadDoses(db, activeProfileId, today, today, 60);
    expect(item.status).toBe('skipped');
  });

  test('auto-missed writes explicit records once', async () => {
    const db = await createTestDb();
    const { activeProfileId } = await repo.loadSettings(db);
    const m = await repo.createMedication(db, baseMed(activeProfileId));
    const now = localDateTime('2026-11-10', '12:00');
    await repo.replaceSchedules(db, m.id, [{ time: '08:00', daysOfWeek: [], startDate: '2026-11-08', endDate: null }]);
    // medication added before the schedule started
    db.raw.exec(`UPDATE medications SET created_at = '2026-11-01T00:00:00.000Z'`);
    expect(await applyAutoMissed(db, 60, now)).toBe(3);
    expect(await applyAutoMissed(db, 60, now)).toBe(0);
  });

  test('a medication added in the evening does not show that morning as missed', async () => {
    const db = await createTestDb();
    const { activeProfileId } = await repo.loadSettings(db);
    const m = await repo.createMedication(db, baseMed(activeProfileId));
    const today = dateKey(Date.now());
    await repo.replaceSchedules(db, m.id, [{ time: '00:00', daysOfWeek: [], startDate: today, endDate: null }]);
    // pretend it was added at 23:00 today
    db.raw.exec(`UPDATE medications SET created_at = '${new Date(localDateTime(today, '23:00')).toISOString()}'`);
    const items = await loadDoses(db, activeProfileId, today, today, 60, localDateTime(today, '23:30'));
    expect(items).toEqual([]);
    expect(await applyAutoMissed(db, 60, localDateTime(today, '23:30'))).toBe(0);
  });

  test('profiles keep data separate (caregiver managing a relative)', async () => {
    const db = await createTestDb();
    const { activeProfileId } = await repo.loadSettings(db);
    const mom = await repo.createProfile(db, 'Mom', 'Mother');
    await repo.createMedication(db, baseMed(mom.id));
    expect(await repo.listMedications(db, activeProfileId)).toHaveLength(0);
    expect(await repo.listMedications(db, mom.id)).toHaveLength(1);
  });

  test('label cache round-trip', async () => {
    const db = await createTestDb();
    await repo.putCachedLabel(db, { rxcui: '1', setId: 'abc', brandName: null, genericName: 'x', effectiveTime: '20250101', sections: [{ key: 'k', title: 't', text: 'body' }], fetchedAt: 5, source: 'openFDA' });
    expect((await repo.getCachedLabel(db, '1'))!.sections[0].text).toBe('body');
  });
});

describe('seeded data sets', () => {
  test('30-day demo seed is reproducible and has journal notes', async () => {
    const now = localDateTime('2026-11-14', '12:00');
    const db1 = await createTestDb();
    const a = await seedDemo(db1, { now });
    const r1 = await loadAdherence(db1, a.profileId, 30, 60, now);
    const db2 = await createTestDb();
    const b = await seedDemo(db2, { now });
    const r2 = await loadAdherence(db2, b.profileId, 30, 60, now);
    expect(r1.overall).toEqual(r2.overall);
    expect(r1.overall.resolved).toBeGreaterThan(100);
    expect(r1.overall.percent).toBeGreaterThan(70);
    expect(await repo.listNotes(db1, a.medicationIds)).toHaveLength(10);
  });

  test('performance (E3): 90-day history over ~4,000 doses loads well under 2 s', async () => {
    const db = await createTestDb();
    const now = Date.now();
    const { profileIds, doses } = await seedLarge(db, now);
    expect(doses).toBeGreaterThan(3500);
    const timings: number[] = [];
    for (let i = 0; i < 10; i++) {
      const t0 = performance.now();
      await repo.listMedications(db, profileIds[0]);
      await loadAdherence(db, profileIds[0], 90, 60, now);
      timings.push(performance.now() - t0);
    }
    timings.sort((x, y) => x - y);
    console.log(`E3 timings ms: median=${timings[5].toFixed(1)} max=${timings[9].toFixed(1)} over ${doses} dose records`);
    expect(timings[9]).toBeLessThan(2000);
  });
});

