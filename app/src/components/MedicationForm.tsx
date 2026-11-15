// Add / edit medication (FR1, FR2). RxNorm search saves a standardized
// name + RxCUI; manual entry is the offline fallback so FR1 never depends on
// the network.
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useApp } from '../state/AppState';
import { searchMedications } from '../services/druginfo';
import type { RxCandidate } from '../core/drugdata';
import { dateKey, dayName, isValidTime, formatTime12 } from '../core/time';
import type { Medication, Schedule } from '../core/types';
import { validateMedication } from '../data/repo';
import { Button, Card, Chip, Field, H2, Notice, P, Row, Loading } from './ui';
import { colors, space } from '../theme';

export interface MedicationFormValue {
  name: string;
  rxcui: string | null;
  tty: string | null;
  dosage: string;
  form: string;
  quantityPerDose: string;
  instructions: string;
  supplyRemaining: string;
  refillThresholdDays: string;
  times: string[];
  daysOfWeek: number[];
  startDate: string;
}

export function initialForm(med?: Medication, schedules: Schedule[] = []): MedicationFormValue {
  return {
    name: med?.name ?? '',
    rxcui: med?.rxcui ?? null,
    tty: med?.tty ?? null,
    dosage: med?.dosage ?? '',
    form: med?.form ?? '',
    quantityPerDose: String(med?.quantityPerDose ?? 1),
    instructions: med?.instructions ?? '',
    supplyRemaining: med?.supplyRemaining == null ? '' : String(med.supplyRemaining),
    refillThresholdDays: String(med?.refillThresholdDays ?? 7),
    times: schedules.length ? schedules.map((s) => s.time) : ['08:00'],
    daysOfWeek: schedules[0]?.daysOfWeek ?? [],
    startDate: schedules[0]?.startDate ?? dateKey(Date.now()),
  };
}

/** Pull "500 mg" and "tablet" out of an RxNorm name like "metformin hydrochloride 500 MG Oral Tablet". */
export function parseRxName(name: string): { dosage: string; form: string } {
  const dose = /(\d+(?:\.\d+)?\s*(?:MG|MCG|G|ML|UNT|%|MEQ)(?:\/(?:ML|ACTUAT|HR))?)/i.exec(name);
  const form = /\b(Tablet|Capsule|Solution|Suspension|Injection|Cream|Ointment|Patch|Inhaler|Spray|Drops|Lozenge|Powder)\b/i.exec(name);
  return { dosage: dose ? dose[1].replace(/MG/i, 'mg').replace(/MCG/i, 'mcg').replace(/ML/i, 'mL') : '', form: form ? form[1].toLowerCase() : '' };
}

export function MedicationForm({ initial, submitLabel, onSubmit, searchFirst }: { initial: MedicationFormValue; submitLabel: string; onSubmit: (v: MedicationFormValue) => Promise<void>; searchFirst?: boolean }) {
  const { db } = useApp();
  const [v, setV] = useState(initial);
  const [mode, setMode] = useState<'search' | 'form'>(searchFirst ? 'search' : 'form');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<RxCandidate[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [newTime, setNewTime] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const set = <K extends keyof MedicationFormValue>(k: K, val: MedicationFormValue[K]) => setV((x) => ({ ...x, [k]: val }));

  // Debounced RxNorm search (P3 R3: avoid throttling)
  useEffect(() => {
    if (mode !== 'search') return;
    if (debounce.current) clearTimeout(debounce.current);
    if (query.trim().length < 3) return;
    debounce.current = setTimeout(async () => {
      setSearching(true);
      setSearchError(null);
      try {
        const r = await searchMedications(db, query);
        setResults(r.candidates);
        setSuggestions(r.suggestions);
      } catch {
        setSearchError('Could not reach the RxNorm drug database. Check your connection, or enter the medication manually.');
      } finally {
        setSearching(false);
      }
    }, 450);
  }, [query, mode, db]);

  const pick = (c: RxCandidate) => {
    const parsed = parseRxName(c.name);
    setV((x) => ({ ...x, name: c.name, rxcui: c.rxcui, tty: c.tty, dosage: parsed.dosage || x.dosage, form: parsed.form || x.form }));
    setMode('form');
  };

  const addTime = () => {
    const t = newTime.trim().replace(/^(\d):/, '0$1:');
    if (!isValidTime(t)) {
      setErrors(['Enter the time as HH:MM in 24-hour format, e.g. 08:00 or 20:30.']);
      return;
    }
    if (v.times.includes(t)) return;
    set('times', [...v.times, t].sort());
    setNewTime('');
    setErrors([]);
  };

  const submit = async () => {
    const supply = v.supplyRemaining.trim() === '' ? null : Number(v.supplyRemaining);
    const errs = validateMedication({ name: v.name, quantityPerDose: Number(v.quantityPerDose), supplyRemaining: supply, refillThresholdDays: Number(v.refillThresholdDays) });
    if (supply !== null && Number.isNaN(supply)) errs.push('Supply on hand must be a number.');
    if (errs.length) return setErrors(errs);
    setSaving(true);
    try {
      await onSubmit(v);
    } catch (e: any) {
      setErrors([String(e?.message ?? e)]);
      setSaving(false);
    }
  };

  const tooShort = query.trim().length < 3;
  const shownResults = tooShort ? [] : results;
  const shownSuggestions = tooShort ? [] : suggestions;

  if (mode === 'search')
    return (
      <View style={{ gap: space.md }}>
        <Field label="Search medication name" placeholder="e.g. metformin, Lipitor, amoxicillin" value={query} onChangeText={setQuery} autoFocus autoCapitalize="none" autoCorrect={false} hint="Results come from RxNorm (U.S. National Library of Medicine)." />
        {searching ? <Loading /> : null}
        {searchError ? <Notice tone="warning">{searchError}</Notice> : null}
        {shownSuggestions.length > 0 && shownResults.length > 0 ? <P muted small>Showing results for “{shownSuggestions[0]}”.</P> : null}
        {!searching && query.trim().length >= 3 && shownResults.length === 0 && !searchError ? (
          <Notice>{shownSuggestions.length ? `No exact match. Did you mean: ${shownSuggestions.slice(0, 4).join(', ')}?` : 'No matches in RxNorm. You can enter it manually.'}</Notice>
        ) : null}
        {shownResults.map((c) => (
          <Pressable key={c.rxcui} onPress={() => pick(c)} accessibilityRole="button" accessibilityLabel={`${c.name}, ${c.kind}`} style={({ pressed }) => ({ padding: space.md, backgroundColor: pressed ? colors.primarySoft : colors.card, borderRadius: 10, borderWidth: 1, borderColor: colors.border })}>
            <Text style={{ fontSize: 16, color: colors.text, fontWeight: '600' }}>{c.name}</Text>
            <Text style={{ fontSize: 13, color: colors.textMuted }}>{c.kind} · RxCUI {c.rxcui}</Text>
          </Pressable>
        ))}
        <Button kind="secondary" title="Enter manually instead" onPress={() => { set('name', query); setMode('form'); }} />
      </View>
    );

  return (
    <View style={{ gap: space.md }}>
      <Card>
        <H2>Medication</H2>
        {v.rxcui ? (
          <Notice>
            <Text style={{ fontWeight: '700', color: colors.text, fontSize: 16 }}>{v.name}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>Matched in RxNorm · RxCUI {v.rxcui}</Text>
          </Notice>
        ) : (
          <Field label="Name" value={v.name} onChangeText={(t) => set('name', t)} placeholder="Medication name" hint="Manually entered – drug information lookup may be limited." />
        )}
        <Row>
          <Button small kind="ghost" title={v.rxcui ? 'Change (search again)' : 'Search RxNorm'} onPress={() => { setQuery(v.rxcui ? '' : v.name); setV((x) => ({ ...x, rxcui: null, tty: null })); setMode('search'); }} />
        </Row>
        <Row>
          <View style={{ flex: 1 }}><Field label="Strength" value={v.dosage} onChangeText={(t) => set('dosage', t)} placeholder="500 mg" /></View>
          <View style={{ flex: 1 }}><Field label="Form" value={v.form} onChangeText={(t) => set('form', t)} placeholder="tablet" /></View>
        </Row>
        <Field label="Instructions (optional)" value={v.instructions} onChangeText={(t) => set('instructions', t)} placeholder="Take with food" />
      </Card>

      <Card>
        <H2>Schedule & reminders</H2>
        <P muted small>You will get a reminder at each time, even when the app is closed or offline.</P>
        <Row wrap>
          {v.times.map((t) => (
            <Chip key={t} label={`${formatTime12(t)}  ✕`} selected onPress={() => set('times', v.times.filter((x) => x !== t))} accessibilityLabel={`Remove reminder at ${formatTime12(t)}`} />
          ))}
          {v.times.length === 0 ? <P muted small>No times – this medication will be “as needed” with no reminders.</P> : null}
        </Row>
        <Row>
          <View style={{ flex: 1 }}><Field label="Add a time (24-hour)" value={newTime} onChangeText={setNewTime} placeholder="20:00" keyboardType="numbers-and-punctuation" maxLength={5} onSubmitEditing={addTime} /></View>
          <Button title="Add" kind="secondary" onPress={addTime} style={{ marginTop: 10 }} accessibilityLabel="Add reminder time" />
        </Row>
        <Row wrap>
          {['08:00', '12:00', '18:00', '21:00'].filter((t) => !v.times.includes(t)).map((t) => (
            <Chip key={t} label={`+ ${formatTime12(t)}`} onPress={() => set('times', [...v.times, t].sort())} />
          ))}
        </Row>
        <P small style={{ fontWeight: '700', marginTop: space.sm }}>Days</P>
        <Row wrap>
          <Chip label="Every day" selected={v.daysOfWeek.length === 0} onPress={() => set('daysOfWeek', [])} />
          {[0, 1, 2, 3, 4, 5, 6].map((d) => (
            <Chip key={d} label={dayName(d)} selected={v.daysOfWeek.includes(d)} onPress={() => set('daysOfWeek', v.daysOfWeek.includes(d) ? v.daysOfWeek.filter((x) => x !== d) : [...v.daysOfWeek, d].sort())} />
          ))}
        </Row>
      </Card>

      <Card>
        <H2>Supply & refills</H2>
        <Row>
          <View style={{ flex: 1 }}><Field label="Per dose" value={v.quantityPerDose} onChangeText={(t) => set('quantityPerDose', t)} keyboardType="decimal-pad" /></View>
          <View style={{ flex: 1 }}><Field label="On hand" value={v.supplyRemaining} onChangeText={(t) => set('supplyRemaining', t)} keyboardType="decimal-pad" placeholder="e.g. 30" /></View>
          <View style={{ flex: 1 }}><Field label="Remind at (days)" value={v.refillThresholdDays} onChangeText={(t) => set('refillThresholdDays', t)} keyboardType="number-pad" /></View>
        </Row>
        <P muted small>Leave “On hand” empty to turn off refill tracking.</P>
      </Card>

      {errors.length ? <Notice tone="danger">{errors.join('\n')}</Notice> : null}
      <Button title={submitLabel} onPress={submit} loading={saving} />
    </View>
  );
}

export function formToMedication(v: MedicationFormValue) {
  return {
    name: v.name.trim(),
    rxcui: v.rxcui,
    tty: v.tty,
    dosage: v.dosage.trim(),
    form: v.form.trim(),
    quantityPerDose: Number(v.quantityPerDose) || 1,
    instructions: v.instructions.trim(),
    supplyRemaining: v.supplyRemaining.trim() === '' ? null : Number(v.supplyRemaining),
    refillThresholdDays: Number(v.refillThresholdDays) || 0,
  };
}

export function formToSchedules(v: MedicationFormValue) {
  return v.times.map((time) => ({ time, daysOfWeek: v.daysOfWeek, startDate: v.startDate, endDate: null }));
}
