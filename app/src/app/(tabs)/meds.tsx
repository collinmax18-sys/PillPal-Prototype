import React from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { useApp, useData } from '@/state/AppState';
import * as repo from '@/data/repo';
import { loadAdherence } from '@/services/doses';
import { shortName } from '@/services/notifications';
import { refillStatus } from '@/core/refill';
import { formatTime12 } from '@/core/time';
import { Button, Card, Empty, H1, P, ProgressBar, Row, Screen, Loading } from '@/components/ui';
import { colors } from '@/theme';

export default function Meds() {
  const { activeProfile, settings } = useApp();
  const { data, loading } = useData(async (db) => {
    const meds = await repo.listMedications(db, activeProfile.id);
    const schedules = await repo.listSchedules(db, meds.map((m) => m.id));
    const adh = await loadAdherence(db, activeProfile.id, 30, settings.graceMinutes);
    return { meds, schedules, adh };
  });
  if (loading && !data) return <Loading />;
  const meds = data?.meds ?? [];
  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <H1>Medications</H1>
        <Button small title="+ Add" onPress={() => router.push('/med/add')} accessibilityLabel="Add medication" />
      </Row>
      {meds.length === 0 ? (
        <Empty title="No medications yet" body="Search the RxNorm drug database or enter one manually." action={<Button title="Add medication" onPress={() => router.push('/med/add')} />} />
      ) : (
        meds.map((m) => {
          const sch = data!.schedules.filter((s) => s.medicationId === m.id);
          const a = data!.adh.byMedication.get(m.id);
          const rs = refillStatus(m, sch);
          return (
            <Card key={m.id} onPress={() => router.push({ pathname: '/med/[id]', params: { id: m.id } })} accessibilityLabel={`${m.name}. ${a?.percent != null ? `${a.percent}% adherence` : ''}`} style={!m.active ? { opacity: 0.6 } : undefined}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text, flex: 1 }}>{shortName(m.name)}</Text>
                {!m.active ? <Text style={{ color: colors.textMuted, fontWeight: '700' }}>Stopped</Text> : null}
              </Row>
              <P muted small>
                {sch.length ? sch.map((s) => formatTime12(s.time)).join(' · ') : 'No schedule'}
                {m.rxcui ? '' : ' · entered manually'}
              </P>
              {a?.percent != null ? (
                <View style={{ gap: 4 }}>
                  <P small>{a.percent}% taken · last 30 days</P>
                  <ProgressBar value={a.percent} color={a.percent >= 80 ? colors.taken : a.percent >= 60 ? colors.skipped : colors.missed} />
                </View>
              ) : null}
              {rs.needsRefill && m.active ? <Text style={{ color: colors.warning, fontWeight: '700' }}>Refill soon – {rs.daysRemaining ?? 0} days left</Text> : null}
            </Card>
          );
        })
      )}
    </Screen>
  );
}
