import type { Perfume } from '@/lib/types';
import { hasAnyNotes } from '@/lib/types/perfume';

/** Fills in defaults so the driver always yields a fully-populated domain object. */
export function normalisePerfume(row: Partial<Perfume> & { id: string }): Perfume {
  const perfume: Perfume = {
    id: row.id,
    brand: row.brand ?? '',
    name: row.name ?? '',
    arabicName: row.arabicName,
    variant: row.variant,
    bottleImageUrl: row.bottleImageUrl ?? '',
    topNotes: row.topNotes ?? [],
    heartNotes: row.heartNotes ?? [],
    baseNotes: row.baseNotes ?? [],
    fragranceFamily: row.fragranceFamily,
    mainAccords: row.mainAccords ?? [],
    notesSource: row.notesSource ?? 'manual',
    notesApproved: row.notesApproved ?? false,
    bottleAnalysis: row.bottleAnalysis,
    creativeDirection: row.creativeDirection,
    bottlePalette: row.bottlePalette ?? [],
    bottleSourceUrl: row.bottleSourceUrl,
    referenceCandidates: row.referenceCandidates ?? [],
    status: row.status ?? 'draft',
    createdAt: row.createdAt ?? new Date(0).toISOString(),
    updatedAt: row.updatedAt ?? row.createdAt ?? new Date(0).toISOString(),
  };
  return { ...perfume, status: derivePerfumeStatus(perfume) };
}

/**
 * Status is derived, not hand-maintained, so it can never drift from the data.
 */
export function derivePerfumeStatus(perfume: Perfume): Perfume['status'] {
  if (perfume.creativeDirection) return 'direction_ready';
  if (hasAnyNotes(perfume) && perfume.notesApproved) return 'notes_ready';
  if (perfume.bottleImageUrl) return 'bottle_ready';
  return 'draft';
}

export function sortByCreatedAtDesc<T extends { createdAt: string }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
