// Today – the core workflow: see what is due, record Taken / Skipped,
// and (optionally) note how the dose made you feel.
import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { useApp, useData } from '@/state/AppState';
import { loadDoses, markDose, type DoseItem } from '@/services/doses';
import { shortName } from '@/services/notifications';
import * as repo from '@/data/repo';
import { refillStatus } from '@/core/refill';
import { dateKey, formatDateLong, formatTime12 } from '@/core/time';
import { choose } from '@/components/dialogs';
import { Button, Card, Empty, H1, Notice, P, ProgressBar, Row, Screen, StatusBadge, Loading } from '@/components/ui';
import { ProfileStrip } from '@/components/ProfileStrip';
import { colors, space } from '@/theme';
import type { LoggedStatus } from '@/core/types';

export default function Today() {
  const { db, settings, activeProfile, changed } = useApp();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000); // statuses move from upcoming → due → missed
    return () => clearInterval(t);
  }, []);
  const today = dateKey(now);
  const { data, loading } = useData(async (d) => {
    const items = await loadDoses(d, activeProfile.id, today, today, settings.graceMinutes, now);
    const meds = await repo.listMedications(d, activeProfile.id, false);
    const schedules = await repo.listSchedules(d, meds.map((m) => m.id));
    const lowSupply = meds.map((m) => ({ med: m, rs: refillStatus(m, schedules.filter((s) => s.medicationId === m.id), today) })).filter((x) => x.rs.needsRefill);
    return { items, lowSupply, medCount: meds.length };
  }, [today, now]);

  const record = async (item: DoseItem, status: LoggedStatus) => {
    const log = await markDose(db, item, status);
    changed();
    if (status === 'taken' && settings.promptForNoteAfterDose) router.push({ pathname: '/note', params: { medId: item.med.id, logId: log.id } });
  };

  const correct = (item: DoseItem) =>
    choose(shortName(item.med.name), `Change the record for ${formatTime12(item.dose.time)}?`, [
      { text: 'Taken', onPress: () => record(item, 'taken') },
      { text: 'Skipped', onPress: () => record(item, 'skipped') },
      { text: 'Missed', onPress: () => record(item, 'missed') },
    ]);

  if (loading && !data) return <Loading />;
  const items = data?.items ?? [];
  const taken = items.filter((i) => i.status === 'taken').length;
  const due = items.filter((i) => i.status === 'due');

  return (
    <Screen>
      <View>
        <P muted>{formatDateLong(today)}</P>
        <H1>{settings.role === 'personal' && activeProfile.relation === 'Self' ? 'Today' : `${activeProfile.name} – today`}</H1>
      </View>
      <ProfileStrip />

      {items.length > 0 ? (
        <Card accessibilityLabel={`${taken} of ${items.length} doses taken today`}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text }}>{taken} of {items.length} doses taken</Text>
            {due.length ? <Text style={{ color: colors.due, fontWeight: '700' }}>{due.length} due now</Text> : null}
          </Row>
          <ProgressBar value={(taken / items.length) * 100} />
        </Card>
      ) : null}

      {data?.lowSupply.map(({ med, rs }) => (
        <Notice key={med.id} tone="warning">
          <Text style={{ fontWeight: '700', color: colors.warning, fontSize: 16 }}>Refill soon: {shortName(med.name)}</Text>
          <Text style={{ color: colors.text, fontSize: 15 }}>{rs.daysRemaining === null ? 'Supply is empty.' : `About ${rs.daysRemaining} day${rs.daysRemaining === 1 ? '' : 's'} left (${med.supplyRemaining} on hand).`}</Text>
        </Notice>
      ))}

      {items.length === 0 ? (
        data?.medCount ? (
          <Empty title="Nothing scheduled today" body="Medications without a schedule can still be logged from the Medications tab." />
        ) : (
          <Empty
            title="No medications yet"
            body="Add your first medication to start getting reminders."
            action={<Button title="Add medication" onPress={() => router.push('/med/add')} />}
          />
        )
      ) : (
        items.map((item) => <DoseCard key={item.dose.id} item={item} onRecord={record} onCorrect={correct} />)
      )}

      <P muted small style={{ textAlign: 'center', marginTop: space.md }}>
        PillPal helps you organize medications. It does not give medical advice.
      </P>
    </Screen>
  );
}

function DoseCard({ item, onRecord, onCorrect }: { item: DoseItem; onRecord: (i: DoseItem, s: LoggedStatus) => void; onCorrect: (i: DoseItem) => void }) {
  const { med, dose, status } = item;
  const open = status === 'due' || status === 'upcoming' || (status === 'missed' && item.log?.source === 'auto') || (status === 'missed' && !item.log);
  return (
    <Card style={status === 'due' ? { borderColor: colors.due, borderWidth: 2 } : undefined}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textMuted }}>{formatTime12(dose.time)}</Text>
        <StatusBadge status={status} />
      </Row>
      <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }} onPress={() => router.push({ pathname: '/med/[id]', params: { id: med.id } })}>
        {shortName(med.name)}
      </Text>
      {med.instructions ? <P muted small>{med.instructions}</P> : null}
      {open ? (
        <Row style={{ marginTop: space.xs }}>
          <Button title="✓ Taken" kind="success" onPress={() => onRecord(item, 'taken')} style={{ flex: 1 }} accessibilityLabel={`Mark ${shortName(med.name)} as taken`} />
          <Button title="Skip" kind="secondary" onPress={() => onRecord(item, 'skipped')} style={{ flex: 1 }} accessibilityLabel={`Skip ${shortName(med.name)}`} />
        </Row>
      ) : (
        <Row style={{ justifyContent: 'space-between' }}>
          <P muted small>
            {item.log ? `Recorded ${new Date(item.log.recordedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}${item.log.source === 'notification' ? ' from reminder' : ''}` : ''}
          </P>
          <Row style={{ gap: 0 }}>
            {status === 'taken' ? (
              <Button small kind="ghost" title="+ How I feel" onPress={() => router.push({ pathname: '/note', params: { medId: med.id, logId: item.log!.id } })} />
            ) : null}
            <Button small kind="ghost" title="Change" onPress={() => onCorrect(item)} accessibilityLabel={`Change the record for ${shortName(med.name)} at ${formatTime12(dose.time)}`} />
          </Row>
        </Row>
      )}
    </Card>
  );
}
