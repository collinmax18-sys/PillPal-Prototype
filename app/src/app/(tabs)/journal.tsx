// Effects journal – every "how did it make me feel" note, with per-medication
// summaries and the on-device label check.
import React, { useState } from 'react';
import { Text } from 'react-native';
import { router } from 'expo-router';
import { useApp, useData } from '@/state/AppState';
import * as repo from '@/data/repo';
import { shortName } from '@/services/notifications';
import { summarizeJournal, MOOD_EMOJI } from '@/core/effects';
import type { LabelSection } from '@/core/types';
import { Button, Card, Chip, Empty, H1, H2, P, Row, Screen, Loading } from '@/components/ui';
import { NoteCard } from '@/components/NoteCard';
import { MoodTimeline } from '@/components/Charts';
import { colors } from '@/theme';

export default function Journal() {
  const { activeProfile } = useApp();
  const [filter, setFilter] = useState<string | null>(null);
  const { data, loading } = useData(async (db) => {
    const meds = await repo.listMedications(db, activeProfile.id);
    const notes = await repo.listNotes(db, meds.map((m) => m.id));
    const labels = new Map<string, LabelSection[]>();
    for (const m of meds) if (m.rxcui) { const l = await repo.getCachedLabel(db, m.rxcui); if (l) labels.set(m.id, l.sections); }
    return { meds, notes, labels };
  });
  if (loading && !data) return <Loading />;
  const meds = data?.meds ?? [];
  const notes = (data?.notes ?? []).filter((n) => !filter || n.medicationId === filter);
  const medName = new Map(meds.map((m) => [m.id, shortName(m.name)]));
  const s = summarizeJournal(notes);

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <H1>Journal</H1>
        {meds.length ? <Button small title="+ Note" onPress={() => router.push({ pathname: '/note', params: { medId: filter ?? meds[0].id } })} accessibilityLabel="Add a journal note" /> : null}
      </Row>
      <P muted>How your medications make you feel, in your own words.</P>
      {meds.length > 1 ? (
        <Row wrap>
          <Chip label="All" selected={!filter} onPress={() => setFilter(null)} />
          {meds.map((m) => <Chip key={m.id} label={shortName(m.name).split(' ')[0]} selected={filter === m.id} onPress={() => setFilter(m.id)} />)}
        </Row>
      ) : null}
      {s.count === 0 ? (
        <Empty title="No notes yet" body="After you mark a dose as taken, PillPal asks how you feel. You can also add a note any time." />
      ) : (
        <>
          <Card>
            <Row style={{ justifyContent: 'space-between' }}>
              <H2>Summary</H2>
              <Text style={{ fontSize: 20 }}>{s.averageMood !== null ? `${MOOD_EMOJI[Math.round(s.averageMood)]} ${s.averageMood}/5` : ''}</Text>
            </Row>
            <P small>
              {s.count} notes{s.averageEffectiveness !== null ? ` · average relief ${s.averageEffectiveness}/5` : ''}
              {s.moodTrend !== null ? ` · mood ${s.moodTrend > 0 ? 'improving' : s.moodTrend < 0 ? 'declining' : 'steady'}` : ''}
              {s.severeCount ? ` · ${s.severeCount} severe` : ''}
            </P>
            {s.topEffects.length ? <P small muted>Most reported: {s.topEffects.map((e) => `${e.label} (${e.count})`).join(', ')}</P> : null}
            <MoodTimeline notes={notes} />
          </Card>
          {notes.map((n) => (
            <NoteCard key={n.id} note={n} medName={filter ? undefined : medName.get(n.medicationId)} labelSections={data?.labels.get(n.medicationId)} />
          ))}
        </>
      )}
      {s.count > 0 ? <Button kind="secondary" title="Share summary with my clinician" onPress={() => router.push('/report')} /> : null}
      <P muted small style={{ color: colors.textMuted }}>Notes stay on this device and are never sent to drug databases or any other service.</P>
    </Screen>
  );
}
