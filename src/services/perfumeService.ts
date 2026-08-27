import 'server-only';

import { getDb, type ListPerfumesOptions } from '@/lib/db';
import { errors } from '@/lib/errors';
import { readImageBytes, saveImage } from '@/lib/storage';
import type {
  Perfume,
  PerfumeCreateInput,
  PerfumeUpdateInput,
  ReferenceCandidate,
} from '@/lib/types';
import { referenceScore } from './referenceImageService';

/** Business logic for perfumes. Route handlers stay thin by delegating here. */

export async function listPerfumes(options?: ListPerfumesOptions): Promise<Perfume[]> {
  return getDb().listPerfumes(options);
}

export async function getPerfumeOrThrow(id: string): Promise<Perfume> {
  const perfume = await getDb().getPerfume(id);
  if (!perfume) throw errors.notFound('Perfume');
  return perfume;
}

export async function createPerfume(input: PerfumeCreateInput): Promise<Perfume> {
  return getDb().createPerfume(input);
}

export async function updatePerfume(id: string, patch: PerfumeUpdateInput): Promise<Perfume> {
  await getPerfumeOrThrow(id);
  return getDb().updatePerfume(id, patch);
}

export async function deletePerfume(id: string): Promise<void> {
  await getPerfumeOrThrow(id);
  await getDb().deletePerfume(id);
}

/** Stores an uploaded bottle image and points the perfume at it. */
export async function attachBottleImage(
  perfumeId: string,
  bytes: Uint8Array,
  mimeType: string,
): Promise<Perfume> {
  await getPerfumeOrThrow(perfumeId);
  const stored = await saveImage({
    perfumeId,
    kind: 'bottle',
    bytes,
    mimeType,
    label: 'bottle',
  });
  return getDb().updatePerfume(perfumeId, { bottleImageUrl: stored.url });
}

/**
 * Promotes a web-sourced candidate to the protected product reference.
 *
 * The bytes are re-saved under the perfume's `bottle/` prefix rather than the
 * candidate URL simply being pointed at: the bottle image is the one asset the whole
 * pipeline depends on, and it should not live among discarded candidates that a
 * later cleanup might remove. The originating page is recorded for provenance.
 */
export async function acceptReferenceAsBottle(
  perfumeId: string,
  candidateId: string,
): Promise<Perfume | undefined> {
  const perfume = await getPerfumeOrThrow(perfumeId);
  const candidate = perfume.referenceCandidates?.find((c) => c.id === candidateId);
  if (!candidate) return undefined;

  const file = await readImageBytes(candidate.storagePath);
  const stored = await saveImage({
    perfumeId,
    kind: 'bottle',
    bytes: file.bytes,
    mimeType: file.mimeType,
    label: 'bottle',
  });

  return getDb().updatePerfume(perfumeId, {
    bottleImageUrl: stored.url,
    bottleSourceUrl: candidate.pageUrl,
    // A new product reference invalidates any analysis of the previous one.
    bottleAnalysis: undefined,
  });
}

/**
 * Concepts already in use across the library, so a newly derived direction differs
 * from them rather than repeating a scene.
 */
export async function collectExistingConcepts(excludePerfumeId?: string): Promise<string[]> {
  const perfumes = await getDb().listPerfumes();
  const concepts = new Set<string>();
  for (const perfume of perfumes) {
    if (perfume.id === excludePerfumeId) continue;
    const concept = perfume.creativeDirection?.concept?.trim();
    if (concept) concepts.add(concept);
  }
  return [...concepts].slice(0, 20);
}

/**
 * Applies browser-measured visual scores to the candidate list and re-ranks it.
 *
 * Metadata ranking runs first, during the scrape, because it is free. This second pass
 * exists because metadata cannot tell a product photograph from a campaign render that
 * happens to sit in the same gallery under the same alt text; the pixels can.
 */
export async function rankCandidatesWithVisualScores(
  perfumeId: string,
  scores: Record<string, number>,
  options: { accept?: boolean } = {},
): Promise<{ perfume: Perfume; accepted?: ReferenceCandidate }> {
  const perfume = await getPerfumeOrThrow(perfumeId);
  const candidates = perfume.referenceCandidates ?? [];
  if (candidates.length === 0) return { perfume };

  const identity = {
    brand: perfume.brand,
    name: perfume.name,
    ...(perfume.variant ? { variant: perfume.variant } : {}),
  };

  const rescored = candidates
    .map((candidate) => {
      const visualScore = scores[candidate.id];
      const withVisual: ReferenceCandidate =
        visualScore === undefined ? candidate : { ...candidate, visualScore };
      return { ...withVisual, score: Math.round(referenceScore(withVisual, identity)) };
    })
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  const updated = await getDb().updatePerfume(perfumeId, { referenceCandidates: rescored });

  const best = rescored.find((candidate) => candidate.usable) ?? rescored[0];
  if (options.accept === false || !best) return { perfume: updated };

  // Only re-accept when the winner actually changed, so this never churns storage.
  if (best.url === updated.bottleImageUrl) return { perfume: updated, accepted: best };

  const accepted = await acceptReferenceAsBottle(perfumeId, best.id);
  return { perfume: accepted ?? updated, accepted: best };
}
