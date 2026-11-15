/** @jest-environment node */
import { computeAdherence, dailyAdherence, indexLogs } from '../src/core/adherence';
import { generateDoses } from '../src/core/schedule';
import { localDateTime, dateRange } from '../src/core/time';
import { matchEffectsToLabel, summarizeJournal, unlistedEffects, validateNote } from '../src/core/effects';
import { refillStatus, decrementSupply } from '../src/core/refill';
import { buildClinicianReport } from '../src/core/report';
import type { DoseLog, EffectNote, Medication, Schedule } from '../src/core/types';

const schedule: Schedule = { id: 's', medicationId: 'm', time: '08:00', daysOfWeek: [], startDate: '2026-11-01', endDate: null };
const mkLog = (doseId: string, at: number, status: DoseLog['status'], recordedAt = at): DoseLog => ({ id: doseId + status + recordedAt, doseId, medicationId: 'm', scheduledAt: at, status, recordedAt, source: 'app' });

describe('adherence (FR6) – checked against hand-calculated values', () => {
  const doses = generateDoses([schedule], '2026-11-01', '2026-11-10'); // 10 doses
  const now = localDateTime('2026-11-10', '12:00');

  test('7 taken, 1 skipped, 2 unlogged past grace = 70% taken', () => {
    const logs: DoseLog[] = doses.slice(0, 7).map((d) => mkLog(d.id, d.at, 'taken'));
    logs.push(mkLog(doses[7].id, doses[7].at, 'skipped'));
    const a = computeAdherence(doses, indexLogs(logs), now, 60);
    expect(a).toEqual({ taken: 7, skipped: 1, missed: 2, resolved: 10, percent: 70 });
  });

  test('pending doses are excluded from the denominator', () => {
    const earlyNow = localDateTime('2026-11-10', '08:30'); // last dose still "due"
    const logs = doses.slice(0, 9).map((d) => mkLog(d.id, d.at, 'taken'));
    expect(computeAdherence(doses, indexLogs(logs), earlyNow, 60)).toMatchObject({ resolved: 9, percent: 100 });
  });

  test('a later correction replaces an earlier record (append-only log)', () => {
    const d = doses[0];
    const logs = [mkLog(d.id, d.at, 'missed', d.at + 1), mkLog(d.id, d.at, 'taken', d.at + 2)];
    expect(indexLogs(logs).get(d.id)!.status).toBe('taken');
  });

  test('no data -> percent is null, not 0', () => {
    expect(computeAdherence([], new Map(), now, 60).percent).toBeNull();
  });

  test('daily breakdown has one bucket per day', () => {
    const daily = dailyAdherence(doses, new Map(), now, 60, dateRange('2026-11-08', '2026-11-10'));
    expect(daily.map((x) => [x.date, x.missed])).toEqual([
      ['2026-11-08', 1],
      ['2026-11-09', 1],
      ['2026-11-10', 1],
    ]);
  });
});

const med: Medication = {
  id: 'm', profileId: 'p', name: 'lisinopril 10 MG Oral Tablet', rxcui: '314076', tty: 'SCD', dosage: '10 mg', form: 'tablet', quantityPerDose: 1,
  instructions: '', supplyRemaining: 10, refillThresholdDays: 7, active: true, createdAt: '', updatedAt: '',
};

describe('refills', () => {
  test('twice-daily with 10 tablets = 5 days -> needs refill at 7-day threshold', () => {
    const r = refillStatus(med, [schedule, { ...schedule, id: 's2', time: '20:00' }], '2026-11-10');
    expect(r).toEqual({ tracked: true, unitsPerDay: 2, daysRemaining: 5, needsRefill: true });
  });
  test('untracked supply never nags', () => {
    expect(refillStatus({ ...med, supplyRemaining: null }, [schedule], '2026-11-10').needsRefill).toBe(false);
  });
  test('decrement never goes negative', () => {
    expect(decrementSupply({ ...med, supplyRemaining: 0.5 })).toBe(0);
  });
});

const label = [
  { key: 'adverse_reactions', title: 'Side effects', text: 'The most common adverse reactions (incidence ≥ 5%) were headache, dizziness, cough and hypotension. Nausea occurred in 2% of patients.' },
  { key: 'warnings_and_cautions', title: 'Warnings', text: 'Angioedema: swelling of the face, extremities, lips and tongue has been reported.' },
  { key: 'indications_and_usage', title: 'Use', text: 'Treatment of hypertension. Does not mention rash here.' },
];

describe('effects journal ↔ label matching (contribution)', () => {
  test('reported effects are matched to label sections with an excerpt from the source', () => {
    const m = matchEffectsToLabel(['cough', 'dizziness', 'swelling', 'insomnia'], label);
    expect(m.map((x) => [x.tagId, x.sectionKey])).toEqual([
      ['cough', 'adverse_reactions'],
      ['dizziness', 'adverse_reactions'],
      ['swelling', 'warnings_and_cautions'],
    ]);
    expect(m[0].excerpt).toContain('cough');
    expect(unlistedEffects(['cough', 'insomnia', 'calmer'], m)).toEqual(['insomnia']);
  });
  test('only effect-related sections are searched (no false match in indications)', () => {
    expect(matchEffectsToLabel(['rash'], label)).toEqual([]);
  });
  test('word-boundary matching avoids partial words', () => {
    expect(matchEffectsToLabel(['rash'], [{ key: 'adverse_reactions', title: '', text: 'Crashing fatigue was not reported.' }])).toEqual([]);
  });
});

const note = (i: number, mood: number, effects: string[], sev: number | null = null): EffectNote => ({
  id: String(i), medicationId: 'm', doseLogId: null, createdAt: i * 1000, minutesAfterDose: 60, mood, effectiveness: mood, effects, severity: sev, text: '',
});

describe('journal summary', () => {
  test('averages, top effects and trend', () => {
    const s = summarizeJournal([note(1, 2, ['insomnia', 'anxiety'], 2), note(2, 2, ['insomnia']), note(3, 4, ['calmer']), note(4, 5, ['calmer', 'slept_well'])]);
    expect(s.count).toBe(4);
    expect(s.averageMood).toBe(3.3);
    expect(s.topEffects[0]).toMatchObject({ id: 'calmer', count: 2 });
    expect(s.moodTrend).toBe(2.5); // (4+5)/2 - (2+2)/2
  });
  test('empty journal', () => expect(summarizeJournal([]).averageMood).toBeNull());
  test('validation', () => {
    expect(validateNote({ mood: 0, effectiveness: null, severity: null, text: '', effects: [] })).toHaveLength(1);
    expect(validateNote({ mood: 3, effectiveness: 6, severity: 4, text: '', effects: ['made-up'] })).toHaveLength(3);
    expect(validateNote({ mood: 3, effectiveness: null, severity: null, text: 'ok', effects: ['nausea'] })).toEqual([]);
  });
});

describe('clinician report', () => {
  test('includes medications, adherence and journal, and an informational disclaimer', () => {
    const text = buildClinicianReport({
      profile: { id: 'p', name: 'Alex', relation: 'Self', createdAt: '' },
      medications: [med],
      schedules: [schedule],
      adherence: new Map([['m', { taken: 9, missed: 1, skipped: 0, resolved: 10, percent: 90 }]]),
      notes: [note(1, 3, ['cough'], 1)],
      periodDays: 30,
      generatedAt: new Date('2026-11-14T10:00:00'),
    });
    expect(text).toContain('lisinopril 10 MG Oral Tablet');
    expect(text).toContain('RxCUI 314076');
    expect(text).toContain('Adherence: 90%');
    expect(text).toContain('Cough ×1');
    expect(text).toContain('Not medical advice');
  });
});
