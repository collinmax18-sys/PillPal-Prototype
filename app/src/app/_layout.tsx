import React, { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SQLiteProvider } from 'expo-sqlite';
import * as Notifications from 'expo-notifications';
import * as Crypto from 'expo-crypto';
import { DB_NAME, initDatabase } from '@/data/device-db';
import { setIdGenerator } from '@/data/ids';
import { AppStateProvider, useApp } from '@/state/AppState';
import { Loading } from '@/components/ui';
import { colors } from '@/theme';
import { configureNotificationHandler, handleNotificationResponse, notificationsSupported, setupNotifications } from '@/services/notifications';

setIdGenerator(() => Crypto.randomUUID());
configureNotificationHandler();

/** Records doses from notification actions (works from a cold start too). */
function NotificationBridge() {
  const { db, changed, settings } = useApp();
  useEffect(() => {
    if (!notificationsSupported) return;
    let alive = true;
    const handle = async (resp: Notifications.NotificationResponse | null) => {
      if (!resp || !alive) return;
      const r = await handleNotificationResponse(db, resp);
      if (r.kind === 'none') return;
      changed();
      if (r.kind === 'taken' && settings.promptForNoteAfterDose) router.push({ pathname: '/note', params: { medId: r.medicationId!, logId: r.logId! } });
      else router.navigate('/');
    };
    setupNotifications().catch((e) => console.warn('notification setup failed', e));
    Notifications.getLastNotificationResponseAsync().then(handle);
    const sub = Notifications.addNotificationResponseReceivedListener(handle);
    return () => {
      alive = false;
      sub.remove();
    };
  }, [db, changed, settings.promptForNoteAfterDose]);
  return null;
}

export default function RootLayout() {
  return (
    <SQLiteProvider databaseName={DB_NAME} onInit={initDatabase}>
      <AppStateProvider fallback={<Loading />}>
        <NotificationBridge />
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.card },
            headerTintColor: colors.primary,
            headerTitleStyle: { color: colors.text, fontWeight: '700' },
            contentStyle: { backgroundColor: colors.bg },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'Back' }} />
          <Stack.Screen name="med/add" options={{ title: 'Add medication' }} />
          <Stack.Screen name="med/[id]" options={{ title: 'Medication' }} />
          <Stack.Screen name="med/edit" options={{ title: 'Edit medication' }} />
          <Stack.Screen name="label" options={{ title: 'Medication information' }} />
          <Stack.Screen name="note" options={{ title: 'How are you feeling?', presentation: 'modal' }} />
          <Stack.Screen name="report" options={{ title: 'Share with clinician' }} />
        </Stack>
      </AppStateProvider>
    </SQLiteProvider>
  );
}
