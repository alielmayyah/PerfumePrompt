import 'server-only';

import { errors, toAppError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import {
  extractMeta,
  extractNotes,
  extractWeightedAccords,
  totalNoteCount,
  type ExtractedMeta,
  type ExtractedNotes,
  type WeightedAccord,
} from '@/lib/utils/noteExtraction';
import { fetchPageHtml } from './referenceImageService';
import { buildNotesQuery, searchProductPages } from './productSearchService';

const log = createLogger('perfume-scraper');

/**
 * Gathers everything about a perfume from the open web, from brand and name alone.
 *
 * Notes, accords and images all come from the same set of product pages, so one pass
 * of fetching serves every downstream stage. Provenance is recorded per field: the
 * point is not to look authoritative but to be checkable, since a scraped note list
 * is evidence, not truth.
 */

const MAX_PAGES = 5;

export interface ScrapedField<T> {
  value: T;
  /** Page the value came from. */
  source?: string;
  /** Which parser produced it. */
  strategy?: string;
}

export interface PerfumeScrapeResult {
  query: string;
  notes: ScrapedField<ExtractedNotes>;
  accords: ScrapedField<WeightedAccord[]>;
  meta: ScrapedField<ExtractedMeta>;
  /** Pages read, in the order they were tried. */
  pagesRead: { url: string; ok: boolean; note: string }[];
}

export interface ScrapeInput {
  brand: string;
  name: string;
  variant?: string;
  /** Skip search and read exactly these pages. */
  urls?: string[];
}

export async function scrapePerfumeData(input: ScrapeInput): Promise<PerfumeScrapeResult> {
  const query = buildNotesQuery(input.brand, input.name, input.variant);

  let pages: string[];
  if (input.urls && input.urls.length > 0) {
    pages = input.urls.slice(0, MAX_PAGES);
  } else {
    const results = await searchProductPages(query, MAX_PAGES + 3);
    pages = rankForNotes(results.map((r) => r.url)).slice(0, MAX_PAGES);
  }

  if (pages.length === 0) {
    throw errors.validation(
      'No pages were found for that perfume. Try a different spelling, or supply product page URLs.',
    );
  }

  const result: PerfumeScrapeResult = {
    query,
    notes: { value: { topNotes: [], heartNotes: [], baseNotes: [], strategy: 'none' } },
    accords: { value: [] },
    meta: { value: {} },
    pagesRead: [],
  };

  for (const [position, url] of pages.entries()) {
    // Space out requests. These are other people's servers, and a scrape that fires
    // five requests in one burst is both rude and more likely to be blocked.
    if (position > 0) await sleep(700);

    let html: string;
    try {
      html = await fetchPageHtml(url);
    } catch (error) {
      result.pagesRead.push({ url, ok: false, note: toAppError(error).message });
      continue;
    }

    const found: string[] = [];

    const notes = extractNotes(html);
    // A structured pyramid beats prose, and more notes beats fewer. Otherwise the
    // first page to produce anything wins.
    if (isBetterNotes(notes, result.notes.value)) {
      result.notes = { value: notes, source: url, strategy: notes.strategy };
      found.push(`${totalNoteCount(notes)} notes (${notes.strategy})`);
    }

    const accords = extractWeightedAccords(html);
    if (accords.length > result.accords.value.length) {
      result.accords = { value: accords, source: url, strategy: 'weighted-query' };
      found.push(`${accords.length} accords`);
    }

    const meta = extractMeta(html);
    if ((meta.year ?? meta.audience) && !(result.meta.value.year ?? result.meta.value.audience)) {
      result.meta = { value: meta, source: url };
      found.push('year/audience');
    }

    result.pagesRead.push({
      url,
      ok: true,
      note: found.length > 0 ? found.join(', ') : 'nothing usable',
    });

    // Stop early once the data is genuinely complete; there is no value in reading
    // three more shops for note lists we already have from a reference database.
    if (result.notes.value.strategy === 'pyramid' && result.accords.value.length >= 4) break;
  }

  log.info('scrape finished', {
    query,
    notes: totalNoteCount(result.notes.value),
    strategy: result.notes.value.strategy,
    accords: result.accords.value.length,
    pages: result.pagesRead.length,
  });

  return result;
}

function isBetterNotes(candidate: ExtractedNotes, current: ExtractedNotes): boolean {
  if (candidate.strategy === 'none') return false;
  if (current.strategy === 'none') return true;
  if (candidate.strategy === 'pyramid' && current.strategy !== 'pyramid') return true;
  if (current.strategy === 'pyramid' && candidate.strategy !== 'pyramid') return false;
  return totalNoteCount(candidate) > totalNoteCount(current);
}

/**
 * Puts note-rich reference databases first.
 *
 * Retail listings usually carry a good product photograph but a thin or absent note
 * list, while reference databases carry a structured pyramid and weighted accords.
 * For this pass the notes matter more, so those pages are read first.
 */
function rankForNotes(urls: string[]): string[] {
  const preferred = ['fragrantica.com', 'parfumo.com', 'basenotes.net'];
  return [...urls].sort((a, b) => {
    const score = (url: string) => {
      const lower = url.toLowerCase();
      const index = preferred.findIndex((host) => lower.includes(host));
      return index === -1 ? preferred.length : index;
    };
    return score(a) - score(b);
  });
}

/**
 * Fragrance family label.
 *
 * Uses weighted accords when a source published them, and otherwise infers a label
 * from the notes. The fallback matters because the one source that publishes accord
 * weights is also the one most likely to refuse an automated request, so an empty
 * family field would otherwise be the common case rather than the exception.
 */
export function deriveFamily(
  accords: WeightedAccord[],
  notes: ExtractedNotes,
): string | undefined {
  if (accords.length > 0) {
    return accords
      .slice(0, 2)
      .map((accord) => accord.name.replace(/\b\w/g, (c) => c.toUpperCase()))
      .join(' ');
  }

  const haystack = [...notes.topNotes, ...notes.heartNotes, ...notes.baseNotes]
    .join(' ')
    .toLowerCase();
  if (haystack.length === 0) return undefined;

  // Ordered so the strongest descriptor leads the label.
  const families: [string, string[]][] = [
    ['Incense', ['incense', 'frankincense', 'myrrh', 'smoke']],
    ['Oud', ['oud', 'agarwood']],
    ['Leather', ['leather', 'suede']],
    ['Amber', ['amber', 'labdanum', 'benzoin']],
    ['Woody', ['sandalwood', 'cedar', 'vetiver', 'patchouli', 'wood', 'birch']],
    ['Vanilla', ['vanilla', 'tonka']],
    ['Coffee', ['coffee', 'qahwa', 'cacao']],
    ['Spicy', ['cinnamon', 'saffron', 'pepper', 'cardamom', 'clove']],
    ['Floral', ['rose', 'jasmine', 'tuberose', 'iris', 'blossom']],
    ['Citrus', ['bergamot', 'lemon', 'orange', 'grapefruit', 'mandarin']],
    ['Fruity', ['currant', 'apple', 'peach', 'berry', 'plum', 'fig']],
    ['Aquatic', ['aquatic', 'marine', 'sea', 'water', 'salt']],
  ];

  const matched = families
    .filter(([, keywords]) => keywords.some((keyword) => haystack.includes(keyword)))
    .map(([label]) => label);

  return matched.length > 0 ? matched.slice(0, 3).join(' ') : undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
