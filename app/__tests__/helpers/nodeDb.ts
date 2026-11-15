// Adapts Node's built-in SQLite (node:sqlite) to the same async surface as
// expo-sqlite, so the exact SQL used on the phone is exercised in tests.
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import type { Db } from '../../src/data/schema';
import { migrate } from '../../src/data/schema';
import { setIdGenerator } from '../../src/data/ids';

export async function createTestDb(): Promise<Db & { raw: DatabaseSync }> {
  setIdGenerator(randomUUID);
  const raw = new DatabaseSync(':memory:');
  const db: Db & { raw: DatabaseSync } = {
    raw,
    async execAsync(sql) {
      raw.exec(sql);
    },
    async runAsync(sql, params) {
      const r = raw.prepare(sql).run(...params);
      return { changes: Number(r.changes), lastInsertRowId: Number(r.lastInsertRowid) };
    },
    async getAllAsync<T>(sql: string, params: any[]) {
      return raw.prepare(sql).all(...params) as T[];
    },
    async getFirstAsync<T>(sql: string, params: any[]) {
      return (raw.prepare(sql).get(...params) as T | undefined) ?? null;
    },
  };
  await migrate(db);
  return db;
}
