// Medication history (FR5) and adherence (FR6).
import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { useApp, useData } from '@/state/AppState';
import { loadAdherence, markDose, type DoseItem } from '@/services/doses';
import { shortName } from '@/services/notifications';
import { formatDateLong, formatTime12 } from '@/core/time';
import { choose } from '@/components/dialogs';
import { Button, Card, Empty, H1, H2, P, ProgressBar, Row, Screen, Segmented, StatusBadge, Loading } from '@/components/ui';
import { AdherenceBars } from '@/components/Charts';
import { colors, space } from '@/theme';

export default function History() {
  const { db, activeProfile, settings, changed } = useApp();
  const [days, setDays] = useState<7 | 30 | 90>(7);
  const [showAll, setShowAll] = useState(false);
  const { data, loading } = useData((d) => loadAdherence(d, activeProfile.id, days, settings.graceMinutes), [days]);
  if (loading && !data) return <Loading />;
  if (!data) return null;
  const past = data.items.filter((i) => i.status !== 'upcoming').reverse();
  const shown = showAll ? past : past.slice(0, 25);
  const meds = new Map(data.items.map((i) => [i.med.id, i.med]));

  const correct = (item: DoseItem) =>
    choose(shortName(item.med.name), `${formatDateLong(item.dose.date)} at ${formatTime12(item.dose.time)}`, [
      { text: 'Taken', onPress: async () => { await markDose(db, item, 'taken'); changed(); } },
      { text: 'Skipped', onPress: async () => { await markDose(db, item, 'skipped'); changed(); } },
      { text: 'Missed', onPress: async () => { await markDose(db, item, 'missed'); changed(); } },
    ]);

  return (
    <Screen>
      <H1>History</H1>
      <Segmented label="Time period" value={days} onChange={setDays} options={[{ value: 7, label: '7 days' }, { value: 30, label: '30 days' }, { value: 90, label: '90 days' }]} />
      {data.overall.resolved === 0 ? (
        <Empty title="No history yet" body="Doses you record (or miss) will appear here." />
      ) : (
        <>
          <Card accessibilityLabel={`Adherence ${data.overall.percent} percent`}>
            <Row style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <View>
                <Text style={{ fontSize: 40, fontWeight: '800', color: colors.text }}>{data.overall.percent}%</Text>
                <P muted small>of doses taken · last {days} days</P>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ color: colors.taken, fontWeight: '700' }}>{data.overall.taken} taken</Text>
                <Text style={{ color: colors.skipped, fontWeight: '700' }}>{data.overall.skipped} skipped</Text>
                <Text style={{ color: colors.missed, fontWeight: '700' }}>{data.overall.missed} missed</Text>
              </View>
            </Row>
            <AdherenceBars daily={data.daily} />
          </Card>
          <Card>
            <H2>By medication</H2>
            {[...data.byMedication.entries()].map(([id, a]) => (
              <View key={id} style={{ gap: 4, marginBottom: space.sm }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Text style={{ fontWeight: '600', color: colors.text, flex: 1 }} numberOfLines={1}>{shortName(meds.get(id)?.name ?? '')}</Text>
                  <Text style={{ fontWeight: '700', color: colors.text }}>{a.percent ?? '–'}%</Text>
                </Row>
                <ProgressBar value={a.percent} color={(a.percent ?? 0) >= 80 ? colors.taken : (a.percent ?? 0) >= 60 ? '#C9A13B' : colors.missed} />
              </View>
            ))}
          </Card>
          <Button kind="secondary" title="Share with my clinician" onPress={() => router.push('/report')} />
          <H2 style={{ marginTop: space.md }}>Dose record</H2>
          <P muted small>Tap a dose to correct it.</P>
          {shown.map((i, idx) => {
            const header = idx === 0 || shown[idx - 1].dose.date !== i.dose.date ? formatDateLong(i.dose.date) : null;
            return (
              <View key={i.dose.id} style={{ gap: space.xs }}>
                {header ? <Text style={{ fontWeight: '700', color: colors.textMuted, marginTop: space.sm }}>{header}</Text> : null}
                <Card onPress={() => correct(i)} accessibilityLabel={`${shortName(i.med.name)} ${formatTime12(i.dose.time)}, ${i.status}. Tap to change.`} style={{ paddingVertical: space.md }}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: '600', color: colors.text }} numberOfLines={1}>{shortName(i.med.name)}</Text>
                      <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                        {formatTime12(i.dose.time)}{i.log?.source === 'auto' ? ' · auto-marked after grace period' : i.log?.source === 'notification' ? ' · from reminder' : ''}
                      </Text>
                    </View>
                    <StatusBadge status={i.status} />
                  </Row>
                </Card>
              </View>
            );
          })}
          {past.length > shown.length ? <Button kind="ghost" title={`Show all ${past.length}`} onPress={() => setShowAll(true)} /> : null}
        </>
      )}
    </Screen>
  );
}
