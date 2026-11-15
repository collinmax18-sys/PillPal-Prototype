// Opens the on-device database. With a development/production build that has
// SQLCipher enabled (app.json → expo-sqlite plugin → useSQLCipher), the file is
// encrypted with a random 256-bit key held in the iOS Keychain / Android
// Keystore via expo-secure-store (NFR3). Expo Go does not ship SQLCipher; there
// the app still runs but reports "not encrypted" in Settings – P3 risk R4.

import { Platform } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { migrate } from './schema';

export const DB_NAME = 'pillpal.db';
const KEY_NAME = 'pillpal_db_key_v1';

export type EncryptionState = 'sqlcipher' | 'unavailable' | 'web';
let encryptionState: EncryptionState = 'unavailable';
export const getEncryptionState = () => encryptionState;

async function getOrCreateKey(): Promise<string> {
  let key = await SecureStore.getItemAsync(KEY_NAME);
  if (!key) {
    const bytes = Crypto.getRandomBytes(32);
    key = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    await SecureStore.setItemAsync(KEY_NAME, key, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
  }
  return key;
}

/** Passed to <SQLiteProvider onInit>. Keys the database (if possible) before any other statement, then migrates. */
export async function initDatabase(db: SQLiteDatabase): Promise<void> {
  if (Platform.OS === 'web') {
    encryptionState = 'web';
  } else {
    const cipher = await db.getFirstAsync<{ cipher_version: string }>('PRAGMA cipher_version');
    if (cipher?.cipher_version) {
      const key = await getOrCreateKey();
      // Raw hex key syntax: no key derivation, value never leaves SecureStore + this call.
      await db.execAsync(`PRAGMA key = "x'${key}'"`);
      encryptionState = 'sqlcipher';
    } else {
      encryptionState = 'unavailable';
    }
  }
  if (Platform.OS !== 'web') await db.execAsync('PRAGMA journal_mode = WAL;');
  await migrate(db);
}
