// Clinician summary: medication list + adherence + how-I-feel notes, shared
// only when the user chooses (OS share sheet). Supports medication reconciliation.
import React, { useState } from 'react';
import { Share, Text } from 'react-native';
import { useApp, useData } from '@/state/AppState';
import * as repo from '@/data/repo';
import { loadAdherence } from '@/services/doses';
import { buildClinicianReport } from '@/core/report';
import { Button, Card, Notice, Screen, Segmented, Loading } from '@/components/ui';
import { colors } from '@/theme';

export default function Report() {
  const { activeProfile, settings } = useApp();
  const [days, setDays] = useState<30 | 90>(30);
  const { data } = useData(async (db) => {
    const meds = await repo.listMedications(db, activeProfile.id);
    const schedules = await repo.listSchedules(db, meds.map((m) => m.id));
    const adh = await loadAdherence(db, activeProfile.id, days, settings.graceMinutes);
    const notes = await repo.listNotes(db, meds.map((m) => m.id), Date.now() - days * 86400000);
    return buildClinicianReport({ profile: activeProfile, medications: meds, schedules, adherence: adh.byMedication, notes, periodDays: days, generatedAt: new Date() });
  }, [days]);
  if (!data) return <Loading />;
  return (
    <Screen>
      <Segmented label="Period" value={days} onChange={setDays} options={[{ value: 30, label: 'Last 30 days' }, { value: 90, label: 'Last 90 days' }]} />
      <Notice>Review before sharing. This summary includes your journal notes. It is only sent where you choose.</Notice>
      <Card>
        <Text selectable style={{ fontFamily: 'monospace', fontSize: 13, lineHeight: 19, color: colors.text }}>{data}</Text>
      </Card>
      <Button title="Share…" onPress={() => Share.share({ message: data, title: `PillPal summary – ${activeProfile.name}` })} />
    </Screen>
  );
}
