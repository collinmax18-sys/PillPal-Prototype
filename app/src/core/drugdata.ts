// Parsing for the two trusted public sources (FR7):
//  - RxNorm (NLM RxNav REST API) – standardized names + RxCUI identifiers
//  - openFDA drug label API – label sections looked up by RxCUI
// Only drug names / identifiers are ever sent to these services (NFR3).

import type { DrugLabel, LabelSection } from './types';

export const RXNAV_BASE = 'https://rxnav.nlm.nih.gov/REST';
export const OPENFDA_BASE = 'https://api.fda.gov/drug/label.json';

export interface RxCandidate {
  rxcui: string;
  name: string;
  tty: string; // IN, SCD, SBD, BN, ...
  /** Human-readable kind derived from tty. */
  kind: string;
}

const TTY_KIND: Record<string, string> = {
  IN: 'Ingredient',
  PIN: 'Ingredient',
  MIN: 'Multiple ingredients',
  BN: 'Brand',
  SCD: 'Generic product',
  SBD: 'Brand product',
  GPCK: 'Generic pack',
  BPCK: 'Brand pack',
  SCDF: 'Generic dose form',
  SBDF: 'Brand dose form',
};

const TTY_RANK = ['SCD', 'SBD', 'BN', 'IN', 'MIN', 'PIN', 'BPCK', 'GPCK', 'SBDF', 'SCDF'];

/** Parse /drugs.json?name=… – grouped concepts by term type. */
export function parseDrugsResponse(json: any): RxCandidate[] {
  const groups: any[] = json?.drugGroup?.conceptGroup ?? [];
  const out: RxCandidate[] = [];
  for (const g of groups) {
    for (const c of g?.conceptProperties ?? []) {
      if (!c?.rxcui || !c?.name) continue;
      out.push({ rxcui: String(c.rxcui), name: String(c.name), tty: String(c.tty ?? g.tty ?? ''), kind: TTY_KIND[c.tty ?? g.tty] ?? String(c.tty ?? '') });
    }
  }
  return out.sort((a, b) => rank(a.tty) - rank(b.tty) || a.name.localeCompare(b.name, undefined, { numeric: true }));
}

function rank(tty: string) {
  const i = TTY_RANK.indexOf(tty);
  return i === -1 ? 99 : i;
}

/** Parse /approximateTerm.json – returns ranked rxcui list (names resolved separately). */
export function parseApproximateResponse(json: any): { rxcui: string; name: string | null; score: number }[] {
  const cands: any[] = json?.approximateGroup?.candidate ?? [];
  const byId = new Map<string, { rxcui: string; name: string | null; score: number }>();
  for (const c of cands) {
    const id = c?.rxcui ? String(c.rxcui) : null;
    if (!id) continue;
    const prev = byId.get(id);
    // The same concept appears once per source vocabulary; keep the first that carries a name.
    if (prev) {
      if (!prev.name && c.name) prev.name = String(c.name);
      continue;
    }
    byId.set(id, { rxcui: id, name: c.name ? String(c.name) : null, score: Number(c.score ?? 0) });
  }
  return [...byId.values()];
}

/** Parse /spellingsuggestions.json */
export function parseSpellingSuggestions(json: any): string[] {
  return (json?.suggestionGroup?.suggestionList?.suggestion ?? []).map(String);
}

/** Parse /rxcui/{id}/related.json?tty=IN – ingredient rxcuis for a product. */
export function parseRelatedIngredients(json: any): string[] {
  const groups: any[] = json?.relatedGroup?.conceptGroup ?? [];
  return groups.flatMap((g) => (g?.conceptProperties ?? []).map((c: any) => String(c.rxcui)));
}

/** openFDA label fields we surface, in display order, with friendly titles. */
export const LABEL_FIELDS: { key: string; title: string }[] = [
  { key: 'boxed_warning', title: 'Boxed warning' },
  { key: 'indications_and_usage', title: 'What it is used for' },
  { key: 'purpose', title: 'Purpose' },
  { key: 'dosage_and_administration', title: 'How to take it' },
  { key: 'directions', title: 'Directions' },
  { key: 'contraindications', title: 'Who should not take it' },
  { key: 'do_not_use', title: 'Do not use' },
  { key: 'warnings_and_cautions', title: 'Warnings and precautions' },
  { key: 'warnings', title: 'Warnings' },
  { key: 'ask_doctor', title: 'Ask a doctor before use' },
  { key: 'stop_use', title: 'Stop use and ask a doctor' },
  { key: 'adverse_reactions', title: 'Side effects (adverse reactions)' },
  { key: 'drug_interactions', title: 'Drug interactions' },
  { key: 'pregnancy_or_breast_feeding', title: 'Pregnancy or breast-feeding' },
  { key: 'storage_and_handling', title: 'Storage' },
];

/** Strip the leading all-caps heading openFDA often repeats ("6 ADVERSE REACTIONS …"). */
export function cleanSectionText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/^(\d+(\.\d+)?\s+)?[A-Z][A-Z &/,-]{3,60}\s(?=[A-Z][a-z])/, '')
    .trim();
}

/** openFDA can return several labels for one RxCUI (e.g. repackager stubs with no clinical sections); pick the most complete. */
export function pickMostCompleteLabel(results: any[] | undefined): any | null {
  if (!results?.length) return null;
  const score = (r: any) => LABEL_FIELDS.filter((f) => Array.isArray(r?.[f.key]) && r[f.key].length).length;
  return results.reduce((best, r) => (score(r) > score(best) ? r : best), results[0]);
}

export function parseLabelResponse(json: any, rxcui: string, now = Date.now()): DrugLabel | null {
  const r = pickMostCompleteLabel(json?.results);
  if (!r) return null;
  const sections: LabelSection[] = [];
  for (const f of LABEL_FIELDS) {
    const v = r[f.key];
    if (Array.isArray(v) && v.length) {
      const text = cleanSectionText(v.join(' '));
      if (text) sections.push({ key: f.key, title: f.title, text });
    }
  }
  const of = r.openfda ?? {};
  return {
    rxcui,
    setId: r.set_id ?? null,
    brandName: of.brand_name?.[0] ?? null,
    genericName: of.generic_name?.[0] ?? null,
    effectiveTime: r.effective_time ?? null,
    sections,
    fetchedAt: now,
    source: 'openFDA',
  };
}

export function dailyMedUrl(setId: string | null): string | null {
  return setId ? `https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${encodeURIComponent(setId)}` : null;
}

/** Labels older than this are re-fetched when online (NLM suggests caching 12–24 h). */
export const LABEL_CACHE_MS = 24 * 60 * 60 * 1000;
export const SEARCH_CACHE_MS = 12 * 60 * 60 * 1000;
