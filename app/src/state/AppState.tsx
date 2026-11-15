// App-wide state: settings, the active profile and a data "version" that
// screens watch so they reload after any change (dose recorded, med edited…).
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState as RNAppState } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import type { Db } from '../data/schema';
import * as repo from '../data/repo';
import type { Profile, Settings } from '../core/types';
import { applyAutoMissed } from '../services/doses';
import { rescheduleAll } from '../services/notifications';

interface Ctx {
  db: Db;
  settings: Settings;
  profiles: Profile[];
  activeProfile: Profile;
  version: number;
  /** Call after any write: reloads screens and re-schedules reminders. */
  changed: () => void;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  reload: () => Promise<void>;
}

const AppCtx = createContext<Ctx | null>(null);

// Debounce handle for re-scheduling reminders (one provider per app).
let rescheduleTimer: ReturnType<typeof setTimeout> | null = null;

export function AppStateProvider({ children, fallback }: { children: React.ReactNode; fallback: React.ReactNode }) {
  const sqlite = useSQLiteContext();
  const db = sqlite as unknown as Db;
  const [settings, setSettings] = useState<Settings | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [version, setVersion] = useState(0);

  const reload = useCallback(async () => {
    const s = await repo.loadSettings(db);
    setSettings(s);
    setProfiles(await repo.listProfiles(db));
  }, [db]);

  const housekeeping = useCallback(async () => {
    const s = await repo.loadSettings(db);
    await applyAutoMissed(db, s.graceMinutes);
    await rescheduleAll(db).catch((e) => console.warn('reschedule failed', e));
  }, [db]);

  useEffect(() => {
    // Initial load runs asynchronously (state is only set after awaits).
    Promise.resolve().then(reload).then(housekeeping).then(() => setVersion((v) => v + 1));
    // Re-run when the app returns to the foreground (re-registers reminders, applies auto-missed).
    const sub = RNAppState.addEventListener('change', (st) => {
      if (st === 'active') housekeeping().then(() => setVersion((v) => v + 1));
    });
    return () => sub.remove();
  }, [reload, housekeeping]);

  const changed = useCallback(() => {
    setVersion((v) => v + 1);
    reload();
    if (rescheduleTimer) clearTimeout(rescheduleTimer);
    // debounce re-scheduling so a burst of edits only rebuilds reminders once
    rescheduleTimer = setTimeout(() => rescheduleAll(db).catch((e) => console.warn('reschedule failed', e)), 400);
  }, [db, reload]);

  const updateSettings = useCallback(
    async (patch: Partial<Settings>) => {
      for (const [k, v] of Object.entries(patch)) await repo.setSetting(db, k, String(v));
      await reload();
      setVersion((v) => v + 1);
    },
    [db, reload],
  );

  const value = useMemo(() => {
    if (!settings) return null;
    const activeProfile = profiles.find((p) => p.id === settings.activeProfileId) ?? profiles[0];
    if (!activeProfile) return null;
    return { db, settings, profiles, activeProfile, version, changed, updateSettings, reload };
  }, [db, settings, profiles, version, changed, updateSettings, reload]);

  if (!value) return <>{fallback}</>;
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp(): Ctx {
  const c = useContext(AppCtx);
  if (!c) throw new Error('useApp outside provider');
  return c;
}

/** Run `load` whenever the data version, active profile or deps change. */
export function useData<T>(load: (db: Db) => Promise<T>, deps: unknown[] = []): { data: T | undefined; error: unknown; loading: boolean; refresh: () => void } {
  const { db, version, settings } = useApp();
  const [data, setData] = useState<T>();
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    // Keep showing the previous data while reloading; `loading` is only true before the first result.
    load(db)
      .then((d) => alive && (setData(d), setError(null)))
      .catch((e) => alive && setError(e))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, version, settings.activeProfileId, tick, ...deps]);
  return { data, error, loading, refresh: () => setTick((t) => t + 1) };
}
