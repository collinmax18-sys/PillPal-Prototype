import React from 'react';
import { router } from 'expo-router';
import { useApp } from '@/state/AppState';
import * as repo from '@/data/repo';
import { prefetchLabel } from '@/services/druginfo';
import { MedicationForm, formToMedication, formToSchedules, initialForm } from '@/components/MedicationForm';
import { Screen } from '@/components/ui';

export default function AddMedication() {
  const { db, activeProfile, changed } = useApp();
  return (
    <Screen>
      <MedicationForm
        searchFirst
        initial={initialForm()}
        submitLabel="Save medication"
        onSubmit={async (v) => {
          const med = await repo.createMedication(db, { ...formToMedication(v), profileId: activeProfile.id, active: true });
          await repo.replaceSchedules(db, med.id, formToSchedules(v));
          if (med.rxcui) void prefetchLabel(db, med.rxcui, med.name);
          changed();
          router.replace({ pathname: '/med/[id]', params: { id: med.id } });
        }}
      />
    </Screen>
  );
}
