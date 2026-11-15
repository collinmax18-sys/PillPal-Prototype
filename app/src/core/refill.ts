// Refill tracking (P2 core feature 5 / P3 Tier 3 "refill reminders").

import type { Medication, Schedule } from './types';
import { dosesPerDay } from './schedule';
import { dateKey } from './time';

export interface RefillStatus {
  tracked: boolean;
  unitsPerDay: number;
  daysRemaining: number | null;
  needsRefill: boolean;
}

export function refillStatus(med: Medication, schedules: Schedule[], today = dateKey(new Date())): RefillStatus {
  const unitsPerDay = dosesPerDay(schedules, today) * med.quantityPerDose;
  if (med.supplyRemaining === null) return { tracked: false, unitsPerDay, daysRemaining: null, needsRefill: false };
  if (unitsPerDay <= 0) return { tracked: true, unitsPerDay, daysRemaining: null, needsRefill: med.supplyRemaining <= 0 };
  const daysRemaining = Math.floor(med.supplyRemaining / unitsPerDay);
  return { tracked: true, unitsPerDay, daysRemaining, needsRefill: daysRemaining <= med.refillThresholdDays };
}

/** New supply after a dose is marked taken (never negative). */
export function decrementSupply(med: Medication): number | null {
  if (med.supplyRemaining === null) return null;
  return Math.max(0, med.supplyRemaining - med.quantityPerDose);
}
