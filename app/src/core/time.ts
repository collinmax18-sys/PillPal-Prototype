// Local-time helpers. Doses are defined in wall-clock time ("08:00 every day"),
// so all conversion goes through the JS Date local-time API. That keeps a dose
// at 08:00 local after a time-zone or daylight-saving change (P3 test E1).

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

const pad = (n: number) => String(n).padStart(2, '0');

/** "YYYY-MM-DD" for the local calendar day of `d`. */
export function dateKey(d: Date | number): string {
  const x = typeof d === 'number' ? new Date(d) : d;
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}

/** "HH:MM" for the local time of `d`. */
export function timeKey(d: Date | number): string {
  const x = typeof d === 'number' ? new Date(d) : d;
  return `${pad(x.getHours())}:${pad(x.getMinutes())}`;
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

export function isValidTime(t: string): boolean {
  const m = /^(\d{2}):(\d{2})$/.exec(t);
  if (!m) return false;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h >= 0 && h <= 23 && min >= 0 && min <= 59;
}

export function isValidDateKey(k: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) return false;
  const d = parseDateKey(k);
  return dateKey(d) === k;
}

/** Epoch ms for a local date key + "HH:MM". */
export function localDateTime(date: string, time: string): number {
  const d = parseDateKey(date);
  const [h, m] = time.split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return d.getTime();
}

export function addDays(key: string, n: number): string {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}

export function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Inclusive list of date keys between two keys. */
export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = from;
  // guard against reversed ranges / runaway loops
  for (let i = 0; cur <= to && i < 3660; i++) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

export function formatTime12(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad(m)} ${suffix}`;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export function dayName(i: number): string {
  return DAY_NAMES[i] ?? '?';
}

export function formatDateLong(key: string): string {
  const d = parseDateKey(key);
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

export function relativeMinutes(mins: number): string {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
