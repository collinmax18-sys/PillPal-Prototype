// "How are you feeling?" – the effects journal entry.
// Opened right after a dose is marked Taken (from the app or the reminder),
// or any time from a medication. While the user picks effects, PillPal shows
// which of them the medication's official FDA label lists – on-device.
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useApp, useData } from '@/state/AppState';
import * as repo from '@/data/repo';
import { shortName } from '@/services/notifications';
import { getLabel } from '@/services/druginfo';
import { EFFECT_TAGS, MOOD_EMOJI, MOOD_LABELS, SEVERITY_LABELS, matchEffectsToLabel, unlistedEffects, tagLabel } from '@/core/effects';
import { relativeMinutes } from '@/core/time';
import type { DoseLog, DrugLabel, EffectNote, Medication } from '@/core/types';
import { confirm } from '@/components/dialogs';
import { Button, Card, Chip, Field, H2, Notice, P, Row, Screen, Loading } from '@/components/ui';
import { colors, radius, space, TOUCH } from '@/theme';

const WHEN_OPTIONS = [0, 30, 60, 120, 240, 480];

export default function NoteScreen() {
  const { medId, logId, noteId } = useLocalSearchParams<{ medId: string; logId?: string; noteId?: string }>();
  const { data } = useData(async (d) => {
    const med = await repo.getMedication(d, medId);
    const log = logId ? await repo.getLog(d, logId) : null;
    const existing = noteId ? await repo.getNote(d, noteId) : null;
    let label = med?.rxcui ? await repo.getCachedLabel(d, med.rxcui) : null;
    // Not downloaded yet? Fetch it now (public data only) so the label check works offline next time.
    if (!label && med?.rxcui) label = (await getLabel(d, med.rxcui, med.name).catch(() => ({ label: null }))).label;
    return { med, log, existing, label };
  }, [medId, logId, noteId]);

  if (!data) return <Loading />;
  if (!data.med) return <Screen><P>Medication not found.</P></Screen>;
  return <NoteForm key={`${medId}|${logId ?? ''}|${noteId ?? ''}`} data={{ ...data, med: data.med }} logId={logId} />;
}

type NoteData = { med: Medication; log: DoseLog | null; existing: EffectNote | null; label: DrugLabel | null };

/** Default "when" = time since the dose was recorded, snapped to the closest option. */
function defaultMinutes(d: NoteData): number | null {
  if (d.existing) return d.existing.minutesAfterDose;
  if (!d.log) return null;
  const since = Math.max(0, Math.round((Date.now() - d.log.recordedAt) / 60000));
  return WHEN_OPTIONS.reduce((best, o) => (Math.abs(o - since) < Math.abs(best - since) ? o : best), 0);
}

function NoteForm({ data, logId }: { data: NoteData; logId?: string }) {
  const { db, changed } = useApp();
  const med = data.med;
  const e0 = data.existing;
  const [mood, setMood] = useState<number>(e0?.mood ?? 0);
  const [effectiveness, setEffectiveness] = useState<number | null>(e0?.effectiveness ?? null);
  const [effects, setEffects] = useState<string[]>(e0?.effects ?? []);
  const [severity, setSeverity] = useState<number | null>(e0?.severity ?? null);
  const [minutes, setMinutes] = useState<number | null>(() => defaultMinutes(data));
  const [text, setText] = useState(e0?.text ?? '');
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const matches = data.label ? matchEffectsToLabel(effects, data.label.sections) : [];
  const unlisted = data.label ? unlistedEffects(effects, matches) : [];

  const toggle = (id: string) => setEffects((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]));
  const sideEffectsChosen = effects.some((e) => EFFECT_TAGS.find((t) => t.id === e)?.kind === 'side-effect');

  const save = async () => {
    if (!mood) return setErrors(['Choose how you feel overall.']);
    setSaving(true);
    try {
      const payload = { mood, effectiveness, effects, severity: sideEffectsChosen ? severity : null, minutesAfterDose: minutes, text };
      if (data.existing) await repo.updateNote(db, data.existing.id, payload);
      else await repo.addNote(db, { ...payload, medicationId: med.id, doseLogId: logId ?? null });
      changed();
      router.back();
    } catch (e: any) {
      setErrors([String(e?.message ?? e)]);
      setSaving(false);
    }
  };

  const remove = () =>
    confirm('Delete this note?', '', 'Delete', async () => { await repo.deleteNote(db, data.existing!.id); changed(); router.back(); }, true);

  return (
    <Screen>
      <View>
        <Text style={{ fontSize: 22, fontWeight: '700', color: colors.text }}>{shortName(med.name)}</Text>
        <P muted>{data.log ? `Dose recorded ${new Date(data.log.recordedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : data.existing ? 'Edit journal entry' : 'Journal entry'}</P>
      </View>

      <Card>
        <H2>Overall, how do you feel?</H2>
        <Row style={{ justifyContent: 'space-between' }} >
          {[1, 2, 3, 4, 5].map((m) => (
            <Pressable
              key={m}
              onPress={() => setMood(m)}
              accessibilityRole="radio"
              accessibilityState={{ selected: mood === m }}
              accessibilityLabel={MOOD_LABELS[m]}
              style={{ alignItems: 'center', flex: 1, paddingVertical: space.sm, minHeight: TOUCH, borderRadius: radius.md, borderWidth: 2, borderColor: mood === m ? colors.primary : 'transparent', backgroundColor: mood === m ? colors.primarySoft : 'transparent' }}
            >
              <Text style={{ fontSize: 30 }} accessible={false}>{MOOD_EMOJI[m]}</Text>
              <Text style={{ fontSize: 11, fontWeight: '700', color: colors.text, textAlign: 'center' }}>{MOOD_LABELS[m]}</Text>
            </Pressable>
          ))}
        </Row>
      </Card>

      <Card>
        <H2>When is this about?</H2>
        <Row wrap>
          {WHEN_OPTIONS.map((o) => (
            <Chip key={o} label={o === 0 ? 'Right after' : `${relativeMinutes(o)} after`} selected={minutes === o} onPress={() => setMinutes(o)} />
          ))}
          <Chip label="Not tied to a dose" selected={minutes === null} onPress={() => setMinutes(null)} />
        </Row>
      </Card>

      <Card>
        <H2>Anything you noticed?</H2>
        <P muted small>Side effects</P>
        <Row wrap>
          {EFFECT_TAGS.filter((t) => t.kind === 'side-effect').map((t) => (
            <Chip key={t.id} label={t.label} selected={effects.includes(t.id)} onPress={() => toggle(t.id)} color={colors.warning} soft={colors.warningSoft} />
          ))}
        </Row>
        <P muted small style={{ marginTop: space.sm }}>Positive effects</P>
        <Row wrap>
          {EFFECT_TAGS.filter((t) => t.kind === 'positive').map((t) => (
            <Chip key={t.id} label={t.label} selected={effects.includes(t.id)} onPress={() => toggle(t.id)} color={colors.taken} soft={colors.takenSoft} />
          ))}
        </Row>
        {sideEffectsChosen ? (
          <>
            <P muted small style={{ marginTop: space.sm }}>How strong?</P>
            <Row>
              {[1, 2, 3].map((s) => (
                <Chip key={s} label={SEVERITY_LABELS[s]} selected={severity === s} onPress={() => setSeverity(severity === s ? null : s)} color={s === 3 ? colors.missed : colors.warning} soft={s === 3 ? colors.missedSoft : colors.warningSoft} />
              ))}
            </Row>
          </>
        ) : null}
      </Card>

      {effects.length > 0 && data.label ? (
        <Card style={{ borderColor: colors.warning }}>
          <H2>Label check</H2>
          <P muted small>Compared with the official FDA label for this medication (source: openFDA). This is information, not a diagnosis.</P>
          {matches.map((m) => (
            <View key={m.tagId} style={{ gap: 2, marginTop: space.xs }}>
              <Text style={{ fontWeight: '700', color: colors.warning, fontSize: 15 }}>✓ {m.tagLabel} – listed under “{m.sectionTitle}”</Text>
              <Text style={{ color: colors.textMuted, fontSize: 13, fontStyle: 'italic' }}>{m.excerpt}</Text>
            </View>
          ))}
          {unlisted.length ? <P small style={{ marginTop: space.xs }}>Not found in the label: {unlisted.map(tagLabel).join(', ')}. Mention it to your pharmacist or doctor if it continues.</P> : null}
        </Card>
      ) : effects.length > 0 && med.rxcui ? (
        <P muted small>The FDA label could not be downloaded right now, so the label check is unavailable. Your note will still be saved.</P>
      ) : null}

      {severity === 3 ? (
        <Notice tone="danger">If a side effect is severe or you think you are having an allergic reaction, contact a doctor or pharmacist now. In an emergency, call 911.</Notice>
      ) : null}

      <Card>
        <H2>Effectiveness</H2>
        <P muted small>Did it help with what you take it for? (optional)</P>
        <Row>
          {[1, 2, 3, 4, 5].map((e) => (
            <Chip key={e} label={String(e)} selected={effectiveness === e} onPress={() => setEffectiveness(effectiveness === e ? null : e)} accessibilityLabel={`Effectiveness ${e} of 5`} />
          ))}
        </Row>
        <P muted small>1 = no relief · 5 = fully effective</P>
      </Card>

      <Field label="Notes (optional)" value={text} onChangeText={setText} multiline maxLength={2000} placeholder="e.g. felt dizzy after standing up; better when taken with food" hint="Stays on this device. Included only if you share a clinician report." />

      {errors.length ? <Notice tone="danger">{errors.join('\n')}</Notice> : null}
      <Button title={data.existing ? 'Save changes' : 'Save note'} onPress={save} loading={saving} />
      {data.existing ? <Button kind="danger" title="Delete note" onPress={remove} /> : <Button kind="ghost" title="Not now" onPress={() => router.back()} />}
    </Screen>
  );
}
