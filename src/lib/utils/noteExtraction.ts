/**
 * Parsers for fragrance data published on the web.
 *
 * Pure functions over HTML strings, so they are unit-tested against captured markup
 * rather than only against a live site. Two extraction strategies, because the two
 * kinds of page that carry good note data are structured very differently:
 *
 *  - Reference databases publish a structured pyramid, with each note as a link to a
 *    canonical note page. That gives clean, consistently-spelled names.
 *  - Brand and retailer pages publish prose, typically `Top Notes: a, b, c`.
 *
 * Structured wins when both are present, since prose is where typos and marketing
 * language live.
 */

export interface ExtractedNotes {
  topNotes: string[];
  heartNotes: string[];
  baseNotes: string[];
  /** Which strategy produced the result, for provenance reporting. */
  strategy: 'pyramid' | 'prose' | 'none';
}

export interface WeightedAccord {
  name: string;
  /** Relative strength, 0-100. */
  weight: number;
}

const EMPTY: ExtractedNotes = { topNotes: [], heartNotes: [], baseNotes: [], strategy: 'none' };

/* ------------------------------------------------------------------ pyramid */

/**
 * Structured pyramid: a `notes="top|middle|base"` container whose note names come
 * from `/notes/<Name>-<id>.html` links.
 */
export function extractPyramidNotes(html: string): ExtractedNotes {
  const level = (name: string): string[] => {
    const block = new RegExp(`notes=["']${name}["'][^>]*>([\\s\\S]*?)<\\/pyramid-level`, 'i').exec(
      html,
    );
    const scope = block?.[1];
    if (!scope) return [];
    const found: string[] = [];
    for (const match of scope.matchAll(/\/notes\/([A-Za-z0-9%\-']+?)-\d+\.html/g)) {
      const cleaned = cleanNoteSlug(match[1] ?? '');
      if (cleaned) found.push(cleaned);
    }
    return dedupe(found);
  };

  const topNotes = level('top');
  const heartNotes = level('middle').length > 0 ? level('middle') : level('heart');
  const baseNotes = level('base');

  if (topNotes.length + heartNotes.length + baseNotes.length === 0) return EMPTY;
  return { topNotes, heartNotes, baseNotes, strategy: 'pyramid' };
}

/**
 * Turns a note slug into a readable name.
 *
 * A trailing hyphen marks a parenthetical in this slug scheme, so `Agarwood-Oud-`
 * is "Agarwood (Oud)" rather than "Agarwood Oud".
 */
export function cleanNoteSlug(slug: string): string {
  let decoded = slug;
  try {
    decoded = decodeURIComponent(slug);
  } catch {
    /* keep the raw slug if it is not valid percent-encoding */
  }

  const parenthetical = decoded.endsWith('-');
  const parts = decoded.replace(/-+$/, '').split('-').filter(Boolean);
  if (parts.length === 0) return '';

  if (parenthetical && parts.length > 1) {
    const last = parts.pop();
    return `${parts.join(' ')} (${last})`;
  }
  return parts.join(' ');
}

/* ------------------------------------------------------------------ parfumo */

/**
 * Structured pyramid where each note is a span tagged `data-nt="t|m|b"` and the
 * readable name is the `alt` text of its note image.
 *
 * The `alt` attribute is preferred over the adjacent text node because it is present
 * even when the name is rendered inside nested markup.
 */
export function extractTaggedNotes(html: string): ExtractedNotes {
  const buckets: Record<string, string[]> = { t: [], m: [], b: [] };

  for (const match of html.matchAll(TAGGED_NOTE_RE)) {
    const tag = match[1];
    const name = titleCaseNote(match[2] ?? '');
    if (!tag || !name || !buckets[tag]) continue;
    buckets[tag].push(name);
  }

  const topNotes = dedupe(buckets['t'] ?? []);
  const heartNotes = dedupe(buckets['m'] ?? []);
  const baseNotes = dedupe(buckets['b'] ?? []);

  if (topNotes.length + heartNotes.length + baseNotes.length === 0) return EMPTY;
  return { topNotes, heartNotes, baseNotes, strategy: 'pyramid' };
}

/**
 * A single literal regex rather than one built per level: a constructed pattern needs
 * doubled escapes inside a string, which is an easy place to introduce a silently
 * broken character class.
 *
 * The bounded `{0,400}` keeps the match inside one note span, so a tag can never pair
 * with the alt text of a later note.
 */
const TAGGED_NOTE_RE = /data-nt=["'](t|m|b)["'][\s\S]{0,400}?alt=["']([^"']{2,48})["']/g;

/* -------------------------------------------------------------------- prose */

const LEVEL_PATTERNS: { key: keyof Omit<ExtractedNotes, 'strategy'>; label: RegExp }[] = [
  { key: 'topNotes', label: /top\s*notes?/i },
  { key: 'heartNotes', label: /(?:heart|middle)\s*notes?/i },
  { key: 'baseNotes', label: /(?:base|bottom)\s*notes?/i },
];

/** Prose form: `Top Notes: Aquatic Notes, Birch, Black Currant`. */
export function extractProseNotes(html: string): ExtractedNotes {
  const text = htmlToText(html);
  const result: ExtractedNotes = { topNotes: [], heartNotes: [], baseNotes: [], strategy: 'prose' };
  let found = false;

  for (const { key, label } of LEVEL_PATTERNS) {
    // Stop at the next level label or at sentence-ending punctuation, so a note list
    // never swallows the paragraph that follows it.
    const pattern = new RegExp(
      `${label.source}\\s*[:\\-–]\\s*([^.:;|]{2,220})`,
      'i',
    );
    const match = pattern.exec(text);
    const raw = match?.[1];
    if (!raw) continue;
    const notes = splitNoteList(raw);
    if (notes.length > 0) {
      result[key] = notes;
      found = true;
    }
  }

  return found ? result : EMPTY;
}

function splitNoteList(raw: string): string[] {
  return dedupe(
    raw
      .split(/,|·|\/|\band\b|&/i)
      .map((part) => titleCaseNote(part))
      .filter((part) => part.length > 1 && part.length < 40 && /[a-z]/i.test(part)),
  );
}

function titleCaseNote(value: string): string {
  const cleaned = value
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[^A-Za-z(]+|[^A-Za-z)]+$/g, '')
    .trim();
  if (cleaned.length === 0) return '';
  return cleaned
    .split(' ')
    .map((word) =>
      word.length <= 2 && word === word.toUpperCase()
        ? word
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
    )
    .join(' ');
}

/* ------------------------------------------------------------------ accords */

/**
 * Weighted accords, published as a search query such as
 * `accords-search/?smoky=100&amber=54&oud=45`.
 *
 * The weights are what make a rule-based art direction possible: they say which
 * facet of the fragrance dominates, not merely which are present.
 */
export function extractWeightedAccords(html: string): WeightedAccord[] {
  const match = /accords-search\/\?([^"'\s>]+)/i.exec(html);
  const query = match?.[1];
  if (!query) return [];

  const decoded = query.replace(/&amp;/g, '&');
  const accords: WeightedAccord[] = [];

  for (const pair of decoded.split('&')) {
    const [rawName, rawValue] = pair.split('=');
    if (!rawName || !rawValue) continue;
    // Skip the id parameters that ride along in the same query string.
    if (/perfume_id|^f_/i.test(rawName)) continue;
    const weight = Number.parseInt(rawValue, 10);
    if (!Number.isFinite(weight) || weight <= 0 || weight > 100) continue;
    accords.push({ name: rawName.replace(/[_+]/g, ' ').toLowerCase(), weight });
  }

  return accords.sort((a, b) => b.weight - a.weight);
}

/* ----------------------------------------------------------------- metadata */

export interface ExtractedMeta {
  year?: number;
  audience?: 'women' | 'men' | 'unisex';
}

export function extractMeta(html: string): ExtractedMeta {
  const title =
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i.exec(html)?.[1] ??
    /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ??
    '';

  const meta: ExtractedMeta = {};

  const year = /\b(19[5-9]\d|20[0-4]\d)\b/.exec(title)?.[1];
  if (year) meta.year = Number(year);

  const lower = title.toLowerCase();
  if (lower.includes('women and men') || lower.includes('men and women') || lower.includes('unisex')) {
    meta.audience = 'unisex';
  } else if (lower.includes('for women')) {
    meta.audience = 'women';
  } else if (lower.includes('for men')) {
    meta.audience = 'men';
  }

  return meta;
}

/* ------------------------------------------------------------------ helpers */

/** Best available notes from one page: structured if present, else prose. */
export function extractNotes(html: string): ExtractedNotes {
  // Structured sources first, in order of how clean their names are.
  const pyramid = extractPyramidNotes(html);
  if (pyramid.strategy === 'pyramid') return pyramid;

  const tagged = extractTaggedNotes(html);
  if (tagged.strategy === 'pyramid') return tagged;

  return extractProseNotes(html);
}

export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    // Block-level tags become separators so `</p><p>` does not glue two lists together.
    .replace(/<\/(p|div|li|br|h[1-6]|tr|td|section|article)>/gi, ' | ')
    .replace(/<br\s*\/?>/gi, ' | ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = value.toLowerCase();
    if (key.length === 0 || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

export function totalNoteCount(notes: ExtractedNotes): number {
  return notes.topNotes.length + notes.heartNotes.length + notes.baseNotes.length;
}
