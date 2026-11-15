// Effects journal ("how did this medication make me feel?").
//
// Users pick effect tags and write a free-text note after a dose. PillPal then
// checks those effects against the medication's own FDA label (adverse
// reactions / warnings) – deterministically, on the device, with no
// personal data leaving the phone. The output is informational: "nausea is
// listed in this medication's label", never "this drug caused your nausea".

import type { EffectNote, LabelSection } from './types';

export interface EffectTag {
  id: string;
  label: string;
  /** Lower-case terms searched for in label text (word-boundary match). */
  terms: string[];
  kind: 'side-effect' | 'positive';
}

export const EFFECT_TAGS: EffectTag[] = [
  { id: 'nausea', label: 'Nausea', terms: ['nausea', 'nauseous', 'queasy'], kind: 'side-effect' },
  { id: 'vomiting', label: 'Vomiting', terms: ['vomiting', 'emesis'], kind: 'side-effect' },
  { id: 'headache', label: 'Headache', terms: ['headache', 'headaches', 'migraine'], kind: 'side-effect' },
  { id: 'dizziness', label: 'Dizziness', terms: ['dizziness', 'dizzy', 'lightheadedness', 'vertigo'], kind: 'side-effect' },
  { id: 'drowsiness', label: 'Drowsy / tired', terms: ['drowsiness', 'somnolence', 'fatigue', 'sedation', 'tiredness'], kind: 'side-effect' },
  { id: 'insomnia', label: 'Trouble sleeping', terms: ['insomnia', 'sleeplessness', 'sleep disturbance'], kind: 'side-effect' },
  { id: 'stomach', label: 'Stomach pain', terms: ['abdominal pain', 'stomach pain', 'dyspepsia', 'upset stomach', 'gastrointestinal'], kind: 'side-effect' },
  { id: 'diarrhea', label: 'Diarrhea', terms: ['diarrhea', 'diarrhoea', 'loose stools'], kind: 'side-effect' },
  { id: 'constipation', label: 'Constipation', terms: ['constipation'], kind: 'side-effect' },
  { id: 'dry_mouth', label: 'Dry mouth', terms: ['dry mouth', 'xerostomia'], kind: 'side-effect' },
  { id: 'rash', label: 'Rash / itching', terms: ['rash', 'pruritus', 'itching', 'urticaria', 'hives'], kind: 'side-effect' },
  { id: 'anxiety', label: 'Anxious / jittery', terms: ['anxiety', 'nervousness', 'agitation', 'restlessness', 'jitteriness'], kind: 'side-effect' },
  { id: 'low_mood', label: 'Low mood', terms: ['depression', 'depressed mood', 'mood changes'], kind: 'side-effect' },
  { id: 'cough', label: 'Cough', terms: ['cough'], kind: 'side-effect' },
  { id: 'muscle_pain', label: 'Muscle pain', terms: ['myalgia', 'muscle pain', 'muscle aches', 'muscle weakness'], kind: 'side-effect' },
  { id: 'appetite', label: 'Appetite change', terms: ['decreased appetite', 'increased appetite', 'anorexia', 'weight gain', 'weight loss'], kind: 'side-effect' },
  { id: 'palpitations', label: 'Racing heart', terms: ['palpitations', 'tachycardia', 'rapid heartbeat'], kind: 'side-effect' },
  { id: 'swelling', label: 'Swelling', terms: ['edema', 'oedema', 'swelling', 'peripheral edema'], kind: 'side-effect' },
  { id: 'symptom_relief', label: 'Symptoms improved', terms: [], kind: 'positive' },
  { id: 'more_energy', label: 'More energy', terms: [], kind: 'positive' },
  { id: 'calmer', label: 'Calmer', terms: [], kind: 'positive' },
  { id: 'slept_well', label: 'Slept well', terms: [], kind: 'positive' },
];

const TAG_BY_ID = new Map(EFFECT_TAGS.map((t) => [t.id, t]));
export const tagLabel = (id: string) => TAG_BY_ID.get(id)?.label ?? id;

/** Sections of an FDA label that describe effects users may notice. */
const EFFECT_SECTIONS = ['adverse_reactions', 'warnings_and_cautions', 'warnings', 'boxed_warning', 'stop_use', 'do_not_use', 'ask_doctor'];

export interface LabelMatch {
  tagId: string;
  tagLabel: string;
  term: string;
  sectionKey: string;
  sectionTitle: string;
  /** Short excerpt around the matched term, straight from the label. */
  excerpt: string;
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function excerptAround(text: string, index: number, length: number, radius = 90): string {
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + length + radius);
  return `${start > 0 ? '…' : ''}${text.slice(start, end).replace(/\s+/g, ' ').trim()}${end < text.length ? '…' : ''}`;
}

/**
 * Find which of the user's reported effects appear in the label's effect
 * sections. Returns at most one match per tag (the first, highest-priority
 * section wins).
 */
export function matchEffectsToLabel(effectIds: string[], sections: LabelSection[]): LabelMatch[] {
  const relevant = sections
    .filter((s) => EFFECT_SECTIONS.includes(s.key))
    .sort((a, b) => EFFECT_SECTIONS.indexOf(a.key) - EFFECT_SECTIONS.indexOf(b.key));
  const out: LabelMatch[] = [];
  for (const id of new Set(effectIds)) {
    const tag = TAG_BY_ID.get(id);
    if (!tag || tag.terms.length === 0) continue;
    let found: LabelMatch | null = null;
    for (const section of relevant) {
      for (const term of tag.terms) {
        const re = new RegExp(`\\b${escapeRegExp(term)}\\b`, 'i');
        const m = re.exec(section.text);
        if (m) {
          found = { tagId: id, tagLabel: tag.label, term, sectionKey: section.key, sectionTitle: section.title, excerpt: excerptAround(section.text, m.index, m[0].length) };
          break;
        }
      }
      if (found) break;
    }
    if (found) out.push(found);
  }
  return out;
}

/** Effects the user reported that are side-effect tags but NOT found in the label. */
export function unlistedEffects(effectIds: string[], matches: LabelMatch[]): string[] {
  const matched = new Set(matches.map((m) => m.tagId));
  return [...new Set(effectIds)].filter((id) => TAG_BY_ID.get(id)?.kind === 'side-effect' && !matched.has(id));
}

export interface JournalSummary {
  count: number;
  averageMood: number | null;
  averageEffectiveness: number | null;
  /** Most frequently reported effects, descending. */
  topEffects: { id: string; label: string; count: number }[];
  /** Mean mood of the most recent half minus the older half (positive = improving). */
  moodTrend: number | null;
  severeCount: number;
  lastNoteAt: number | null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function summarizeJournal(notes: EffectNote[]): JournalSummary {
  const sorted = [...notes].sort((a, b) => a.createdAt - b.createdAt);
  const count = sorted.length;
  if (count === 0) return { count, averageMood: null, averageEffectiveness: null, topEffects: [], moodTrend: null, severeCount: 0, lastNoteAt: null };
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const moods = sorted.map((n) => n.mood);
  const eff = sorted.map((n) => n.effectiveness).filter((x): x is number => x !== null);
  const counts = new Map<string, number>();
  for (const n of sorted) for (const e of n.effects) counts.set(e, (counts.get(e) ?? 0) + 1);
  const topEffects = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([id, c]) => ({ id, label: tagLabel(id), count: c }));
  let moodTrend: number | null = null;
  if (count >= 4) {
    const half = Math.floor(count / 2);
    moodTrend = round1(mean(moods.slice(count - half))! - mean(moods.slice(0, half))!);
  }
  const am = mean(moods);
  const ae = mean(eff);
  return {
    count,
    averageMood: am === null ? null : round1(am),
    averageEffectiveness: ae === null ? null : round1(ae),
    topEffects,
    moodTrend,
    severeCount: sorted.filter((n) => n.severity === 3).length,
    lastNoteAt: sorted[count - 1].createdAt,
  };
}

export const MOOD_LABELS = ['', 'Very bad', 'Bad', 'Okay', 'Good', 'Very good'];
export const MOOD_EMOJI = ['', '😣', '🙁', '😐', '🙂', '😄'];
export const SEVERITY_LABELS = ['', 'Mild', 'Moderate', 'Severe'];

export function validateNote(n: Pick<EffectNote, 'mood' | 'effectiveness' | 'severity' | 'text' | 'effects'>): string[] {
  const errors: string[] = [];
  if (!Number.isInteger(n.mood) || n.mood < 1 || n.mood > 5) errors.push('Pick how you feel (1–5).');
  if (n.effectiveness !== null && (n.effectiveness < 1 || n.effectiveness > 5)) errors.push('Effectiveness must be 1–5.');
  if (n.severity !== null && (n.severity < 1 || n.severity > 3)) errors.push('Severity must be mild, moderate or severe.');
  if (n.text.length > 2000) errors.push('Note is too long (2000 characters max).');
  if (n.effects.some((e) => !TAG_BY_ID.has(e))) errors.push('Unknown effect tag.');
  return errors;
}
