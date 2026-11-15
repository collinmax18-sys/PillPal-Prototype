import React from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useApp, useData } from '@/state/AppState';
import * as repo from '@/data/repo';
import { MedicationForm, formToMedication, formToSchedules, initialForm } from '@/components/MedicationForm';
import { Loading, Screen } from '@/components/ui';

export default function EditMedication() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { db, changed } = useApp();
  const { data } = useData(async (d) => ({ med: await repo.getMedication(d, id), schedules: await repo.listSchedules(d, [id]) }), [id]);
  if (!data) return <Loading />;
  if (!data.med) return null;
  return (
    <Screen>
      <MedicationForm
        initial={initialForm(data.med, data.schedules)}
        submitLabel="Save changes"
        onSubmit={async (v) => {
          await repo.updateMedication(db, id, formToMedication(v));
          await repo.replaceSchedules(db, id, formToSchedules(v));
          changed();
          router.back();
        }}
      />
    </Screen>
  );
}
