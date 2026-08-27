/**
 * Single source of truth for tunable studio constants.
 *
 * Nothing in this file may be duplicated elsewhere in the codebase — in particular
 * the quality threshold and the aspect-ratio dimensions, which the brief calls out
 * explicitly.
 */

export const CAMPAIGN_ASPECT_RATIOS = ['1:1', '4:5', '9:16'] as const;
export type CampaignAspectRatio = (typeof CAMPAIGN_ASPECT_RATIOS)[number];

export const DEFAULT_ASPECT_RATIO: CampaignAspectRatio = '4:5';

export interface AspectRatioSpec {
  /** Ratio token understood by the image model. */
  readonly ratio: CampaignAspectRatio;
  readonly width: number;
  readonly height: number;
  readonly label: string;
  /** Fraction of the shortest edge the prompt asks to keep clear for overlaid text. */
  readonly safeAreaRatio: number;
}

export const ASPECT_RATIO_SPECS: Readonly<Record<CampaignAspectRatio, AspectRatioSpec>> = {
  '1:1': { ratio: '1:1', width: 1080, height: 1080, label: 'Square · Feed', safeAreaRatio: 0.06 },
  '4:5': { ratio: '4:5', width: 1080, height: 1350, label: 'Portrait · Feed', safeAreaRatio: 0.06 },
  '9:16': { ratio: '9:16', width: 1080, height: 1920, label: 'Story · Reel', safeAreaRatio: 0.07 },
};

export function aspectRatioSpec(ratio: CampaignAspectRatio): AspectRatioSpec {
  return ASPECT_RATIO_SPECS[ratio];
}

/** Number of visual ingredients the creative director may request (brief §37). */
export const HERO_ELEMENT_RANGE = { min: 3, max: 7 } as const;

/** Upload validation. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const ACCEPTED_IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/avif',
] as const;
export type AcceptedImageMimeType = (typeof ACCEPTED_IMAGE_MIME_TYPES)[number];

/** Storage path layout (brief §6). */
export const STORAGE_PATHS = {
  bottle: (perfumeId: string) => `perfumes/${perfumeId}/bottle`,
  references: (perfumeId: string) => `perfumes/${perfumeId}/references`,
  campaigns: (perfumeId: string) => `perfumes/${perfumeId}/campaigns`,
  final: (perfumeId: string) => `perfumes/${perfumeId}/final`,
} as const;
