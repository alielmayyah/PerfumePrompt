import { describe, expect, it } from 'vitest';

import { bottleAnalysisSchema, creativeDirectionSchema } from '@/lib/schemas/ai';
import { HERO_ELEMENT_RANGE } from '@/lib/config/constants';

const validDirection = {
  concept: 'Nocturnal Cedar Rite',
  mood: 'dark, powerful, composed',
  environment: 'dark forest clearing',
  background: 'deep charcoal atmospheric depth',
  surface: 'wet slate',
  lighting: 'cold rim light',
  colorPalette: ['#0B0C0E', '#1E2429', '#4A5A52'],
  heroElements: ['cedar wood', 'lavender sprigs', 'tonka beans'],
  secondaryElements: ['sage leaves'],
  atmosphericEffects: ['mist'],
  symbolicElement: 'snake',
  composition: 'centred hero bottle',
  cameraAngle: 'slightly low editorial angle',
  visualStory: 'A serpent rite in a cold cedar forest after dark',
};

describe('creativeDirectionSchema', () => {
  it('accepts a well-formed direction', () => {
    expect(creativeDirectionSchema.parse(validDirection).concept).toBe('Nocturnal Cedar Rite');
  });

  it('normalises the literal string "none" to no symbolic element', () => {
    const parsed = creativeDirectionSchema.parse({ ...validDirection, symbolicElement: 'None' });
    expect(parsed.symbolicElement).toBeUndefined();
  });

  it('rejects non-hex palette entries', () => {
    const result = creativeDirectionSchema.safeParse({
      ...validDirection,
      colorPalette: ['charcoal', '#1E2429', '#4A5A52'],
    });
    expect(result.success).toBe(false);
  });

  it('requires at least three palette colours', () => {
    const result = creativeDirectionSchema.safeParse({
      ...validDirection,
      colorPalette: ['#000000', '#111111'],
    });
    expect(result.success).toBe(false);
  });

  it('caps hero elements so the frame cannot be overloaded', () => {
    const result = creativeDirectionSchema.safeParse({
      ...validDirection,
      heroElements: Array.from({ length: 12 }, (_, i) => `element ${i}`),
    });
    expect(result.success).toBe(false);
  });

  it('de-duplicates hero elements case-insensitively', () => {
    const parsed = creativeDirectionSchema.parse({
      ...validDirection,
      heroElements: ['Cedar Wood', 'cedar wood', 'Tonka Beans'],
    });
    expect(parsed.heroElements).toEqual(['Cedar Wood', 'Tonka Beans']);
    expect(parsed.heroElements.length).toBeLessThanOrEqual(HERO_ELEMENT_RANGE.max);
  });

  it('rejects an empty concept', () => {
    expect(creativeDirectionSchema.safeParse({ ...validDirection, concept: '   ' }).success).toBe(
      false,
    );
  });
});

describe('bottleAnalysisSchema', () => {
  const valid = {
    shape: 'tall cylindrical bottle',
    proportions: 'vertical',
    materials: ['glass'],
    dominantColors: ['charcoal'],
    capDescription: 'matte black cap',
    bottleDescription: 'dark bottle',
    visualPersonality: 'dark, powerful',
    luxuryLevel: 'high',
    distinctiveElements: [],
  };

  it('accepts a bottle with no ornamentation', () => {
    expect(bottleAnalysisSchema.parse(valid).distinctiveElements).toEqual([]);
  });

  it('defaults distinctiveElements when the model omits it', () => {
    const { distinctiveElements: _omitted, ...withoutElements } = valid;
    expect(bottleAnalysisSchema.parse(withoutElements).distinctiveElements).toEqual([]);
  });

  it('requires at least one material', () => {
    expect(bottleAnalysisSchema.safeParse({ ...valid, materials: [] }).success).toBe(false);
  });
});
