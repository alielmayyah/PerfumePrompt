/**
 * Minimal HTML image extraction.
 *
 * Deliberately regex-based rather than a parser dependency: the job is narrow (find
 * the product images on a retail page) and a full DOM parser buys nothing here.
 *
 * Ordering encodes confidence. `og:image` is what a site declares as *the*
 * representative image and is almost always the product shot at full size, so it
 * ranks above JSON-LD, which ranks above ordinary `<img>` tags that could be
 * anything from a logo to a payment badge.
 */

export type ImageSource = 'og' | 'twitter' | 'jsonld' | 'link' | 'img';

export interface ExtractedImage {
  url: string;
  source: ImageSource;
  /** Alt or title text, often the clearest statement of what the image shows. */
  alt?: string;
}

const SOURCE_RANK: Record<ImageSource, number> = {
  og: 0,
  twitter: 1,
  jsonld: 2,
  link: 3,
  img: 4,
};

/** Junk that shows up on every retail page and is never the product. */
const REJECT = [
  'logo',
  'sprite',
  // Layout and theme assets. These are frequently the largest images on a page, so
  // ranking by resolution alone picks them over the product every time.
  'bg-desk',
  'bg-mobile',
  'background',
  '/bg/',
  'hero-',
  'slide',
  'slider',
  'carousel',
  'collection',
  'lookbook',
  'newsletter',
  'icon',
  'favicon',
  'placeholder',
  'banner',
  'payment',
  'visa',
  'mastercard',
  'mada',
  'apple-pay',
  'whatsapp',
  'facebook',
  'instagram',
  'twitter-',
  'tiktok',
  'flag',
  'avatar',
  'loader',
  'spinner',
  'blank',
  'pixel',
  'tracking',
  '1x1',
];

export function extractImageUrls(html: string, pageUrl: string): ExtractedImage[] {
  const found: ExtractedImage[] = [];
  const push = (raw: string | undefined, source: ImageSource, alt?: string) => {
    const absolute = toAbsolute(raw, pageUrl);
    if (!absolute) return;
    const label = alt?.replace(/\s+/g, ' ').trim();
    found.push({ url: absolute, source, ...(label ? { alt: label.slice(0, 160) } : {}) });
  };

  // <meta property="og:image" content="..."> in either attribute order.
  for (const match of html.matchAll(
    /<meta[^>]+(?:property|name)=["'](og:image(?::secure_url|:url)?)["'][^>]*>/gi,
  )) {
    push(attr(match[0], 'content'), 'og');
  }
  for (const match of html.matchAll(/<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']og:image[^"']*["'][^>]*>/gi)) {
    push(match[1], 'og');
  }

  for (const match of html.matchAll(/<meta[^>]+(?:property|name)=["']twitter:image[^"']*["'][^>]*>/gi)) {
    push(attr(match[0], 'content'), 'twitter');
  }

  // JSON-LD product blocks: "image": "..." or "image": ["...", "..."]
  for (const block of html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    const body = block[1];
    if (!body) continue;
    for (const single of body.matchAll(/"(?:image|contentUrl|thumbnailUrl)"\s*:\s*"([^"]+)"/g)) {
      push(single[1], 'jsonld');
    }
    for (const array of body.matchAll(/"(?:image|contentUrl)"\s*:\s*\[([^\]]+)\]/g)) {
      for (const item of (array[1] ?? '').matchAll(/"([^"]+)"/g)) {
        push(item[1], 'jsonld');
      }
    }
  }

  for (const match of html.matchAll(/<link[^>]+rel=["'](?:image_src|preload)["'][^>]*>/gi)) {
    const tag = match[0];
    if (/rel=["']preload["']/i.test(tag) && !/as=["']image["']/i.test(tag)) continue;
    push(attr(tag, 'href'), 'link');
  }

  // Ordinary <img>, preferring lazy-loading attributes which usually hold the
  // full-size asset while src holds a placeholder.
  for (const match of html.matchAll(/<img[^>]*>/gi)) {
    const tag = match[0];
    const candidate =
      attr(tag, 'data-zoom-image') ??
      attr(tag, 'data-large_image') ??
      attr(tag, 'data-src') ??
      attr(tag, 'data-original') ??
      attr(tag, 'src');
    const alt = attr(tag, 'alt') ?? attr(tag, 'title');
    push(candidate, 'img', alt);

    // srcset: take the widest declared descriptor.
    const srcset = attr(tag, 'srcset') ?? attr(tag, 'data-srcset');
    if (srcset) push(widestFromSrcset(srcset), 'img', alt);
  }

  return dedupe(found);
}

function attr(tag: string, name: string): string | undefined {
  const match = new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, 'i').exec(tag);
  return match?.[1];
}

function widestFromSrcset(srcset: string): string | undefined {
  let best: { url: string; width: number } | undefined;
  for (const part of srcset.split(',')) {
    const [url, descriptor] = part.trim().split(/\s+/);
    if (!url) continue;
    const width = Number.parseInt(descriptor ?? '0', 10) || 0;
    if (!best || width > best.width) best = { url, width };
  }
  return best?.url;
}

function toAbsolute(raw: string | undefined, pageUrl: string): string | undefined {
  if (!raw) return undefined;
  const trimmed = decodeEntities(raw.trim());
  if (trimmed.length === 0 || trimmed.startsWith('data:')) return undefined;
  try {
    const url = new URL(trimmed, pageUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&#x2F;/gi, '/')
    .replace(/&#47;/g, '/')
    .replace(/&quot;/g, '"');
}

/**
 * Keeps the highest-confidence occurrence of each image and drops obvious chrome.
 *
 * Deduplication is by *normalised* URL, not the raw string. Retail templates emit the
 * same asset many times over — `http` and `https`, doubled slashes from naive path
 * joins, and a different `width=` on every `srcset` entry — so a raw-string compare
 * leaves one product photo occupying a dozen candidate slots and pushes genuinely
 * different images off the end of the list.
 */
function dedupe(images: ExtractedImage[]): ExtractedImage[] {
  const best = new Map<string, ExtractedImage>();
  for (const image of images) {
    if (looksLikeChrome(image.url)) continue;
    const key = normaliseImageUrl(image.url);
    const existing = best.get(key);
    if (
      !existing ||
      SOURCE_RANK[image.source] < SOURCE_RANK[existing.source] ||
      // Prefer the variant that carries alt text, which the scorer relies on.
      (!existing.alt && image.alt)
    ) {
      best.set(key, image);
    }
  }
  return [...best.values()].sort((a, b) => SOURCE_RANK[a.source] - SOURCE_RANK[b.source]);
}

/**
 * Collapses the accidental variations of one asset URL into a single identity.
 *
 * Only rendition parameters are stripped. Anything that could identify a different
 * asset is left alone, so two genuinely different images never merge.
 */
export function normaliseImageUrl(raw: string): string {
  try {
    const url = new URL(raw);
    url.protocol = 'https:';
    url.hostname = url.hostname.replace(/^www\./, '');
    url.pathname = url.pathname.replace(/\/{2,}/g, '/');
    for (const param of ['width', 'height', 'w', 'h', 'v', 'quality', 'q', 'fit', 'crop', 'dpr']) {
      url.searchParams.delete(param);
    }
    url.hash = '';
    return url.toString();
  } catch {
    return raw;
  }
}

export function looksLikeChrome(url: string): boolean {
  const lower = url.toLowerCase();
  return REJECT.some((needle) => lower.includes(needle));
}

/** Page `<title>`, used to label candidates in the picker. */
export function extractTitle(html: string): string | undefined {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const text = match?.[1]?.replace(/\s+/g, ' ').trim();
  return text && text.length > 0 ? decodeEntities(text).slice(0, 160) : undefined;
}
