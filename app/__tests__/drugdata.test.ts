/** @jest-environment node */
// Parsers are tested against real responses saved from RxNav and openFDA.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanSectionText, dailyMedUrl, parseApproximateResponse, parseDrugsResponse, parseLabelResponse } from '../src/core/drugdata';
import { matchEffectsToLabel } from '../src/core/effects';

const fx = (name: string) => JSON.parse(readFileSync(join(__dirname, 'fixtures', name), 'utf8'));

describe('RxNorm parsing (FR7)', () => {
  test('drugs.json yields products with RxCUIs, product-level concepts first', () => {
    const c = parseDrugsResponse(fx('rxnav-drugs-lisinopril.json'));
    expect(c.length).toBeGreaterThan(5);
    expect(c.every((x) => /^\d+$/.test(x.rxcui))).toBe(true);
    expect(['SBD', 'SCD']).toContain(c[0].tty);
    expect(c.some((x) => x.rxcui === '314076' && x.name === 'lisinopril 10 MG Oral Tablet')).toBe(true);
  });
  test('approximate match corrects a misspelling (lipitr -> Lipitor)', () => {
    const a = parseApproximateResponse(fx('rxnav-approx-lipitr.json'));
    expect(a[0].rxcui).toBe('153165');
    expect(a.some((x) => x.name === 'Lipitor')).toBe(true);
  });
  test('empty / malformed responses do not throw', () => {
    expect(parseDrugsResponse(null)).toEqual([]);
    expect(parseDrugsResponse({ drugGroup: { conceptGroup: [{ tty: 'SBD' }] } })).toEqual([]);
  });
});

describe('openFDA label parsing', () => {
  const label = parseLabelResponse(fx('openfda-label-314076.json'), '314076', 1)!;
  test('extracts the sections PillPal shows, with source metadata', () => {
    expect(label.source).toBe('openFDA');
    expect(label.setId).toBeTruthy();
    expect(label.sections.map((s) => s.key)).toEqual(expect.arrayContaining(['indications_and_usage', 'dosage_and_administration', 'adverse_reactions']));
    expect(dailyMedUrl(label.setId)).toContain('dailymed.nlm.nih.gov');
  });
  test('a real lisinopril label lists cough and dizziness – journal matching works on live data', () => {
    const m = matchEffectsToLabel(['cough', 'dizziness'], label.sections);
    expect(m.map((x) => x.tagId).sort()).toEqual(['cough', 'dizziness']);
  });
  test('no results -> null', () => expect(parseLabelResponse({ results: [] }, '1')).toBeNull());
  test('cleanSectionText removes the repeated all-caps heading', () => {
    expect(cleanSectionText('6 ADVERSE REACTIONS The following reactions were seen')).toBe('The following reactions were seen');
  });
});

describe('label selection', () => {
  test('a repackager stub without clinical sections is not chosen over a full label', () => {
    const stub = { set_id: 'stub', spl_unclassified_section: ['Repackaged by …'] };
    const full = { set_id: 'full', indications_and_usage: ['Used to lower cholesterol.'], adverse_reactions: ['Myalgia was reported.'] };
    expect(parseLabelResponse({ results: [stub, full] }, '617312')!.setId).toBe('full');
  });
});
