/**
 * Samples the dominant colours of an image, in the browser.
 *
 * Browser-side because the browser already decodes JPEG, WebP and AVIF natively;
 * doing this on the server would mean adding an image-decoding dependency to support
 * formats the scraper routinely encounters.
 *
 * The output feeds the rule-based creative director, which is what makes "the bottle
 * determines the visual identity" literally true rather than aspirational: the palette
 * and the light temperature of the campaign are read off the product itself.
 */

export interface SampleOptions {
  /** Longest edge to scale to before sampling. Small is fine and much faster. */
  maxEdge?: number;
  /** How many colours to return. */
  count?: number;
}

const DEFAULT_MAX_EDGE = 160;
const DEFAULT_COUNT = 6;

export async function samplePalette(
  imageUrl: string,
  options: SampleOptions = {},
): Promise<string[]> {
  const maxEdge = options.maxEdge ?? DEFAULT_MAX_EDGE;
  const count = options.count ?? DEFAULT_COUNT;

  const image = await loadImage(imageUrl);
  const scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('This browser cannot sample image colours.');

  ctx.drawImage(image, 0, 0, width, height);

  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, width, height).data;
  } catch {
    // A cross-origin image taints the canvas. Stored images are same-origin, so this
    // only happens for an external URL, and returning nothing is the honest answer.
    throw new Error('That image could not be read for colour sampling.');
  }

  return quantise(data, count);
}

/**
 * Buckets pixels into a coarse colour cube and returns the most populated buckets.
 *
 * A histogram over a 4-bit-per-channel cube rather than k-means: it is deterministic,
 * fast, and for the purpose of picking a palette the extra precision of clustering
 * buys nothing.
 */
function quantise(data: Uint8ClampedArray, count: number): string[] {
  const buckets = new Map<number, { r: number; g: number; b: number; n: number }>();

  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3] ?? 0;
    // Skip transparency: product cut-outs have large empty regions that would
    // otherwise dominate as a single colour.
    if (alpha < 200) continue;

    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;

    // Studio product shots sit on white or near-white. Counting that background would
    // return "white" as the dominant colour of every bottle.
    if (r > 244 && g > 244 && b > 244) continue;

    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
      bucket.n += 1;
    } else {
      buckets.set(key, { r, g, b, n: 1 });
    }
  }

  if (buckets.size === 0) return [];

  const ranked = [...buckets.values()]
    .sort((a, b) => b.n - a.n)
    .map((bucket) => ({
      hex: toHex(
        Math.round(bucket.r / bucket.n),
        Math.round(bucket.g / bucket.n),
        Math.round(bucket.b / bucket.n),
      ),
      n: bucket.n,
    }));

  // Drop near-duplicates so the palette spans the image rather than returning six
  // shades of the same grey.
  const chosen: string[] = [];
  for (const candidate of ranked) {
    if (chosen.length >= count) break;
    if (chosen.some((existing) => distance(existing, candidate.hex) < 40)) continue;
    chosen.push(candidate.hex);
  }

  // Sorted dark to light, which is the order the generation prompt reads a palette in.
  return chosen.sort((a, b) => relativeLuminance(a) - relativeLuminance(b));
}

function toHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

function channels(hex: string): [number, number, number] {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

function distance(a: string, b: string): number {
  const [r1, g1, b1] = channels(a);
  const [r2, g2, b2] = channels(b);
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = channels(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('The bottle image could not be loaded.'));
    image.src = url;
  });
}
