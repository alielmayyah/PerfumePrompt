import { z } from 'zod';

import { PERFUME_STATUSES, NOTES_SOURCES } from '@/lib/types/perfume';
import { bottleAnalysisSchema, creativeDirectionSchema } from './ai';

/** Request-body validators. Route handlers stay thin by delegating to these. */

const trimmed = z.string().trim();
const noteList = z.array(trimmed.min(1).max(80)).max(20);

export const perfumeCreateBodySchema = z.object({
  brand: trimmed.min(1).max(80),
  name: trimmed.min(1).max(120),
  arabicName: trimmed.max(120).optional(),
  variant: trimmed.max(120).optional(),
  bottleImageUrl: trimmed.max(2048).optional(),
  topNotes: noteList.optional(),
  heartNotes: noteList.optional(),
  baseNotes: noteList.optional(),
  fragranceFamily: trimmed.max(120).optional(),
  mainAccords: noteList.optional(),
  notesSource: z.enum(NOTES_SOURCES).optional(),
  notesApproved: z.boolean().optional(),
});

const hexColour = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Expected a #RRGGBB hex colour');

export const perfumeUpdateBodySchema = perfumeCreateBodySchema.partial().extend({
  bottlePalette: z.array(hexColour).max(12).optional(),
  status: z.enum(PERFUME_STATUSES).optional(),
  bottleAnalysis: bottleAnalysisSchema.optional(),
  creativeDirection: creativeDirectionSchema.optional(),
});

export const bottleAnalyzeBodySchema = z.object({
  /** Analyse a not-yet-saved upload without mutating the perfume row. */
  bottleImageUrl: trimmed.max(2048).optional(),
  persist: z.boolean().default(true),
});

export const uploadKindSchema = z.enum(['bottle', 'references', 'final']);
