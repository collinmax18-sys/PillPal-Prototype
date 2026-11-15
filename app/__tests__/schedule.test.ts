/** @jest-environment node */
import { doseId, doseStatus, dropPreCreationDoses, findAutoMissed, generateDoses, notificationWindow, parseDoseId, validateSchedule } from '../src/core/schedule';
import { addDays, localDateTime, MINUTE, dateKey } from '../src/core/time';
import type { DoseLog, Schedule } from '../src/core/types';

const sched = (over: Partial<Schedule> = {}): Schedule => ({ id: 's1', medicationId: 'm1', time: '08:00', daysOfWeek: [], startDate: '2026-11-01', endDate: null, ...over });

describe('generateDoses (FR2)', () => {
  test('daily schedule produces one dose per day inclusive of both ends', () => {
    const d = generateDoses([sched()], '2026-11-01', '2026-11-07');
    expect(d).toHaveLength(7);
    expect(d[0].id).toBe('s1@2026-11-01T08:00');
    expect(d[6].date).toBe('2026-11-07');
  });

  test('respects start and end dates', () => {
    const d = generateDoses([sched({ startDate: '2026-11-03', endDate: '2026-11-04' })], '2026-11-01', '2026-11-07');
    expect(d.map((x) => x.date)).toEqual(['2026-11-03', '2026-11-04']);
  });

  test('days-of-week filter (Mon/Wed/Fri)', () => {
    // 2026-11-02 is a Monday
    const d = generateDoses([sched({ daysOfWeek: [1, 3, 5] })], '2026-11-02', '2026-11-08');
    expect(d.map((x) => x.date)).toEqual(['2026-11-02', '2026-11-04', '2026-11-06']);
  });

  test('multiple schedules are merged and sorted by time; ids are deterministic', () => {
    const a = generateDoses([sched({ id: 'b', time: '20:00' }), sched({ id: 'a', time: '08:00' })], '2026-11-01', '2026-11-01');
    expect(a.map((x) => x.time)).toEqual(['08:00', '20:00']);
    const b = generateDoses([sched({ id: 'b', time: '20:00' }), sched({ id: 'a', time: '08:00' })], '2026-11-01', '2026-11-01');
    expect(b.map((x) => x.id)).toEqual(a.map((x) => x.id));
  });

  test('dose that crosses midnight: 23:30 dose belongs to its own calendar day', () => {
    const d = generateDoses([sched({ time: '23:30' })], '2026-11-01', '2026-11-02');
    expect(d.map((x) => x.id)).toEqual(['s1@2026-11-01T23:30', 's1@2026-11-02T23:30']);
    // 00:15 next day is still inside the 60-minute grace window of the 23:30 dose
    const at = localDateTime('2026-11-02', '00:15');
    expect(doseStatus(d[0], undefined, at, 60)).toBe('due');
    expect(doseStatus(d[0], undefined, at + 20 * MINUTE, 60)).toBe('missed');
  });

  test('wall-clock times are kept across a DST change (local time stays 08:00)', () => {
    // US/Canada DST ended 2026-11-01; whatever the TZ, every dose must read 08:00 locally.
    const d = generateDoses([sched({ startDate: '2026-10-28' })], '2026-10-28', '2026-11-04');
    for (const x of d) expect(new Date(x.at).getHours()).toBe(8);
  });

  test('invalid times are ignored instead of crashing', () => {
    expect(generateDoses([sched({ time: '25:99' })], '2026-11-01', '2026-11-02')).toEqual([]);
  });
});

describe('validateSchedule', () => {
  test('accepts a valid schedule', () => expect(validateSchedule(sched())).toEqual([]));
  test('rejects bad time, bad dates and reversed range', () => {
    expect(validateSchedule(sched({ time: '8am' }))).toHaveLength(1);
    expect(validateSchedule(sched({ startDate: '2026-02-30' }))).toHaveLength(1);
    expect(validateSchedule(sched({ endDate: '2026-10-01' }))).toEqual(['End date is before start date.']);
  });
});

describe('doseStatus and grace period (FR4)', () => {
  const dose = { at: localDateTime('2026-11-10', '08:00') };
  const log = (status: DoseLog['status']): DoseLog => ({ id: 'l', doseId: 'x', medicationId: 'm1', scheduledAt: dose.at, status, recordedAt: dose.at, source: 'app' });
  test('upcoming before time, due within grace, missed after', () => {
    expect(doseStatus(dose, undefined, dose.at - 1, 60)).toBe('upcoming');
    expect(doseStatus(dose, undefined, dose.at, 60)).toBe('due');
    expect(doseStatus(dose, undefined, dose.at + 60 * MINUTE, 60)).toBe('due');
    expect(doseStatus(dose, undefined, dose.at + 60 * MINUTE + 1, 60)).toBe('missed');
  });
  test('a log always wins over time-based status', () => {
    expect(doseStatus(dose, log('taken'), dose.at + 999 * MINUTE, 60)).toBe('taken');
    expect(doseStatus(dose, log('skipped'), dose.at - 10, 60)).toBe('skipped');
  });
  test('findAutoMissed returns only unlogged doses past grace', () => {
    const doses = generateDoses([sched()], '2026-11-08', '2026-11-10');
    const logs = new Map([[doses[0].id, log('taken')]]);
    const now = localDateTime('2026-11-10', '08:30');
    expect(findAutoMissed(doses, logs, now, 60).map((d) => d.date)).toEqual(['2026-11-09']);
  });
});

describe('notificationWindow (NFR2 / iOS 64 limit)', () => {
  test('only future, unlogged doses, capped at the limit', () => {
    const today = dateKey(new Date('2026-11-10T12:00:00'));
    const doses = generateDoses([sched({ time: '08:00' }), sched({ id: 's2', time: '20:00' })], today, addDays(today, 60));
    const now = localDateTime(today, '12:00');
    const w = notificationWindow(doses, new Map(), now, 60);
    expect(w).toHaveLength(60);
    expect(w[0].id).toBe(`s2@${today}T20:00`);
    expect(w.every((d) => d.at > now)).toBe(true);
  });
  test('8 meds x 4 times x 7 days = 224 doses is reduced to 60 pending', () => {
    const schedules: Schedule[] = [];
    for (let m = 0; m < 8; m++) for (const t of ['08:00', '12:00', '16:00', '20:00']) schedules.push(sched({ id: `m${m}-${t}`, medicationId: `m${m}`, time: t }));
    const doses = generateDoses(schedules, '2026-11-10', '2026-11-16');
    expect(doses).toHaveLength(224);
    expect(notificationWindow(doses, new Map(), localDateTime('2026-11-10', '00:00'), 60)).toHaveLength(60);
  });
});

describe('dose ids', () => {
  test('round-trip', () => {
    expect(parseDoseId(doseId('abc-123', '2026-11-10', '08:00'))).toEqual({ scheduleId: 'abc-123', date: '2026-11-10', time: '08:00' });
    expect(parseDoseId('prn@123')).toBeNull();
  });
});

describe('dropPreCreationDoses', () => {
  const doses = generateDoses([sched()], '2026-11-10', '2026-11-11');
  test('drops doses whose grace period ended before the medication existed', () => {
    const created = new Map([['m1', localDateTime('2026-11-10', '12:00')]]);
    expect(dropPreCreationDoses(doses, created, new Map(), 60).map((d) => d.date)).toEqual(['2026-11-11']);
  });
  test('keeps a dose still inside its grace window, and any logged dose', () => {
    const created = new Map([['m1', localDateTime('2026-11-10', '08:30')]]);
    expect(dropPreCreationDoses(doses, created, new Map(), 60)).toHaveLength(2);
    const late = new Map([['m1', localDateTime('2026-11-12', '00:00')]]);
    const logs = new Map([[doses[0].id, { id: 'l', doseId: doses[0].id, medicationId: 'm1', scheduledAt: doses[0].at, status: 'taken' as const, recordedAt: 0, source: 'app' as const }]]);
    expect(dropPreCreationDoses(doses, late, logs, 60).map((d) => d.date)).toEqual(['2026-11-10']);
  });
});
