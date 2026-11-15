// "Share with my clinician" summary – a small personal-health-record export
// that supports medication reconciliation at appointments (P1 stakeholder
// analysis: medication-history errors at admission). Generated locally; the
// user decides where to share it via the OS share sheet.

import type { AdherenceSummary } from './adherence';
import { SEVERITY_LABELS, summarizeJournal, tagLabel, MOOD_LABELS } from './effects';
import type { EffectNote, Medication, Profile, Schedule } from './types';
import { dayName, formatTime12 } from './time';

export interface ReportInput {
  profile: Profile;
  medications: Medication[];
  schedules: Schedule[];
  adherence: Map<string, AdherenceSummary>;
  notes: EffectNote[];
  periodDays: number;
  generatedAt: Date;
}

function scheduleText(s: Schedule[]): string {
  if (s.length === 0) return 'as needed / no schedule';
  return s
    .map((x) => `${formatTime12(x.time)}${x.daysOfWeek.length ? ` (${x.daysOfWeek.map(dayName).join(', ')})` : ''}`)
    .join('; ');
}

export function buildClinicianReport(input: ReportInput): string {
  const { profile, medications, schedules, adherence, notes, periodDays, generatedAt } = input;
  const lines: string[] = [];
  lines.push(`PillPal medication summary – ${profile.name}`);
  lines.push(`Generated ${generatedAt.toLocaleString()} · covers the last ${periodDays} days`);
  lines.push('Patient-reported information for discussion with a healthcare professional. Not medical advice.');
  lines.push('');
  const active = medications.filter((m) => m.active);
  lines.push(`CURRENT MEDICATIONS (${active.length})`);
  for (const m of active) {
    const a = adherence.get(m.id);
    const ms = schedules.filter((s) => s.medicationId === m.id);
    lines.push(`• ${m.name}${m.dosage ? ` – ${m.dosage}` : ''}${m.form ? ` ${m.form}` : ''}${m.rxcui ? ` [RxCUI ${m.rxcui}]` : ' [manually entered]'}`);
    lines.push(`   Schedule: ${scheduleText(ms)}${m.instructions ? ` · ${m.instructions}` : ''}`);
    if (a && a.percent !== null) lines.push(`   Adherence: ${a.percent}% taken (${a.taken} taken, ${a.missed} missed, ${a.skipped} skipped)`);
    const mn = notes.filter((n) => n.medicationId === m.id);
    const js = summarizeJournal(mn);
    if (js.count > 0) {
      const effects = js.topEffects.map((e) => `${e.label} ×${e.count}`).join(', ') || 'none reported';
      lines.push(`   How I felt (${js.count} note${js.count === 1 ? "" : "s"}): average mood ${js.averageMood}/5${js.averageEffectiveness !== null ? `, effectiveness ${js.averageEffectiveness}/5` : ''}; effects: ${effects}${js.severeCount ? `; ${js.severeCount} severe` : ''}`);
      const recent = [...mn].sort((a, b) => b.createdAt - a.createdAt).slice(0, 3);
      for (const n of recent) {
        const when = new Date(n.createdAt).toLocaleDateString();
        const fx = n.effects.length ? ` [${n.effects.map(tagLabel).join(', ')}${n.severity ? `, ${SEVERITY_LABELS[n.severity].toLowerCase()}` : ''}]` : '';
        lines.push(`     – ${when}: ${MOOD_LABELS[n.mood]}${fx}${n.text ? ` "${n.text.slice(0, 160)}"` : ''}`);
      }
    }
  }
  const inactive = medications.filter((m) => !m.active);
  if (inactive.length) {
    lines.push('');
    lines.push('STOPPED / INACTIVE');
    for (const m of inactive) lines.push(`• ${m.name}${m.dosage ? ` – ${m.dosage}` : ''}`);
  }
  lines.push('');
  lines.push('Drug identifiers from RxNorm (U.S. National Library of Medicine).');
  return lines.join('\n');
}
