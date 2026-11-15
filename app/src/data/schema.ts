// Local database schema (P3 Figure 1, "Encrypted SQLite").
// The same SQL runs on the device (expo-sqlite / SQLCipher) and in the
// Node test suite (node:sqlite), which is how the data layer is tested.

/** Minimal async database surface – satisfied by expo-sqlite's SQLiteDatabase. */
export interface Db {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, params: any[]): Promise<{ changes: number; lastInsertRowId: number }>;
  getAllAsync<T>(source: string, params: any[]): Promise<T[]>;
  getFirstAsync<T>(source: string, params: any[]): Promise<T | null>;
}

export const SCHEMA_VERSION = 1;

export const MIGRATIONS: Record<number, string> = {
  1: `
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      relation TEXT NOT NULL DEFAULT 'Self',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS medications (
      id TEXT PRIMARY KEY NOT NULL,
      profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      rxcui TEXT,
      tty TEXT,
      dosage TEXT NOT NULL DEFAULT '',
      form TEXT NOT NULL DEFAULT '',
      quantity_per_dose REAL NOT NULL DEFAULT 1,
      instructions TEXT NOT NULL DEFAULT '',
      supply_remaining REAL,
      refill_threshold_days INTEGER NOT NULL DEFAULT 7,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_meds_profile ON medications(profile_id);
    CREATE TABLE IF NOT EXISTS schedules (
      id TEXT PRIMARY KEY NOT NULL,
      medication_id TEXT NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
      time TEXT NOT NULL,
      days_of_week TEXT NOT NULL DEFAULT '[]',
      start_date TEXT NOT NULL,
      end_date TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_sched_med ON schedules(medication_id);
    -- Dose logs are append-only and keyed by scheduled-dose id (P3 risk R5):
    -- a correction adds a newer row; the latest row per dose_id wins.
    CREATE TABLE IF NOT EXISTS dose_logs (
      id TEXT PRIMARY KEY NOT NULL,
      dose_id TEXT NOT NULL,
      medication_id TEXT NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
      scheduled_at INTEGER NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('taken','skipped','missed')),
      recorded_at INTEGER NOT NULL,
      source TEXT NOT NULL DEFAULT 'app'
    );
    CREATE INDEX IF NOT EXISTS idx_logs_med_time ON dose_logs(medication_id, scheduled_at);
    CREATE INDEX IF NOT EXISTS idx_logs_dose ON dose_logs(dose_id);
    CREATE TABLE IF NOT EXISTS effect_notes (
      id TEXT PRIMARY KEY NOT NULL,
      medication_id TEXT NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
      dose_log_id TEXT,
      created_at INTEGER NOT NULL,
      minutes_after_dose INTEGER,
      mood INTEGER NOT NULL CHECK (mood BETWEEN 1 AND 5),
      effectiveness INTEGER CHECK (effectiveness BETWEEN 1 AND 5),
      effects TEXT NOT NULL DEFAULT '[]',
      severity INTEGER CHECK (severity BETWEEN 1 AND 3),
      text TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_notes_med_time ON effect_notes(medication_id, created_at);
    -- Public drug information only (no personal data) – safe to cache.
    CREATE TABLE IF NOT EXISTS label_cache (
      rxcui TEXT PRIMARY KEY NOT NULL,
      json TEXT NOT NULL,
      fetched_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS search_cache (
      query TEXT PRIMARY KEY NOT NULL,
      json TEXT NOT NULL,
      fetched_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
  `,
};

export async function migrate(db: Db): Promise<void> {
  await db.execAsync('PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version', []);
  let version = row?.user_version ?? 0;
  while (version < SCHEMA_VERSION) {
    version++;
    await db.execAsync(MIGRATIONS[version]);
    await db.execAsync(`PRAGMA user_version = ${version}`);
  }
}
