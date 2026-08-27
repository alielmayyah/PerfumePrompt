/** Core perfume domain types. */

/**
 * Progress through the preparer, in order. Derived from the data, never set by hand,
 * so it cannot drift from what the perfume actually has.
 */
export const PERFUME_STATUSES = [
  'draft',
  'bottle_ready',
  'notes_ready',
  'direction_ready',
] as const;
export type PerfumeStatus = (typeof PERFUME_STATUSES)[number];

export const NOTES_SOURCES = ['manual', 'scraped', 'seed'] as const;
export type NotesSource = (typeof NOTES_SOURCES)[number];

export interface BottleAnalysis {
  shape: string;
  proportions: string;
  materials: string[];
  dominantColors: string[];
  capDescription: string;
  bottleDescription: string;
  visualPersonality: string;
  luxuryLevel: string;
  distinctiveElements: string[];
}

export interface CreativeDirection {
  concept: string;
  mood: string;

  environment: string;
  background: string;
  surface: string;

  lighting: string;

  colorPalette: string[];

  heroElements: string[];
  secondaryElements: string[];

  atmosphericEffects: string[];

  symbolicElement?: string;

  composition: string;
  cameraAngle: string;

  visualStory: string;
}

export interface PerfumeResearch {
  topNotes: string[];
  heartNotes: string[];
  baseNotes: string[];
  fragranceFamily: string;
  mainAccords: string[];
  /** Short prose the model used to justify the notes, shown to the user for review. */
  rationale?: string;
  /** Grounding sources, when the research call was search-grounded. */
  sources?: string[];
  confidence?: 'low' | 'medium' | 'high';
}

/**
 * A bottle image sourced from the web, waiting for a human to accept or reject it.
 *
 * Candidates are kept on the perfume rather than held in component state so a
 * refresh does not lose them, and so the provenance of the chosen product
 * reference (which page it came from) stays on the record.
 */
export interface ReferenceCandidate {
  id: string;
  storagePath: string;
  url: string;
  sourceUrl: string;
  pageUrl: string;
  pageTitle?: string;
  mimeType: string;
  byteLength: number;
  width?: number;
  height?: number;
  /** Alt text from the page, used to judge what the image actually shows. */
  alt?: string;
  /** Large enough to preserve product detail. */
  usable: boolean;
  /** How strongly this looks like a photograph of this product. Higher is better. */
  score?: number;
  /**
   * 0-1 measure of how much this looks like a studio product shot rather than a
   * lifestyle photograph, measured from the actual pixels in the browser.
   */
  visualScore?: number;
  /** Why it scored that way, shown in the picker. */
  note?: string;
}

export interface Perfume {
  id: string;
  brand: string;
  name: string;
  arabicName?: string;
  variant?: string;

  bottleImageUrl: string;

  topNotes: string[];
  heartNotes: string[];
  baseNotes: string[];

  fragranceFamily?: string;
  mainAccords?: string[];

  /** Provenance of the notes, and whether a human has signed them off. */
  notesSource: NotesSource;
  notesApproved: boolean;

  bottleAnalysis?: BottleAnalysis;
  creativeDirection?: CreativeDirection;

  /**
   * Dominant colours sampled from the bottle photograph, as #RRGGBB.
   *
   * Sampled in the browser rather than on the server: the browser decodes JPEG, WebP
   * and AVIF natively, so no image-decoding dependency is needed. Feeds the
   * rule-based creative director, which uses it for the palette and light temperature.
   */
  bottlePalette?: string[];

  /** Web-sourced bottle candidates awaiting selection. */
  referenceCandidates?: ReferenceCandidate[];
  /** Page the accepted bottle image came from, for provenance. */
  bottleSourceUrl?: string;

  status: PerfumeStatus;

  createdAt: string;
  updatedAt: string;
}

export type PerfumeCreateInput = Pick<Perfume, 'brand' | 'name'> &
  Partial<
    Pick<
      Perfume,
      | 'arabicName'
      | 'variant'
      | 'bottleImageUrl'
      | 'topNotes'
      | 'heartNotes'
      | 'baseNotes'
      | 'fragranceFamily'
      | 'mainAccords'
      | 'notesSource'
      | 'notesApproved'
    >
  >;

export type PerfumeUpdateInput = Partial<Omit<Perfume, 'id' | 'createdAt' | 'updatedAt'>>;

/** Everything the AI stages need to reason about a perfume. */
export interface PerfumeCreativeInput {
  brand: string;
  name: string;
  arabicName?: string;
  variant?: string;
  topNotes: string[];
  heartNotes: string[];
  baseNotes: string[];
  fragranceFamily?: string;
  mainAccords?: string[];
}

export function toCreativeInput(perfume: Perfume): PerfumeCreativeInput {
  return {
    brand: perfume.brand,
    name: perfume.name,
    arabicName: perfume.arabicName,
    variant: perfume.variant,
    topNotes: perfume.topNotes,
    heartNotes: perfume.heartNotes,
    baseNotes: perfume.baseNotes,
    fragranceFamily: perfume.fragranceFamily,
    mainAccords: perfume.mainAccords,
  };
}

export function perfumeDisplayName(perfume: Pick<Perfume, 'brand' | 'name' | 'variant'>): string {
  return [perfume.brand, perfume.name, perfume.variant].filter(Boolean).join(' ');
}

export function hasAnyNotes(
  perfume: Pick<Perfume, 'topNotes' | 'heartNotes' | 'baseNotes'>,
): boolean {
  return (
    perfume.topNotes.length > 0 || perfume.heartNotes.length > 0 || perfume.baseNotes.length > 0
  );
}
