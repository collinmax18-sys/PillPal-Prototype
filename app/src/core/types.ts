// Domain types shared by the data layer, the reminder engine and the UI.
// Everything here is plain data so the core logic can be unit tested
// without a device, a database or a network connection.

export type Role = 'personal' | 'caregiver' | 'professional';

export interface Profile {
  id: string;
  name: string;
  /** e.g. "Self", "Mom", "Room 12" – free text, never sent off-device */
  relation: string;
  createdAt: string;
}

export interface Medication {
  id: string;
  profileId: string;
  name: string;
  /** RxNorm concept unique identifier; null when entered manually (offline fallback). */
  rxcui: string | null;
  /** The RxNorm term type (IN, SCD, SBD, BN…) of the saved concept. */
  tty: string | null;
  dosage: string; // "500 mg"
  form: string; // "tablet"
  /** Units taken per dose, used for refill counting. */
  quantityPerDose: number;
  instructions: string; // "Take with food"
  /** Pills/units on hand; null = not tracked. */
  supplyRemaining: number | null;
  /** Remind when this many days of supply remain. */
  refillThresholdDays: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Schedule {
  id: string;
  medicationId: string;
  /** "HH:MM" 24h local time. */
  time: string;
  /** 0 = Sunday … 6 = Saturday. Empty = every day. */
  daysOfWeek: number[];
  /** "YYYY-MM-DD" inclusive. */
  startDate: string;
  /** "YYYY-MM-DD" inclusive, null = ongoing. */
  endDate: string | null;
}

/** A concrete dose instance generated from a schedule. Not stored – derived. */
export interface ScheduledDose {
  /** Deterministic: `${scheduleId}@${YYYY-MM-DD}T${HH:MM}` – lets logs and notifications refer to it. */
  id: string;
  scheduleId: string;
  medicationId: string;
  /** Local wall-clock date and time. */
  date: string;
  time: string;
  /** Epoch ms of the scheduled moment in the device's current time zone. */
  at: number;
}

export type LoggedStatus = 'taken' | 'skipped' | 'missed';
export type DoseStatus = LoggedStatus | 'due' | 'upcoming';

export interface DoseLog {
  id: string;
  /** ScheduledDose.id, or `prn@<uuid>` for an extra/as-needed dose. */
  doseId: string;
  medicationId: string;
  scheduledAt: number;
  status: LoggedStatus;
  /** When the user acted (or when auto-missed was applied). */
  recordedAt: number;
  /** "app" | "notification" | "auto" */
  source: 'app' | 'notification' | 'auto';
}

/** How a medication made the user feel – the effects journal. */
export interface EffectNote {
  id: string;
  medicationId: string;
  /** Optional link to the dose this note is about. */
  doseLogId: string | null;
  createdAt: number;
  /** Minutes after the dose the user is describing (0 = right after). */
  minutesAfterDose: number | null;
  /** 1 (very bad) … 5 (very good). */
  mood: number;
  /** 1 (no relief) … 5 (fully effective); null = not applicable. */
  effectiveness: number | null;
  /** Symptom/effect tag ids from the effects vocabulary. */
  effects: string[];
  /** 1 mild, 2 moderate, 3 severe – applies to the effects listed. */
  severity: number | null;
  text: string;
}

export interface LabelSection {
  key: string;
  title: string;
  text: string;
}

export interface DrugLabel {
  rxcui: string;
  setId: string | null;
  brandName: string | null;
  genericName: string | null;
  effectiveTime: string | null;
  sections: LabelSection[];
  fetchedAt: number;
  source: 'openFDA';
}

export interface Settings {
  activeProfileId: string;
  role: Role;
  /** Minutes after a scheduled time before an unacknowledged dose becomes Missed. */
  graceMinutes: number;
  /** Ask "How do you feel?" right after marking a dose Taken. */
  promptForNoteAfterDose: boolean;
}
