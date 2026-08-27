import 'server-only';

import type { CampaignAspectRatio } from '@/lib/config/constants';
import { env } from '@/lib/config/env';
import { getDb } from '@/lib/db';
import { createLogger } from '@/lib/logger';
import { errors, toAppError } from '@/lib/errors';
import type { CreativeDirection, Perfume, ReferenceCandidate } from '@/lib/types';
import { toCreativeInput } from '@/lib/types/perfume';
import { buildProductImageQuery } from './productSearchService';
import { buildRuleCreativeDirection, explainRuleDirection } from './creativeDirectorRules';
import { collectCandidatesFromPages } from './referenceImageService';
import {
  deriveFamily,
  scrapePerfumeData,
  type PerfumeScrapeResult,
} from './perfumeScraperService';
import {
  acceptReferenceAsBottle,
  collectExistingConcepts,
  getPerfumeOrThrow,
} from './perfumeService';
import { buildCampaignPrompt, variationNudge } from './ai/promptBuilder';
import { writeTextToExportFolder } from './exportFolder';

const log = createLogger('perfume-prep');

/**
 * The end-to-end preparation pipeline: brand and name to a ready-to-use prompt.
 *
 * This is the free path through the product. Everything it does is scraping plus
 * deterministic rules, so it needs no API key and cannot hit a quota. Image
 * generation remains a separate, optional step.
 */

export interface PrepareInput {
  brand: string;
  name: string;
  variant?: string;
  arabicName?: string;
  urls?: string[];
  autoAcceptBottle?: boolean;
  buildDirection?: boolean;
}

export interface PrepareResult {
  perfume: Perfume;
  scrape: PerfumeScrapeResult;
  candidates: ReferenceCandidate[];
  /** Best candidate, accepted as the product reference when asked. */
  acceptedCandidateId?: string;
  creativeDirection?: CreativeDirection;
  /** Why the rules chose what they chose. */
  directionRationale?: string;
  /** The finished generation prompt, ready to copy. */
  prompt?: string;
  /** Per-variation prompts, for producing a set by hand elsewhere. */
  variationPrompts?: string[];
  warnings: string[];
}

export async function prepareFromBrandAndName(input: PrepareInput): Promise<PrepareResult> {
  const db = getDb();
  const warnings: string[] = [];

  // Reuse an existing row for the same identity so running this twice refreshes
  // rather than duplicating.
  const existing = (await db.listPerfumes()).find(
    (p) =>
      p.brand.toLowerCase() === input.brand.toLowerCase() &&
      p.name.toLowerCase() === input.name.toLowerCase() &&
      (p.variant ?? '').toLowerCase() === (input.variant ?? '').toLowerCase(),
  );

  let perfume =
    existing ??
    (await db.createPerfume({
      brand: input.brand,
      name: input.name,
      ...(input.variant ? { variant: input.variant } : {}),
      ...(input.arabicName ? { arabicName: input.arabicName } : {}),
    }));

  /* ------------------------------------------------------- 1. notes + accords */

  const scrape = await scrapePerfumeData({
    brand: input.brand,
    name: input.name,
    ...(input.variant ? { variant: input.variant } : {}),
    ...(input.urls ? { urls: input.urls } : {}),
  });

  const notes = scrape.notes.value;
  const accords = scrape.accords.value;
  const noteTotal = notes.topNotes.length + notes.heartNotes.length + notes.baseNotes.length;

  if (noteTotal === 0) {
    warnings.push(
      'No fragrance notes could be extracted. Enter them by hand, or supply a product page URL that lists them.',
    );
  } else {
    perfume = await db.updatePerfume(perfume.id, {
      topNotes: notes.topNotes,
      heartNotes: notes.heartNotes,
      baseNotes: notes.baseNotes,
      mainAccords: accords.map((a) => a.name),
      ...(deriveFamily(accords, notes) ? { fragranceFamily: deriveFamily(accords, notes) } : {}),
      notesSource: 'scraped',
      // Scraped data is evidence, not truth: a human still signs it off.
      notesApproved: false,
    });
  }

  if (accords.length === 0) {
    warnings.push(
      'No weighted accords were found, so the creative direction was derived from the notes alone.',
    );
  }

  /* ------------------------------------------------------ 2. bottle reference */

  let candidates: ReferenceCandidate[] = [];
  let acceptedCandidateId: string | undefined;

  try {
    const imageQuery = buildProductImageQuery(input.brand, input.name, input.variant);
    const pagesForImages = input.urls ?? (await pagesFromScrape(scrape, imageQuery));
    const collected = await collectCandidatesFromPages(perfume.id, pagesForImages, {
      brand: input.brand,
      name: input.name,
      ...(input.variant ? { variant: input.variant } : {}),
    });
    candidates = collected.candidates;

    if (candidates.length > 0) {
      perfume = await db.updatePerfume(perfume.id, { referenceCandidates: candidates });

      if (input.autoAcceptBottle !== false) {
        const best = candidates[0];
        if (best?.usable) {
          const updated = await acceptReferenceAsBottle(perfume.id, best.id);
          if (updated) {
            perfume = updated;
            acceptedCandidateId = best.id;
          }
        } else {
          warnings.push(
            'No candidate was large enough to use as a product reference. Pick one manually or supply a better source.',
          );
        }
      }
    } else {
      warnings.push('No bottle images were found. Upload one, or supply a product page URL.');
    }
  } catch (error) {
    const appError = toAppError(error);
    log.warn('image collection failed', { code: appError.code });
    warnings.push(`Bottle images could not be collected: ${appError.message}`);
  }

  /* --------------------------------------------------- 3. direction + prompt */

  if (input.buildDirection === false || noteTotal === 0) {
    return { perfume, scrape, candidates, ...(acceptedCandidateId ? { acceptedCandidateId } : {}), warnings };
  }

  const existingConcepts = await collectExistingConcepts(perfume.id);
  const direction = buildRuleCreativeDirection({
    perfume: toCreativeInput(perfume),
    accords,
    ...(perfume.bottleAnalysis ? { bottleAnalysis: perfume.bottleAnalysis } : {}),
    ...(perfume.bottlePalette ? { bottlePalette: perfume.bottlePalette } : {}),
    existingConcepts,
  });

  perfume = await db.updatePerfume(perfume.id, { creativeDirection: direction });

  const basePrompt = buildCampaignPrompt({
    perfume: toCreativeInput(perfume),
    creativeDirection: direction,
    ...(perfume.bottleAnalysis ? { bottleAnalysis: perfume.bottleAnalysis } : {}),
    aspectRatio: env.creative.defaultAspectRatio,
    hasBottleImage: Boolean(perfume.bottleImageUrl),
    includeText: false,
  });

  const variationPrompts = Array.from(
    { length: env.creative.takeCount },
    (_, index) => `${basePrompt}\n\n${variationNudge(index)}`,
  );

  if (!perfume.bottleAnalysis) {
    warnings.push(
      'The bottle has not been analysed, so the prompt relies on the attached photograph alone. Run Analyze bottle, or describe it by hand, for stronger fidelity wording.',
    );
  }

  return {
    perfume,
    scrape,
    candidates,
    ...(acceptedCandidateId ? { acceptedCandidateId } : {}),
    creativeDirection: direction,
    directionRationale: explainRuleDirection({
      perfume: toCreativeInput(perfume),
      accords,
      ...(perfume.bottleAnalysis ? { bottleAnalysis: perfume.bottleAnalysis } : {}),
      ...(perfume.bottlePalette ? { bottlePalette: perfume.bottlePalette } : {}),
    }),
    prompt: basePrompt,
    variationPrompts,
    warnings,
  };
}

/** How few reusable pages justify spending a second search. */
const MIN_PAGES_BEFORE_EXTRA_SEARCH = 3;

/**
 * Pages worth reading for images.
 *
 * Reuses the pages the note scrape already read, and only searches again when that
 * leaves too little to work with.
 *
 * This used to search unconditionally, which doubled the search volume for every
 * perfume. The keyless search endpoint starts serving a bot challenge after a handful of
 * rapid queries, so on a batch of a dozen perfumes that second search was the difference
 * between finishing and being cut off three rows in. The pages found for notes are
 * retail and reference pages anyway — exactly where the product photography lives.
 */
async function pagesFromScrape(scrape: PerfumeScrapeResult, imageQuery: string): Promise<string[]> {
  const fromScrape = scrape.pagesRead.filter((page) => page.ok).map((page) => page.url);
  if (fromScrape.length >= MIN_PAGES_BEFORE_EXTRA_SEARCH) return fromScrape.slice(0, 5);

  const { searchProductPages } = await import('./productSearchService');
  try {
    const searched = await searchProductPages(imageQuery, 6);
    return [...new Set([...fromScrape, ...searched.map((result) => result.url)])].slice(0, 5);
  } catch (error) {
    // A blocked top-up search must not lose the pages we already have.
    log.warn('image search skipped', { code: toAppError(error).code });
    return fromScrape;
  }
}

/* ------------------------------------------------------------------ prompt */

/** Newline constant, so the template text stays readable in source. */
const NL = String.fromCharCode(10);

export interface BuildPromptOptions {
  aspectRatio?: CampaignAspectRatio;
  /** Also write a .txt copy into the export folder. */
  save?: boolean;
}

export interface BuildPromptResult {
  perfume: Perfume;
  aspectRatio: CampaignAspectRatio;
  prompt: string;
  variationPrompts: string[];
  /** Project-relative path of the saved copy, when one was requested. */
  savedTo?: string;
  warnings: string[];
}

/**
 * Builds the generation prompt for a perfume as it stands.
 *
 * Deliberately separate from campaign creation: the prompt is useful on its own, and
 * the free path through this app ends here, with text a person pastes into whichever
 * image tool they have access to.
 */
export async function buildPerfumePrompt(
  perfumeId: string,
  options: BuildPromptOptions = {},
): Promise<BuildPromptResult> {
  const perfume = await getPerfumeOrThrow(perfumeId);
  const warnings: string[] = [];

  if (!perfume.creativeDirection) {
    throw errors.validation(
      'This perfume has no creative direction yet. Run the prepare step, or write one by hand.',
    );
  }
  if (!perfume.bottleImageUrl) {
    warnings.push(
      'No bottle reference is attached, so the prompt cannot ask for product fidelity. Attach one before generating.',
    );
  }
  if (!perfume.notesApproved) {
    warnings.push('The notes have not been approved yet. Check them before using this prompt.');
  }

  const aspectRatio = options.aspectRatio ?? env.creative.defaultAspectRatio;

  const prompt = buildCampaignPrompt({
    perfume: toCreativeInput(perfume),
    creativeDirection: perfume.creativeDirection,
    ...(perfume.bottleAnalysis ? { bottleAnalysis: perfume.bottleAnalysis } : {}),
    aspectRatio,
    hasBottleImage: Boolean(perfume.bottleImageUrl),
    includeText: false,
  });

  const variationPrompts = Array.from(
    { length: env.creative.takeCount },
    (_, index) => `${prompt}

${variationNudge(index)}`,
  );

  let savedTo: string | undefined;
  if (options.save) {
    savedTo = await writePromptFile(perfume, aspectRatio, prompt, variationPrompts);
    if (!savedTo) warnings.push('The prompt file could not be written to the export folder.');
  }

  return {
    perfume,
    aspectRatio,
    prompt,
    variationPrompts,
    ...(savedTo ? { savedTo } : {}),
    warnings,
  };
}

/**
 * Writes the prompt alongside the exported artwork.
 *
 * One file per perfume, containing the shared prompt and each variation nudge, so the
 * whole set can be produced by hand in an external tool without going back and forth
 * to the app.
 */
async function writePromptFile(
  perfume: Perfume,
  aspectRatio: CampaignAspectRatio,
  prompt: string,
  variationPrompts: string[],
): Promise<string | undefined> {
  const header = [
    `${perfume.brand} ${perfume.name}${perfume.variant ? ` ${perfume.variant}` : ''}`,
    `Concept: ${perfume.creativeDirection?.concept ?? 'unset'}`,
    `Format: ${aspectRatio}`,
    perfume.bottleImageUrl
      ? 'Attach the bottle photograph as a reference image when generating.'
      : 'NO bottle reference is attached; the product will be invented.',
    '',
    'The base prompt below is shared by every variation. Each variation adds one line',
    'at the end, listed after it.',
  ].join(NL);

  const body = [
    header,
    divider('BASE PROMPT'),
    prompt,
    ...variationPrompts.map((variation, index) => {
      const nudge = variation.slice(prompt.length).trim();
      return [divider(`VARIATION ${index + 1} (append to the base prompt)`), nudge].join(NL);
    }),
    '',
  ].join(NL + NL);

  return writeTextToExportFolder({
    brand: perfume.brand,
    name: perfume.name,
    ...(perfume.variant ? { variant: perfume.variant } : {}),
    aspectRatio,
    suffix: 'prompt',
    extension: 'txt',
    contents: body,
  });
}

function divider(label: string): string {
  return `${'='.repeat(76)}
${label}
${'='.repeat(76)}`;
}

/* ----------------------------------------------------------------- palette */

export interface ApplyPaletteResult {
  perfume: Perfume;
  creativeDirection?: CreativeDirection;
  directionRationale?: string;
  prompt?: string;
  variationPrompts?: string[];
}

/**
 * Stores a sampled bottle palette and rebuilds the direction from it.
 *
 * This is the step that makes the palette of the campaign the palette of the product.
 * The accords are re-read from what was already saved on the perfume rather than
 * scraped again: nothing about the pages has changed.
 */
export async function applyBottlePalette(
  perfumeId: string,
  palette: string[],
  options: { rebuildDirection?: boolean } = {},
): Promise<ApplyPaletteResult> {
  const db = getDb();
  let perfume = await getPerfumeOrThrow(perfumeId);

  perfume = await db.updatePerfume(perfumeId, { bottlePalette: palette });

  if (options.rebuildDirection === false) return { perfume };

  const accords = (perfume.mainAccords ?? []).map((name, index, all) => ({
    name,
    // Order was preserved on save, so position stands in for the original weight.
    weight: Math.max(10, 100 - index * Math.floor(90 / Math.max(1, all.length))),
  }));

  const direction = buildRuleCreativeDirection({
    perfume: toCreativeInput(perfume),
    accords,
    ...(perfume.bottleAnalysis ? { bottleAnalysis: perfume.bottleAnalysis } : {}),
    bottlePalette: palette,
    existingConcepts: await collectExistingConcepts(perfumeId),
  });

  perfume = await db.updatePerfume(perfumeId, { creativeDirection: direction });

  const built = await buildPerfumePrompt(perfumeId);

  return {
    perfume,
    creativeDirection: direction,
    directionRationale: explainRuleDirection({
      perfume: toCreativeInput(perfume),
      accords,
      ...(perfume.bottleAnalysis ? { bottleAnalysis: perfume.bottleAnalysis } : {}),
      bottlePalette: palette,
    }),
    prompt: built.prompt,
    variationPrompts: built.variationPrompts,
  };
}
