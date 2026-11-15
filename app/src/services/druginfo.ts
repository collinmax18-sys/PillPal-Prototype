// Medication Manager + Medication Info network calls (FR1, FR7).
// Privacy boundary: only the typed drug name or a public RxCUI is sent.

import type { Db } from '../data/schema';
import * as repo from '../data/repo';
import {
  LABEL_CACHE_MS,
  OPENFDA_BASE,
  RXNAV_BASE,
  SEARCH_CACHE_MS,
  parseApproximateResponse,
  parseDrugsResponse,
  parseLabelResponse,
  parseRelatedIngredients,
  parseSpellingSuggestions,
  type RxCandidate,
} from '../core/drugdata';
import type { DrugLabel } from '../core/types';

const TIMEOUT_MS = 10_000;

async function getJson(url: string): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

export interface SearchResult {
  candidates: RxCandidate[];
  suggestions: string[];
  fromCache: boolean;
}

/**
 * Search RxNorm. Exact/normalized name first (/drugs), then approximate
 * matching for misspellings, then spelling suggestions. Results are cached
 * 12 h as NLM recommends; manual entry remains available if offline.
 */
export async function searchMedications(db: Db, rawQuery: string): Promise<SearchResult> {
  const q = rawQuery.trim().toLowerCase();
  if (q.length < 2) return { candidates: [], suggestions: [], fromCache: false };
  const cached = await repo.getCachedSearch(db, q, SEARCH_CACHE_MS);
  if (cached) return { ...cached, fromCache: true };

  let candidates = parseDrugsResponse(await getJson(`${RXNAV_BASE}/drugs.json?name=${encodeURIComponent(q)}`));
  let suggestions: string[] = [];
  if (candidates.length === 0) {
    const approx = parseApproximateResponse(await getJson(`${RXNAV_BASE}/approximateTerm.json?term=${encodeURIComponent(q)}&maxEntries=8`));
    const names = [...new Set(approx.map((a) => a.name).filter((n): n is string => !!n))].slice(0, 3);
    for (const n of names) {
      candidates = parseDrugsResponse(await getJson(`${RXNAV_BASE}/drugs.json?name=${encodeURIComponent(n)}`));
      if (candidates.length) {
        suggestions = [n];
        break;
      }
    }
    if (candidates.length === 0) suggestions = parseSpellingSuggestions(await getJson(`${RXNAV_BASE}/spellingsuggestions.json?name=${encodeURIComponent(q)}`));
  }
  const result = { candidates: candidates.slice(0, 40), suggestions };
  await repo.putCachedSearch(db, q, result);
  return { ...result, fromCache: false };
}

async function fetchLabelByRxcuis(rxcuis: string[]): Promise<any> {
  const query = rxcuis.map((r) => `openfda.rxcui:"${r}"`).join('+OR+');
  return getJson(`${OPENFDA_BASE}?search=${query}&limit=5`);
}

/**
 * openFDA label for a medication. openFDA indexes product-level RxCUIs, so
 * for ingredient/brand concepts we also try related products, then the
 * generic name. Cached for offline use (P3 "label cache").
 */
export async function getLabel(db: Db, rxcui: string, nameHint?: string, force = false): Promise<{ label: DrugLabel | null; fromCache: boolean; stale: boolean }> {
  const cached = await repo.getCachedLabel(db, rxcui);
  if (cached && !force && Date.now() - cached.fetchedAt < LABEL_CACHE_MS) return { label: cached, fromCache: true, stale: false };
  try {
    let json = await fetchLabelByRxcuis([rxcui]);
    if (!json?.results?.length) {
      const related = await getJson(`${RXNAV_BASE}/rxcui/${encodeURIComponent(rxcui)}/related.json?tty=SCD+SBD`);
      const ids = parseRelatedIngredients(related).slice(0, 10);
      if (ids.length) json = await fetchLabelByRxcuis(ids);
    }
    if (!json?.results?.length && nameHint) {
      const generic = nameHint.split(/\s\d/)[0].trim();
      json = await getJson(`${OPENFDA_BASE}?search=openfda.generic_name:"${encodeURIComponent(generic)}"&limit=5`);
    }
    const label = parseLabelResponse(json, rxcui);
    if (label) await repo.putCachedLabel(db, label);
    return { label, fromCache: false, stale: false };
  } catch (e) {
    if (cached) return { label: cached, fromCache: true, stale: true };
    throw e;
  }
}

/** Fire-and-forget: cache a label so drug info and the journal label check work offline. */
export async function prefetchLabel(db: Db, rxcui: string, name?: string): Promise<void> {
  await getLabel(db, rxcui, name).catch(() => undefined);
}
