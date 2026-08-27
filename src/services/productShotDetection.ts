/**
 * Decides whether an image is a studio product shot or a lifestyle photograph, from
 * the pixels rather than from its filename.
 *
 * Metadata gets this wrong in a way that matters. Retailers put campaign renders in the
 * same gallery as the product and give the whole gallery the product's alt text, so a
 * picture of a model can look exactly as relevant as the bottle. The pixels do not lie:
 * a product shot sits on a plain, uniform ground, and a lifestyle photograph does not.
 *
 * Browser-only, because the browser already decodes JPEG, WebP and AVIF natively and
 * the server has no image decoder.
 */

export interface ProductShotMetrics {
  /** How uniform the outer frame is. 1 means a perfectly flat background. */
  borderUniformity: number;
  /** How much busier the centre is than the border. 1 means a clear subject. */
  subjectContrast: number;
  /** Fraction of the border that is near-white, the classic studio background. */
  whiteBorder: number;
  /** Composite 0-1. Higher means more likely to be a usable product reference. */
  score: number;
}

const SAMPLE_EDGE = 128;
/** Width of the frame sampled as "border", as a fraction of the shortest edge. */
const BORDER_FRACTION = 0.08;

export async function scoreProductShot(imageUrl: string): Promise<ProductShotMetrics> {
  const image = await loadImage(imageUrl);

  const scale = Math.min(1, SAMPLE_EDGE / Math.max(image.width, image.height));
  const width = Math.max(8, Math.round((image.width || SAMPLE_EDGE) * scale));
  const height = Math.max(8, Math.round((image.height || SAMPLE_EDGE) * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('canvas unavailable');

  ctx.drawImage(image, 0, 0, width, height);
  const { data } = ctx.getImageData(0, 0, width, height);

  const border: number[][] = [];
  const centre: number[][] = [];
  const margin = Math.max(2, Math.round(Math.min(width, height) * BORDER_FRACTION));

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const alpha = data[i + 3] ?? 255;
      const pixel = [data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0];

      // A transparent cut-out is itself a strong product-shot signal, and counts as
      // plain background rather than being skipped.
      const isTransparent = alpha < 32;
      const isBorder = x < margin || y < margin || x >= width - margin || y >= height - margin;

      if (isBorder) border.push(isTransparent ? [255, 255, 255] : pixel);
      else if (!isTransparent) centre.push(pixel);
    }
  }

  const borderUniformity = uniformity(border);
  const centreVariance = variance(centre);
  const borderVariance = variance(border);

  // A clear subject on plain ground means the centre varies much more than the frame.
  const subjectContrast = clamp01((centreVariance - borderVariance) / 3000);
  const whiteBorder = border.length
    ? border.filter(([r, g, b]) => (r ?? 0) > 225 && (g ?? 0) > 225 && (b ?? 0) > 225).length /
      border.length
    : 0;

  /*
   * Border uniformity carries the most weight: it is the single property that separates
   * "object photographed against a backdrop" from "scene". Whiteness is a bonus rather
   * than a requirement, because plenty of luxury product shots use a dark or coloured
   * ground.
   */
  const score = clamp01(borderUniformity * 0.6 + subjectContrast * 0.25 + whiteBorder * 0.15);

  return { borderUniformity, subjectContrast, whiteBorder, score };
}

/** Scores several candidates, tolerating individual failures. */
export async function scoreProductShots(
  candidates: { id: string; url: string }[],
): Promise<Record<string, number>> {
  const scores: Record<string, number> = {};
  for (const candidate of candidates) {
    try {
      const metrics = await scoreProductShot(candidate.url);
      scores[candidate.id] = Number(metrics.score.toFixed(4));
    } catch {
      // A candidate that cannot be measured simply goes unscored, and the metadata
      // ranking stands for it.
    }
  }
  return scores;
}

/* ------------------------------------------------------------------ internals */

function variance(pixels: number[][]): number {
  if (pixels.length === 0) return 0;
  const mean = [0, 1, 2].map(
    (channel) => pixels.reduce((sum, p) => sum + (p[channel] ?? 0), 0) / pixels.length,
  );
  let total = 0;
  for (const pixel of pixels) {
    for (let channel = 0; channel < 3; channel += 1) {
      const delta = (pixel[channel] ?? 0) - (mean[channel] ?? 0);
      total += delta * delta;
    }
  }
  return total / pixels.length;
}

/** 1 for a perfectly flat set of pixels, falling off as they spread out. */
function uniformity(pixels: number[][]): number {
  if (pixels.length === 0) return 0;
  return clamp01(1 - Math.sqrt(variance(pixels)) / 120);
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('image load failed'));
    image.src = url;
  });
}
