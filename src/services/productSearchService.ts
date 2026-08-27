import 'server-only';

import { AppError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';

const log = createLogger('product-search');

/**
 * Finds candidate product pages for a perfume.
 *
 * Why this shape rather than scraping an image search:
 *
 *  - Image-search results are re-hosted thumbnails. The reference image exists to
 *    preserve the product exactly, and a 200px thumbnail cannot do that.
 *  - Google's terms prohibit automated querying of its results, and its markup is
 *    intentionally hostile to parsing. Betting the feature on that is a bad trade.
 *  - Retail and brand pages publish their own product photography in `og:image` and
 *    JSON-LD, at full size, in a documented format.
 *
 * So: find *pages*, then take the images the pages declare. This uses the
 * DuckDuckGo HTML endpoint, which needs no API key. It is best-effort by design and
 * isolated behind one function, so swapping in a paid search API later means
 * replacing this file and nothing else.
 */

const SEARCH_TIMEOUT_MS = 15_000;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export interface ProductPageResult {
  url: string;
  title: string;
  /** Higher is a better bet for clean product photography. */
  score: number;
}

/** Domains that reliably carry good product shots or authoritative note data. */
const PREFERRED = [
  'fragrantica.com',
  'parfumo.com',
  'basenotes.net',
  'ibraqperfumes.com',
  'lattafa',
  'afnan',
  'perfume',
  'fragrance',
  'scent',
  'attar',
  'oud',
  'noon.com',
  'amazon.',
  'namshi',
  'golden-scent',
  'goldenscent',
  'faces.com',
  'sephora',
  'notino',
  'douglas',
];

/** Pages that will never yield a usable product photograph. */
const BLOCKED = [
  'pinterest.',
  'youtube.com',
  'facebook.com',
  'instagram.com',
  'tiktok.com',
  'x.com',
  'twitter.com',
  'reddit.com',
  'aliexpress.',
  'wikipedia.org',
  'duckduckgo.com',
  'google.',
  'bing.com',
];

/** Waits between retries of a blocked search, in milliseconds. */
const RETRY_DELAYS_MS = [4_000, 12_000];

export async function searchProductPages(query: string, limit = 8): Promise<ProductPageResult[]> {
  const results = await searchWithRetry(query);

  /*
   * Reject a result set that has nothing to do with the query.
   *
   * A search endpoint that answers 200 with confidently irrelevant content is more
   * dangerous than one that blocks: a run would appear to succeed while filling the
   * library with the wrong notes and the wrong bottles. Requiring that at least one
   * result mentions one of the query terms is a cheap floor.
   */
  const terms = queryTerms(query);
  if (results.length > 0 && terms.length > 0) {
    const anyRelevant = results.some((result) => {
      const haystack = `${result.url} ${result.title}`.toLowerCase();
      return terms.some((term) => haystack.includes(term));
    });
    if (!anyRelevant) {
      log.warn('search returned nothing relevant to the query', { query, found: results.length });
      throw new AppError(
        'SEARCH_BLOCKED',
        'Web search returned results unrelated to the query, which usually means it is serving a bot page. Try again shortly, or paste product page URLs.',
        { retryable: true },
      );
    }
  }

  const scored = results
    .filter((r) => !BLOCKED.some((needle) => r.url.toLowerCase().includes(needle)))
    .map((r) => ({ ...r, score: scoreResult(r.url, r.title, query) }))
    .sort((a, b) => b.score - a.score);

  const seenHosts = new Set<string>();
  const out: ProductPageResult[] = [];

  // One page per host: five listings from the same shop are five copies of one photo.
  for (const result of scored) {
    let host: string;
    try {
      host = new URL(result.url).hostname.replace(/^www\./, '');
    } catch {
      continue;
    }
    if (seenHosts.has(host)) continue;
    seenHosts.add(host);
    out.push(result);
    if (out.length >= limit) break;
  }

  log.info('product page search finished', { query, found: results.length, kept: out.length });
  return out;
}

function scoreResult(url: string, title: string, query: string): number {
  const lower = url.toLowerCase();
  let score = 0;

  for (const needle of PREFERRED) {
    if (lower.includes(needle)) {
      score += 4;
      break;
    }
  }
  // A product detail page beats a category or search listing.
  if (/\/(product|products|p|item|perfume|fragrance)\//.test(lower)) score += 3;
  if (/\/(search|category|collections?|tag|blog|news)\b/.test(lower)) score -= 3;

  // Reward titles that actually mention the words we searched for.
  const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
  const haystack = `${title} ${url}`.toLowerCase();
  score += terms.filter((t) => haystack.includes(t)).length;

  return score;
}

interface RawResult {
  url: string;
  title: string;
}

/**
 * Retries a rate-limited search a couple of times before giving up.
 *
 * The block is transient and short: the endpoint starts answering again within seconds.
 * Retrying here means a batch run recovers on its own instead of failing every remaining
 * row, which is what happened before.
 */
async function searchWithRetry(query: string): Promise<RawResult[]> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await duckDuckGoSearch(query);
    } catch (error) {
      lastError = error;
      const blocked = error instanceof AppError && error.code === 'SEARCH_BLOCKED';
      const delay = RETRY_DELAYS_MS[attempt];
      if (!blocked || delay === undefined) break;
      log.warn('search blocked, backing off', { query, attempt: attempt + 1, delayMs: delay });
      await sleep(delay);
    }
  }

  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function duckDuckGoSearch(query: string): Promise<RawResult[]> {
  const endpoint = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      headers: {
        'user-agent': USER_AGENT,
        accept: 'text/html',
        'accept-language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    });
  } catch (cause) {
    throw new AppError('NETWORK_FAILED', 'Web search could not be reached.', { cause });
  }

  if (!response.ok) {
    throw new AppError(
      'NETWORK_FAILED',
      `Web search returned status ${response.status}. Paste product page URLs instead.`,
    );
  }

  const html = await response.text();

  /*
   * The provider answers a suspected bot with HTTP 202 and a challenge page rather than
   * an error. Parsing that yields zero results, which previously surfaced as "no pages
   * were found, try a different spelling" — blaming the perfume for a rate limit. Detect
   * it and say what actually happened.
   */
  if (response.status === 202 || /anomaly|challenge|captcha/i.test(html.slice(0, 4000))) {
    throw new AppError(
      'SEARCH_BLOCKED',
      'Web search is rate limiting this machine. Wait a minute and try again, or paste product page URLs directly.',
      { retryable: true },
    );
  }

  const results: RawResult[] = [];

  for (const match of html.matchAll(
    /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
  )) {
    const href = unwrapRedirect(match[1] ?? '');
    const title = stripTags(match[2] ?? '');
    if (href) results.push({ url: href, title });
  }

  // Fallback for markup changes: any absolute link with a plausible product path.
  if (results.length === 0) {
    for (const match of html.matchAll(/href="(https?:\/\/[^"]+)"/gi)) {
      const href = unwrapRedirect(match[1] ?? '');
      if (href) results.push({ url: href, title: '' });
      if (results.length >= 40) break;
    }
  }

  return results;
}

/** DuckDuckGo wraps results in /l/?uddg=<encoded>. */
function unwrapRedirect(href: string): string | undefined {
  try {
    const absolute = href.startsWith('//') ? `https:${href}` : href;
    const url = new URL(absolute, 'https://duckduckgo.com');
    const target = url.searchParams.get('uddg');
    const resolved = target ? new URL(target) : url;
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return undefined;
    if (resolved.hostname.includes('duckduckgo.com')) return undefined;
    return resolved.toString();
  } catch {
    return undefined;
  }
}

function stripTags(value: string): string {
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

function queryTerms(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length > 3 && !GENERIC_TERMS.has(term));
}

/** Words present in every query, so useless for judging relevance. */
const GENERIC_TERMS = new Set(['perfume', 'bottle', 'fragrance', 'notes', 'parfum']);

/** The query that finds product photography rather than reviews or dupes. */
export function buildProductImageQuery(brand: string, name: string, variant?: string): string {
  return [brand, name, variant, 'perfume bottle'].filter(Boolean).join(' ');
}

/** The query that finds note listings. */
export function buildNotesQuery(brand: string, name: string, variant?: string): string {
  return [brand, name, variant, 'fragrance notes'].filter(Boolean).join(' ');
}
