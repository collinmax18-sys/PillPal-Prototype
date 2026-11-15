// Reminder Engine – device part (FR2, FR3, NFR2).
// Local notifications are scheduled on the phone, so they fire with the app
// closed and with no Internet connection. Because iOS keeps only the 64
// soonest pending notifications (and Android drops alarms on reboot), we keep
// a rolling window and re-schedule on every app open and data change.

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { Db } from '../data/schema';
import * as repo from '../data/repo';
import { generateDoses, notificationWindow, parseDoseId } from '../core/schedule';
import { indexLogs } from '../core/adherence';
import { refillStatus, decrementSupply } from '../core/refill';
import { addDays, dateKey, DAY, localDateTime } from '../core/time';

export const DOSE_CATEGORY = 'dose';
export const ACTION_TAKE = 'take';
export const ACTION_SKIP = 'skip';
const CHANNEL_ID = 'dose-reminders';
const WINDOW_DAYS = 7;
const MAX_PENDING = 60; // stay under iOS's 64 limit, leaving room for refill reminders

export const notificationsSupported = Platform.OS !== 'web';

export function configureNotificationHandler() {
  if (!notificationsSupported) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export async function setupNotifications(): Promise<{ granted: boolean }> {
  if (!notificationsSupported) return { granted: false };
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Dose reminders',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
    });
  }
  await Notifications.setNotificationCategoryAsync(DOSE_CATEGORY, [
    { identifier: ACTION_TAKE, buttonTitle: 'Taken ✓', options: { opensAppToForeground: true } },
    { identifier: ACTION_SKIP, buttonTitle: 'Skip', options: { opensAppToForeground: true } },
  ]);
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return { granted: true };
  const req = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: false, allowSound: true } });
  return { granted: req.granted || req.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL };
}

export interface RescheduleResult {
  scheduled: number;
  refillReminders: number;
}

/** Rebuild every pending reminder from the database (all profiles this device manages). */
export async function rescheduleAll(db: Db, now = Date.now()): Promise<RescheduleResult> {
  if (!notificationsSupported) return { scheduled: 0, refillReminders: 0 };
  const profiles = await repo.listProfiles(db);
  const profileName = new Map(profiles.map((p) => [p.id, p.name]));
  const meds = (await Promise.all(profiles.map((p) => repo.listMedications(db, p.id, false)))).flat();
  const medById = new Map(meds.map((m) => [m.id, m]));
  const schedules = await repo.listActiveSchedules(db);
  const today = dateKey(now);
  const doses = generateDoses(schedules, today, addDays(today, WINDOW_DAYS));
  const logs = indexLogs(await repo.listLogs(db, meds.map((m) => m.id), now - DAY, now + (WINDOW_DAYS + 1) * DAY));
  const upcoming = notificationWindow(doses, logs, now, MAX_PENDING);

  await Notifications.cancelAllScheduledNotificationsAsync();
  const multiProfile = profiles.length > 1;
  for (const d of upcoming) {
    const med = medById.get(d.medicationId);
    if (!med) continue;
    const who = multiProfile ? `${profileName.get(med.profileId)}: ` : '';
    await Notifications.scheduleNotificationAsync({
      identifier: d.id,
      content: {
        title: `${who}Time for ${shortName(med.name)}`,
        body: [med.quantityPerDose !== 1 ? `${med.quantityPerDose} × ${med.form || 'dose'}` : med.dosage, med.instructions].filter(Boolean).join(' · ') || 'Tap to record your dose',
        categoryIdentifier: DOSE_CATEGORY,
        data: { doseId: d.id, medicationId: d.medicationId, scheduledAt: d.at },
        sound: true,
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(d.at), channelId: CHANNEL_ID },
    });
  }

  // Refill reminders: one per medication that is running low, next morning at 10:00.
  let refills = 0;
  for (const med of meds) {
    const rs = refillStatus(med, schedules.filter((s) => s.medicationId === med.id), today);
    if (!rs.needsRefill) continue;
    let at = localDateTime(today, '10:00');
    if (at <= now) at = localDateTime(addDays(today, 1), '10:00');
    await Notifications.scheduleNotificationAsync({
      identifier: `refill@${med.id}`,
      content: {
        title: `Refill soon: ${shortName(med.name)}`,
        body: rs.daysRemaining === null ? 'Supply is empty.' : `About ${rs.daysRemaining} day${rs.daysRemaining === 1 ? '' : 's'} left.`,
        data: { refillMedicationId: med.id },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(at), channelId: CHANNEL_ID },
    });
    refills++;
  }
  return { scheduled: upcoming.length, refillReminders: refills };
}

export function shortName(name: string): string {
  // "metformin hydrochloride 500 MG Oral Tablet" -> "metformin hydrochloride 500 mg"
  return name.replace(/\s+(Oral|Extended|Delayed|Chewable|Topical|Injectable)\b.*$/i, '').replace(/\bMG\b/g, 'mg').replace(/\bML\b/g, 'mL');
}

/**
 * Handle a tap on a reminder or one of its action buttons. Returns what was
 * recorded so the UI can follow up (e.g. open the "How do you feel?" note).
 */
export async function handleNotificationResponse(db: Db, response: Notifications.NotificationResponse): Promise<{ kind: 'taken' | 'skipped' | 'opened' | 'none'; doseId?: string; medicationId?: string; logId?: string }> {
  const data = response.notification.request.content.data as any;
  if (!data?.doseId) return { kind: 'none' };
  const handledKey = `handled:${response.notification.request.identifier}:${response.actionIdentifier}`;
  if (await repo.getSetting(db, handledKey)) return { kind: 'none' };
  await repo.setSetting(db, handledKey, String(Date.now()));
  const parsed = parseDoseId(data.doseId);
  const scheduledAt = Number(data.scheduledAt) || (parsed ? localDateTime(parsed.date, parsed.time) : Date.now());
  if (response.actionIdentifier === ACTION_TAKE || response.actionIdentifier === ACTION_SKIP) {
    const status = response.actionIdentifier === ACTION_TAKE ? 'taken' : 'skipped';
    const log = await repo.recordDose(db, { doseId: data.doseId, medicationId: data.medicationId, scheduledAt }, status, 'notification');
    if (status === 'taken') {
      const med = await repo.getMedication(db, data.medicationId);
      if (med) await repo.updateMedication(db, med.id, { supplyRemaining: decrementSupply(med) });
    }
    return { kind: status, doseId: data.doseId, medicationId: data.medicationId, logId: log.id };
  }
  return { kind: 'opened', doseId: data.doseId, medicationId: data.medicationId };
}

export async function sendTestReminder(seconds = 5): Promise<void> {
  if (!notificationsSupported) return;
  await Notifications.scheduleNotificationAsync({
    content: { title: 'PillPal test reminder', body: 'Reminders are working on this device.' },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds, channelId: CHANNEL_ID },
  });
}

export async function pendingCount(): Promise<number> {
  if (!notificationsSupported) return 0;
  return (await Notifications.getAllScheduledNotificationsAsync()).length;
}
