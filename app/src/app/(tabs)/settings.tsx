import React, { useEffect, useState } from 'react';
import { Platform, Switch, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useApp } from '@/state/AppState';
import * as repo from '@/data/repo';
import { DEMO_MEDS, seedDemo } from '@/data/seed';
import { prefetchLabel } from '@/services/druginfo';
import { getEncryptionState } from '@/data/device-db';
import { notificationsSupported, pendingCount, rescheduleAll, sendTestReminder, setupNotifications } from '@/services/notifications';
import { confirm } from '@/components/dialogs';
import { Button, Card, Field, H1, H2, Notice, P, Row, Screen, Segmented } from '@/components/ui';
import { colors, space } from '@/theme';
import type { Role } from '@/core/types';

export default function SettingsScreen() {
  const { db, settings, profiles, activeProfile, updateSettings, changed, reload } = useApp();
  const [newName, setNewName] = useState('');
  const [newRelation, setNewRelation] = useState('');
  const [pending, setPending] = useState<number | null>(null);
  const enc = getEncryptionState();

  useEffect(() => {
    pendingCount().then(setPending);
  }, [settings]);

  const addProfile = async () => {
    if (!newName.trim()) return;
    const p = await repo.createProfile(db, newName, newRelation || 'Family');
    setNewName('');
    setNewRelation('');
    await updateSettings({ activeProfileId: p.id });
    changed();
  };

  const removeProfile = (id: string, name: string) =>
    confirm(`Remove ${name}?`, 'All medications, history and notes for this person will be deleted from this device.', 'Remove', async () => { await repo.deleteProfile(db, id); await reload(); changed(); }, true);

  const loadDemo = () =>
    confirm('Load demo data?', 'Adds a synthetic person "Alex (demo)" with 4 medications, 30 days of history and journal notes. No real patient data.', 'Load', async () => { await seedDemo(db); await reload(); changed(); router.navigate('/'); for (const m of DEMO_MEDS) void prefetchLabel(db, m.rxcui, m.name); });

  const erase = () =>
    confirm('Delete all my data?', 'Permanently removes every profile, medication, dose record and journal note from this device. This cannot be undone.', 'Delete everything', async () => { await repo.eraseAll(db); await reload(); changed(); }, true);

  return (
    <Screen>
      <H1>Settings</H1>

      <Card>
        <H2>How do you use PillPal?</H2>
        <Segmented<Role>
          label="Role"
          value={settings.role}
          onChange={(r) => updateSettings({ role: r })}
          options={[{ value: 'personal', label: 'For me' }, { value: 'caregiver', label: 'Caregiver' }, { value: 'professional', label: 'Care pro' }]}
        />
        <P muted small>Caregivers and care professionals see everyone they manage on the Today screen.</P>
      </Card>

      <Card>
        <H2>People</H2>
        {profiles.map((p) => (
          <Row key={p.id} style={{ justifyContent: 'space-between', paddingVertical: 4 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>{p.name}{p.id === activeProfile.id ? ' (showing)' : ''}</Text>
              <Text style={{ color: colors.textMuted }}>{p.relation}</Text>
            </View>
            {p.id !== activeProfile.id ? <Button small kind="secondary" title="Show" onPress={() => updateSettings({ activeProfileId: p.id })} /> : null}
            {profiles.length > 1 ? <Button small kind="ghost" title="Remove" onPress={() => removeProfile(p.id, p.name)} accessibilityLabel={`Remove ${p.name}`} /> : null}
          </Row>
        ))}
        <Row>
          <View style={{ flex: 1 }}><Field label="Name" value={newName} onChangeText={setNewName} placeholder="e.g. Mom" /></View>
          <View style={{ flex: 1 }}><Field label="Relationship" value={newRelation} onChangeText={setNewRelation} placeholder="Mother" /></View>
        </Row>
        <Button kind="secondary" title="Add person" onPress={addProfile} disabled={!newName.trim()} />
      </Card>

      <Card>
        <H2>Reminders</H2>
        <P small>Mark a dose “Missed” if not recorded within:</P>
        <Segmented<number> label="Grace period" value={settings.graceMinutes} onChange={(g) => updateSettings({ graceMinutes: g })} options={[30, 60, 120, 240].map((g) => ({ value: g, label: g < 60 ? `${g} min` : `${g / 60} h` }))} />
        <Row style={{ justifyContent: 'space-between', marginTop: space.sm }}>
          <Text style={{ fontSize: 16, color: colors.text, flex: 1 }}>Ask “How do you feel?” after each dose</Text>
          <Switch value={settings.promptForNoteAfterDose} onValueChange={(v) => updateSettings({ promptForNoteAfterDose: v })} accessibilityLabel="Ask how you feel after each dose" />
        </Row>
        {notificationsSupported ? (
          <>
            <P muted small>{pending !== null ? `${pending} reminders scheduled on this device (rolling 7-day window).` : ''}</P>
            <Row wrap>
              <Button small kind="secondary" title="Send test reminder (5 s)" onPress={async () => { await setupNotifications(); await sendTestReminder(5); }} />
              <Button small kind="ghost" title="Re-schedule now" onPress={async () => { const r = await rescheduleAll(db); setPending(r.scheduled + r.refillReminders); }} />
            </Row>
          </>
        ) : (
          <Notice tone="warning">Reminders need the Android or iOS app. The web preview cannot schedule device notifications.</Notice>
        )}
      </Card>

      <Card>
        <H2>Privacy & security</H2>
        <P small>
          Database encryption:{' '}
          <Text style={{ fontWeight: '700', color: enc === 'sqlcipher' ? colors.taken : colors.warning }}>
            {enc === 'sqlcipher' ? 'On (SQLCipher, key in device keystore)' : enc === 'web' ? 'Not available in the web preview' : 'Off in this build (Expo Go has no SQLCipher – use a development build)'}
          </Text>
        </P>
        <P muted small>Your medications, dose history and notes stay on this device. Only drug names and public drug IDs are sent to RxNorm and openFDA.</P>
        <Button small kind="secondary" title="Share summary with my clinician" onPress={() => router.push('/report')} />
      </Card>

      <Card>
        <H2>Demo & data</H2>
        <Button small kind="secondary" title="Load synthetic demo data" onPress={loadDemo} />
        <Button small kind="danger" title="Delete all my data" onPress={erase} />
      </Card>

      <P muted small style={{ textAlign: 'center' }}>
        PillPal prototype · COMP 4310 · {Platform.OS}{'\n'}Drug data: RxNorm (NLM) and openFDA. PillPal is an organizational and informational tool and does not replace advice from a doctor or pharmacist.
      </P>
    </Screen>
  );
}
