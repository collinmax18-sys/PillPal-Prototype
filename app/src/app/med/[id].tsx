import React from 'react';
import { Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useApp, useData } from '@/state/AppState';
import * as repo from '@/data/repo';
import { getLabel } from '@/services/druginfo';
import { loadAdherence, logExtraDose } from '@/services/doses';
import { shortName } from '@/services/notifications';
import { refillStatus } from '@/core/refill';
import { summarizeJournal, MOOD_EMOJI } from '@/core/effects';
import { dayName, formatTime12 } from '@/core/time';
import { confirm } from '@/components/dialogs';
import { Button, Card, H1, H2, Notice, P, ProgressBar, Row, Screen, Loading } from '@/components/ui';
import { NoteCard } from '@/components/NoteCard';
import { colors, space } from '@/theme';

export default function MedicationDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { db, settings, activeProfile, changed } = useApp();
  const { data, loading } = useData(async (d) => {
    const med = await repo.getMedication(d, id);
    if (!med) return null;
    const schedules = await repo.listSchedules(d, [id]);
    const notes = await repo.listNotes(d, [id]);
    const adh = await loadAdherence(d, med.profileId, 30, settings.graceMinutes);
    let label = med.rxcui ? await repo.getCachedLabel(d, med.rxcui) : null;
    if (!label && med.rxcui) label = (await getLabel(d, med.rxcui, med.name).catch(() => ({ label: null }))).label;
    return { med, schedules, notes, adherence: adh.byMedication.get(id), label };
  }, [id]);

  if (loading && !data) return <Loading />;
  if (!data) return <Screen><P>Medication not found.</P></Screen>;
  const { med, schedules, notes, adherence, label } = data;
  const rs = refillStatus(med, schedules);
  const js = summarizeJournal(notes);

  const toggleActive = async () => {
    await repo.updateMedication(db, med.id, { active: !med.active });
    changed();
  };
  const remove = () =>
    confirm('Delete medication?', `This permanently deletes ${shortName(med.name)} with its dose history and journal notes. To keep the history, choose "Stop taking" instead.`, 'Delete', async () => { await repo.deleteMedication(db, med.id); changed(); router.back(); }, true);
  const extra = async () => {
    const log = await logExtraDose(db, med);
    changed();
    if (settings.promptForNoteAfterDose) router.push({ pathname: '/note', params: { medId: med.id, logId: log.id } });
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: shortName(med.name) }} />
      <View>
        <H1>{shortName(med.name)}</H1>
        <P muted>{[med.dosage, med.form].filter(Boolean).join(' ')}{med.rxcui ? ` · RxCUI ${med.rxcui}` : ' · entered manually'}{activeProfile.relation !== 'Self' ? ` · for ${activeProfile.name}` : ''}</P>
      </View>
      {!med.active ? <Notice tone="warning">You have stopped taking this medication. Reminders are off; history is kept.</Notice> : null}

      <Row>
        <Button title="Drug information" style={{ flex: 1 }} onPress={() => router.push({ pathname: '/label', params: { medId: med.id } })} disabled={!med.rxcui} accessibilityLabel="Open trusted drug information" />
        <Button title="+ How I feel" kind="secondary" style={{ flex: 1 }} onPress={() => router.push({ pathname: '/note', params: { medId: med.id } })} />
      </Row>
      {!med.rxcui ? <P muted small>Drug information needs an RxNorm match. Edit the medication and search RxNorm to link it.</P> : null}

      <Card>
        <H2>Schedule</H2>
        {schedules.length ? (
          <P>{schedules.map((s) => formatTime12(s.time)).join(' · ')}{schedules[0].daysOfWeek.length ? ` on ${schedules[0].daysOfWeek.map(dayName).join(', ')}` : ' every day'}</P>
        ) : (
          <P muted>No schedule (as needed).</P>
        )}
        {med.instructions ? <P muted>{med.instructions}</P> : null}
        <Button small kind="secondary" title="Log an extra dose now" onPress={extra} />
      </Card>

      <Card>
        <H2>Last 30 days</H2>
        {adherence?.percent != null ? (
          <>
            <P>{adherence.percent}% taken · {adherence.taken} taken, {adherence.missed} missed, {adherence.skipped} skipped</P>
            <ProgressBar value={adherence.percent} />
          </>
        ) : (
          <P muted>No completed doses yet.</P>
        )}
        {rs.tracked ? <P style={{ color: rs.needsRefill ? colors.warning : colors.text }}>{med.supplyRemaining} on hand{rs.daysRemaining !== null ? ` · about ${rs.daysRemaining} days left` : ''}{rs.needsRefill ? ' – refill soon' : ''}</P> : null}
      </Card>

      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <H2>How it makes me feel</H2>
          {js.averageMood !== null ? <Text style={{ fontSize: 22 }} accessibilityLabel={`Average mood ${js.averageMood} of 5`}>{MOOD_EMOJI[Math.round(js.averageMood)]} {js.averageMood}</Text> : null}
        </Row>
        {js.count === 0 ? (
          <P muted>No notes yet. After a dose, record how you feel – PillPal checks your notes against this medication’s official label.</P>
        ) : (
          <>
            <P small muted>
              {js.count} notes{js.averageEffectiveness !== null ? ` · relief ${js.averageEffectiveness}/5` : ''}
              {js.moodTrend !== null ? ` · mood ${js.moodTrend > 0 ? 'improving' : js.moodTrend < 0 ? 'getting worse' : 'steady'} (${js.moodTrend > 0 ? '+' : ''}${js.moodTrend})` : ''}
            </P>
            {js.topEffects.length ? <P small>Most reported: {js.topEffects.map((e) => `${e.label} (${e.count})`).join(', ')}</P> : null}
          </>
        )}
      </Card>
      {notes.slice(0, 5).map((n) => <NoteCard key={n.id} note={n} labelSections={label?.sections} />)}
      {notes.length > 5 ? <Button kind="ghost" title={`See all ${notes.length} notes in Journal`} onPress={() => router.navigate('/journal')} /> : null}

      <View style={{ gap: space.sm, marginTop: space.md }}>
        <Button kind="secondary" title="Edit medication & schedule" onPress={() => router.push({ pathname: '/med/edit', params: { id: med.id } })} />
        <Button kind="secondary" title={med.active ? 'Stop taking (keep history)' : 'Resume taking'} onPress={toggleActive} />
        <Button kind="danger" title="Delete medication" onPress={remove} />
      </View>
    </Screen>
  );
}
