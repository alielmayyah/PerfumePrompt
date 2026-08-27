import 'server-only';

import { request as httpRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';

import { MAX_UPLOAD_BYTES } from '@/lib/config/constants';
import { AppError, errors, toAppError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { saveImage } from '@/lib/storage';
import {
  extractImageUrls,
  extractTitle,
  looksLikeChrome,
  normaliseImageUrl,
} from '@/lib/utils/html';
import { readImageDimensions } from '@/lib/utils/imageSize';
import { sniffImageMime } from '@/lib/utils/image';
import { newId } from '@/lib/utils/id';
import type { ReferenceCandidate } from '@/lib/types/perfume';

export type { ReferenceCandidate };

const log = createLogger('reference-images');

/**
 * Sourcing bottle references from the web instead of a manual upload.
 *
 * Deliberately built around *product pages* rather than an image-search scrape:
 *
 *  - Search-engine image results are mostly re-hosted thumbnails, and a 200px
 *    thumbnail is useless as a fidelity reference, which is the entire point of
 *    this image.
 *  - A brand or retailer product page declares its main product shot in `og:image`
 *    or JSON-LD, so the best asset is both easy to find and unambiguous.
 *  - Fetching a page the same way a browser does stays within what the site
 *    publishes, rather than working around a search engine's terms.
 *
 * Candidates are always returned for a human to choose from. Nothing is promoted to
 * the protected product reference automatically.
 */

/** Below this, an image cannot carry enough detail to preserve a bottle. */
export const MIN_REFERENCE_EDGE = 400;

/** Anything this small is a listing thumbnail; not even worth showing. */
const REJECT_EDGE = 200;

const FETCH_TIMEOUT_MS = 20_000;
const MAX_PAGES = 6;
const MAX_CANDIDATES_PER_PAGE = 6;

const USER_AGENT =
  'Mozilla/5.0 (compatible; PerfumeCampaignStudio/0.1; +local-studio-tool)';

export interface CollectResult {
  candidates: ReferenceCandidate[];
  /** Pages that could not be read, with a safe reason. */
  failures: { url: string; reason: string }[];
}

/**
 * Fetches each product page, extracts its images, downloads the plausible ones and
 * stores them as candidates.
 */
export async function collectCandidatesFromPages(
  perfumeId: string,
  pageUrls: string[],
  identity?: ProductIdentity,
): Promise<CollectResult> {
  const pages = dedupeUrls(pageUrls).slice(0, MAX_PAGES);
  if (pages.length === 0) {
    throw errors.validation('Provide at least one product page or image URL.');
  }

  const candidates: ReferenceCandidate[] = [];
  const failures: CollectResult['failures'] = [];
  const seenImages = new Set<string>();

  for (const pageUrl of pages) {
    try {
      // A direct image link is a perfectly good input; no need to parse HTML.
      const direct = await tryDirectImage(perfumeId, pageUrl, pageUrl, undefined, seenImages);
      if (direct) {
        candidates.push(direct);
        continue;
      }

      const page = await fetchText(pageUrl);
      const title = extractTitle(page.html);
      const extracted = extractImageUrls(page.html, page.finalUrl);

      /*
       * Fragrantica's bottle is not in its own markup.
       *
       * The page carries only social cards (`en-social-<id>.jpeg`, `social.<id>.jpg`),
       * which are letterboxed share images, not product shots — so ranking the page's
       * images picks nothing usable and whatever bottle was already attached survives.
       * The real photograph lives on the CDN under the numeric perfume id that the page
       * URL itself contains, so it can be addressed directly. Being id-keyed, it cannot
       * be the wrong perfume's bottle, which is the failure this whole ranking pipeline
       * exists to avoid.
       */
      const canonical = fragranticaBottleUrl(page.finalUrl);
      if (canonical) {
        const direct = await tryDirectImage(
          perfumeId,
          canonical,
          page.finalUrl,
          title,
          seenImages,
        );
        if (direct) candidates.push(direct);
      }

      if (extracted.length === 0) {
        failures.push({ url: pageUrl, reason: 'No images were found on that page.' });
        continue;
      }

      let kept = 0;
      for (const image of extracted) {
        if (kept >= MAX_CANDIDATES_PER_PAGE) break;
        const candidate = await tryDirectImage(
          perfumeId,
          image.url,
          page.finalUrl,
          title,
          seenImages,
          image.alt,
        );
        if (candidate) {
          candidates.push(candidate);
          kept += 1;
        }
      }

      if (kept === 0) {
        failures.push({
          url: pageUrl,
          reason: 'Images were found but none were large enough to use as a reference.',
        });
      }
    } catch (error) {
      const appError = toAppError(error);
      log.warn('page could not be processed', { pageUrl, code: appError.code });
      failures.push({ url: pageUrl, reason: appError.message });
    }
  }

  // Score once, store it, then sort: the score is shown in the picker so a human can
  // see why a candidate ranked where it did.
  for (const candidate of candidates) {
    candidate.score = Math.round(referenceScore(candidate, identity));
  }
  candidates.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  return { candidates, failures };
}

/** Identity of the product we are trying to find a photograph of. */
export interface ProductIdentity {
  brand: string;
  name: string;
  variant?: string;
}

/** Words that mark an image as a product shot. */
const PRODUCT_WORDS = [
  'bottle',
  'flacon',
  'perfume',
  'parfum',
  'fragrance',
  'edp',
  'edt',
  'eau-de-parfum',
  'eaudeparfum',
  'product',
];

/**
 * Words that mark an image as lifestyle or editorial photography.
 *
 * These are the images that beat the product on size: a full-bleed campaign shot of a
 * model is often the largest asset on a fragrance page.
 */
const LIFESTYLE_WORDS = [
  'model',
  'lifestyle',
  'campaign',
  'editorial',
  'ambiance',
  'ambience',
  'mood',
  'people',
  'portrait',
  'woman',
  'women',
  'girl',
  'man',
  'men',
  'face',
  'skin',
  'couple',
  'desk',
  'studio-shot',
  'wallpaper',
];

/**
 * Ranks a candidate as a photograph *of this product*, which is a different question
 * from how large it is.
 *
 * Resolution alone is actively misleading. On a real fragrance page the biggest assets
 * are usually the theme background and the campaign photography, and the product shot
 * is a modest square in the middle of the page. Ranking by pixels therefore reliably
 * picks the wrong image.
 *
 * So relevance leads and resolution breaks ties: whether the filename or alt text
 * actually names this perfume is worth more than a few extra megapixels.
 */
export function referenceScore(
  candidate: ReferenceCandidate,
  identity?: ProductIdentity,
): number {
  const width = candidate.width ?? 0;
  const height = candidate.height ?? 0;
  if (width === 0 || height === 0) return 0;

  const pixels = width * height;
  const ratio = width / height;

  // Square through 3:4 portrait is the shape product photography comes in.
  let shape = 1;
  if (ratio > 1.35) shape = 0.25; // landscape: a social card, banner or background
  else if (ratio > 1.1) shape = 0.7;
  else if (ratio < 0.5) shape = 0.6; // a very tall banner strip

  return pixels * shape * relevanceMultiplier(candidate, identity);
}

/**
 * How strongly the candidate's own metadata says "this is that perfume".
 *
 * Both the URL and the alt text are flattened to bare alphanumerics before matching,
 * so `BlackDiamondIncense.png` matches the tokens `black`, `diamond` and `incense`
 * despite having no separators.
 */
export function relevanceMultiplier(
  candidate: ReferenceCandidate,
  identity?: ProductIdentity,
): number {
  const urlFlat = flatten(candidate.sourceUrl);
  const altFlat = flatten(candidate.alt ?? '');
  const readable = `${candidate.sourceUrl} ${candidate.alt ?? ''}`.toLowerCase();

  let multiplier = 1;

  if (identity) {
    const tokens = identityTokens(identity);
    if (tokens.length > 0) {
      /*
       * The filename counts for more than the alt text.
       *
       * A filename is chosen per asset, so naming the product in it is a deliberate
       * statement about that specific image. Alt text is frequently applied blanket
       * across an entire gallery, which means a lifestyle render sitting beside the
       * product inherits the product's alt and looks equally relevant. Weighting them
       * equally lets that render outrank the real photograph.
       */
      const urlShare = tokens.filter((token) => urlFlat.includes(token)).length / tokens.length;
      const altShare = tokens.filter((token) => altFlat.includes(token)).length / tokens.length;
      const share = Math.max(urlShare, altShare * 0.5);

      if (share >= 0.75) multiplier *= 4;
      else if (share >= 0.5) multiplier *= 2.5;
      else if (share > 0) multiplier *= 1.4;
      else multiplier *= 0.35;
    }
  }

  if (PRODUCT_WORDS.some((word) => readable.includes(word))) multiplier *= 1.5;
  if (LIFESTYLE_WORDS.some((word) => readable.includes(word))) multiplier *= 0.15;

  /*
   * Visual evidence, when the browser has measured it, outranks any guess made from
   * metadata: it looks at whether the image actually is a product on plain ground.
   *
   * Squared on purpose. Partial background uniformity is common — a composed shot with
   * props, a render with a soft gradient — so a linear weighting left a genuine studio
   * photograph only a few percent ahead of a campaign render, which is too fragile a
   * margin to rely on. Squaring makes high confidence decisive and mid confidence
   * merely acceptable.
   */
  if (candidate.visualScore !== undefined) {
    multiplier *= 0.15 + candidate.visualScore ** 2 * 3.5;
  }

  return multiplier;
}

function identityTokens(identity: ProductIdentity): string[] {
  return [identity.brand, identity.name, identity.variant ?? '']
    .join(' ')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2);
}

function flatten(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

async function tryDirectImage(
  perfumeId: string,
  imageUrl: string,
  pageUrl: string,
  pageTitle: string | undefined,
  seen: Set<string>,
  alt?: string,
): Promise<ReferenceCandidate | undefined> {
  // Deduplicate on the normalised URL so one asset is not downloaded a dozen times
  // under different rendition parameters.
  const key = normaliseImageUrl(imageUrl);
  if (seen.has(key) || looksLikeChrome(imageUrl)) return undefined;

  let bytes: Uint8Array;
  try {
    bytes = await fetchBinary(imageUrl);
  } catch {
    return undefined;
  }

  const mimeType = sniffImageMime(bytes);
  if (!mimeType) return undefined;
  seen.add(key);

  const dimensions = readImageDimensions(bytes);
  const shortestEdge = dimensions ? Math.min(dimensions.width, dimensions.height) : 0;

  // Thumbnails are dropped outright rather than shown and then rejected.
  if (dimensions && shortestEdge < REJECT_EDGE) return undefined;

  const usable = shortestEdge >= MIN_REFERENCE_EDGE;

  const stored = await saveImage({
    perfumeId,
    kind: 'references',
    bytes,
    mimeType,
    label: 'reference',
  });

  return {
    id: newId(),
    storagePath: stored.path,
    url: stored.url,
    sourceUrl: imageUrl,
    pageUrl,
    ...(pageTitle ? { pageTitle } : {}),
    mimeType,
    byteLength: bytes.byteLength,
    ...(dimensions ? { width: dimensions.width, height: dimensions.height } : {}),
    ...(alt ? { alt } : {}),
    usable,
    ...(usable
      ? {}
      : {
          note: dimensions
            ? `Only ${dimensions.width}x${dimensions.height}. Usable at a push, but detail will be soft.`
            : 'Dimensions could not be read.',
        }),
  };
}

/* ------------------------------------------------------------------- fetching */

interface FetchedPage {
  html: string;
  finalUrl: string;
}

/**
 * Fetches a page as HTML text, reusing the same guards and caps as image discovery.
 * Exported for the perfume scraper so both share one fetch policy.
 */
export async function fetchPageHtml(url: string): Promise<string> {
  return (await fetchText(url)).html;
}

async function fetchText(url: string): Promise<FetchedPage> {
  const target = assertHttpUrl(url);
  let response: Response;
  try {
    response = await fetch(target, {
      headers: {
        'user-agent': USER_AGENT,
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'en,ar;q=0.8',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (cause) {
    throw new AppError('NETWORK_FAILED', 'That page could not be reached.', { cause });
  }

  /*
   * Some sites reject Node's fetch outright, whatever headers it sends.
   *
   * Fragrantica — the best notes source there is — answers `fetch` with 403 for every
   * combination of user agent, accept and sec-fetch headers, while the very same request
   * from `node:https` gets a 200. The block is on the HTTP stack's fingerprint, not on
   * anything in the request we control, so no amount of header tuning fixes it. Falling
   * back to the older client is the difference between supporting Fragrantica URLs and
   * silently extracting nothing from them.
   */
  if (response.status === 403) {
    return fetchTextViaNodeHttps(target);
  }

  if (!response.ok) {
    throw new AppError(
      'NETWORK_FAILED',
      `That page returned status ${response.status}.`,
      { retryable: response.status >= 500 },
    );
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('html') && !contentType.includes('xml')) {
    throw new AppError('UNSUPPORTED_MEDIA', 'That URL is not a web page or an image.');
  }

  // Cap the read: a runaway page must not exhaust memory.
  const buffer = await response.arrayBuffer();
  const slice = new Uint8Array(buffer).subarray(0, 3_000_000);
  return { html: new TextDecoder('utf-8').decode(slice), finalUrl: response.url || target };
}

/** How many redirect hops the fallback client will follow. */
const MAX_REDIRECTS = 4;

/**
 * The `node:https` fallback for hosts that fingerprint-block `fetch`.
 *
 * Redirects are followed by hand because this client does not follow them itself, and
 * every hop is re-checked with `assertHttpUrl`. That is the security-relevant part: an
 * open redirect on a public page could otherwise walk us onto `localhost` or a link-local
 * address, which is exactly the request forgery the guard exists to prevent.
 */
async function fetchTextViaNodeHttps(url: string, hop = 0): Promise<FetchedPage> {
  const target = assertHttpUrl(url);
  const request = target.startsWith('https:') ? httpsRequest : httpRequest;

  return new Promise<FetchedPage>((resolve, reject) => {
    const req = request(
      target,
      {
        headers: {
          'user-agent': USER_AGENT,
          accept: 'text/html,application/xhtml+xml',
          'accept-language': 'en,ar;q=0.8',
        },
        timeout: FETCH_TIMEOUT_MS,
      },
      (res: IncomingMessage) => {
        const status = res.statusCode ?? 0;
        const location = res.headers.location;

        if (status >= 300 && status < 400 && location) {
          res.resume();
          if (hop >= MAX_REDIRECTS) {
            reject(new AppError('NETWORK_FAILED', 'That page redirected too many times.'));
            return;
          }
          resolve(fetchTextViaNodeHttps(new URL(location, target).toString(), hop + 1));
          return;
        }

        if (status < 200 || status >= 300) {
          res.resume();
          reject(
            new AppError('NETWORK_FAILED', `That page returned status ${status}.`, {
              retryable: status >= 500,
            }),
          );
          return;
        }

        const contentType = String(res.headers['content-type'] ?? '');
        if (!contentType.includes('html') && !contentType.includes('xml')) {
          res.resume();
          reject(errors.unsupportedMedia('That URL is not a web page or an image.'));
          return;
        }

        const chunks: Buffer[] = [];
        let total = 0;
        res.on('data', (chunk: Buffer) => {
          if (total >= 3_000_000) return;
          total += chunk.length;
          chunks.push(chunk);
        });
        res.on('end', () => {
          const slice = Buffer.concat(chunks).subarray(0, 3_000_000);
          resolve({ html: slice.toString('utf8'), finalUrl: target });
        });
        res.on('error', (cause) =>
          reject(new AppError('NETWORK_FAILED', 'That page could not be read.', { cause })),
        );
      },
    );

    req.on('timeout', () => {
      req.destroy();
      reject(new AppError('NETWORK_FAILED', 'That page timed out.', { retryable: true }));
    });
    req.on('error', (cause) =>
      reject(new AppError('NETWORK_FAILED', 'That page could not be reached.', { cause })),
    );
    req.end();
  });
}

/**
 * Downloads a remote image with the same SSRF guards and size caps used for
 * reference discovery. Exported so variation import cannot accidentally grow its own,
 * weaker version of this.
 */
export async function fetchRemoteImage(url: string): Promise<{ bytes: Uint8Array; mimeType: string }> {
  const bytes = await fetchBinary(url);
  const mimeType = sniffImageMime(bytes);
  if (!mimeType) {
    throw errors.unsupportedMedia('That URL is not a recognisable PNG, JPEG, WebP or AVIF image.');
  }
  return { bytes, mimeType };
}

async function fetchBinary(url: string): Promise<Uint8Array> {
  const target = assertHttpUrl(url);
  const response = await fetch(target, {
    headers: {
      'user-agent': USER_AGENT,
      accept: 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`status ${response.status}`);

  const declared = Number(response.headers.get('content-length') ?? '0');
  if (declared > MAX_UPLOAD_BYTES) throw new Error('too large');

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_UPLOAD_BYTES) throw new Error('bad size');
  return bytes;
}

/**
 * Rejects anything that is not plain public http(s), including private and
 * loopback hosts. Without this the endpoint is a server-side request forgery
 * primitive: a caller could point it at internal services.
 */
function assertHttpUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw errors.validation(`"${raw.slice(0, 80)}" is not a valid URL.`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw errors.validation('Only http and https URLs are allowed.');
  }
  if (isPrivateHost(url.hostname)) {
    throw errors.validation('That host is not allowed.');
  }
  return url.toString();
}

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) return true;
  if (host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80'))
    return true;

  const parts = host.split('.');
  if (parts.length === 4 && parts.every((p) => /^\d{1,3}$/.test(p))) {
    const [a, b] = parts.map((p) => Number(p)) as [number, number, number, number];
    if (a === 127 || a === 0 || a === 10) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }
  return false;
}

/**
 * The CDN bottle photograph for a Fragrantica perfume page, or undefined.
 *
 * Fragrantica page URLs end in `<Name>-<id>.html`, and the product shot is served at a
 * fixed path under that id. Deriving it means the bottle is correct by construction
 * rather than by scoring.
 */
export function fragranticaBottleUrl(pageUrl: string): string | undefined {
  let url: URL;
  try {
    url = new URL(pageUrl);
  } catch {
    return undefined;
  }
  if (!/(^|\.)fragrantica\.[a-z.]+$/i.test(url.hostname)) return undefined;
  const match = /-(\d{3,8})\.html?$/i.exec(url.pathname);
  const id = match?.[1];
  return id ? `https://fimgs.net/mdimg/perfume/375x500.${id}.jpg` : undefined;
}

function dedupeUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of urls) {
    const key = url.trim();
    if (key.length === 0 || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}
