import { z } from 'zod';

import { HERO_ELEMENT_RANGE } from '@/lib/config/constants';

/**
 * Validators for the structured data this app produces and accepts.
 *
 * The creative direction is validated both on the way in from a request and on the way
 * out of the rule engine, so a hand edit and a derived direction are held to exactly
 * the same shape. That shared contract is what lets the two be interchangeable.
 */

const nonEmptyString = z.string().trim().min(1);
const stringList = z.array(z.string().trim().min(1));

const hexColour = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Expected a #RRGGBB hex colour');

/** Trims, de-duplicates case-insensitively, and caps a list. */
function cleanList(values: string[], max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = value.trim().toLowerCase();
    if (key.length === 0 || seen.has(key)) continue;
    seen.add(key);
    out.push(value.trim());
    if (out.length >= max) break;
  }
  return out;
}

/**
 * A written description of the physical bottle.
 *
 * Optional throughout the app: when present it strengthens the fidelity wording in the
 * prompt, and it is the only place a symbolic motif can be justified from.
 */
export const bottleAnalysisSchema = z.object({
  shape: nonEmptyString,
  proportions: nonEmptyString,
  materials: stringList.min(1).max(8),
  dominantColors: stringList.min(1).max(8),
  capDescription: nonEmptyString,
  bottleDescription: nonEmptyString,
  visualPersonality: nonEmptyString,
  luxuryLevel: nonEmptyString,
  distinctiveElements: stringList.max(10).default([]),
});

/** The art direction the prompt is built from. */
export const creativeDirectionSchema = z
  .object({
    concept: nonEmptyString.max(120),
    mood: nonEmptyString,

    environment: nonEmptyString,
    background: nonEmptyString,
    surface: nonEmptyString,

    lighting: nonEmptyString,

    colorPalette: z.array(hexColour).min(3).max(6),

    heroElements: stringList.min(1).max(HERO_ELEMENT_RANGE.max),
    secondaryElements: stringList.max(4).default([]),

    atmosphericEffects: stringList.max(4).default([]),

    // "none" is a legitimate answer and the common one, so it normalises to absent
    // rather than being stored as the literal word.
    symbolicElement: z
      .string()
      .trim()
      .optional()
      .transform((value) => {
        if (!value) return undefined;
        return value.toLowerCase() === 'none' ? undefined : value;
      }),

    composition: nonEmptyString,
    cameraAngle: nonEmptyString,

    visualStory: nonEmptyString,
  })
  .transform((value) => ({
    ...value,
    heroElements: cleanList(value.heroElements, HERO_ELEMENT_RANGE.max),
    secondaryElements: cleanList(value.secondaryElements, 4),
    atmosphericEffects: cleanList(value.atmosphericEffects, 4),
  }));

export type RawBottleAnalysis = z.infer<typeof bottleAnalysisSchema>;
export type RawCreativeDirection = z.infer<typeof creativeDirectionSchema>;
