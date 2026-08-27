import { describe, expect, it } from 'vitest';

import { creativeDirectionSchema } from '@/lib/schemas/ai';
import type { BottleAnalysis, PerfumeCreativeInput } from '@/lib/types';
import { buildRuleCreativeDirection, hashIdentity } from '@/services/creativeDirectorRules';

/**
 * The rule engine replaces a model call, so it carries the same obligations the model
 * prompt states: the bottle leads, the notes populate, the frame stays uncrowded, and
 * a motif appears only when the product itself has one.
 */

const ibraq: PerfumeCreativeInput = {
  brand: 'Ibraq',
  name: 'Black Diamond Incense',
  topNotes: ['Black Currant', 'Aquatic Notes', 'Birch'],
  heartNotes: ['Incense', 'Vanilla', 'Sandalwood'],
  baseNotes: ['Leather', 'Oud', 'Smoke', 'Amber'],
};

const khamrah: PerfumeCreativeInput = {
  brand: 'Lattafa',
  name: 'Khamrah',
  variant: 'Qahwa',
  topNotes: ['Coffee', 'Cinnamon', 'Cardamom'],
  heartNotes: ['Dried Fruits', 'Praline'],
  baseNotes: ['Vanilla', 'Tonka Bean', 'Amber'],
};

const ariz: PerfumeCreativeInput = {
  brand: 'Lattafa',
  name: 'Ariz',
  topNotes: ['Bergamot', 'Saffron', 'Pink Pepper'],
  heartNotes: ['Rose', 'Jasmine', 'Orange Blossom'],
  baseNotes: ['Sandalwood', 'White Musk', 'Amber'],
};

describe('buildRuleCreativeDirection', () => {
  it('produces a direction that satisfies the shared schema', () => {
    const direction = buildRuleCreativeDirection({ perfume: ibraq });
    expect(creativeDirectionSchema.safeParse(direction).success).toBe(true);
  });

  it('is deterministic for the same perfume', () => {
    const a = buildRuleCreativeDirection({ perfume: ibraq });
    const b = buildRuleCreativeDirection({ perfume: ibraq });
    expect(a).toEqual(b);
  });

  it('gives different perfumes different worlds', () => {
    const smoky = buildRuleCreativeDirection({ perfume: ibraq });
    const coffee = buildRuleCreativeDirection({ perfume: khamrah });
    const floral = buildRuleCreativeDirection({ perfume: ariz });

    const environments = [smoky.environment, coffee.environment, floral.environment];
    expect(new Set(environments).size).toBe(3);
    expect(coffee.environment.toLowerCase()).toMatch(/coffee|roast|majlis/);
  });

  it('lets the dominant accord override the note tiers', () => {
    // Aquatic sits in the top notes, but smoky dominates, so the scene must not become
    // a marine one.
    const direction = buildRuleCreativeDirection({
      perfume: ibraq,
      accords: [
        { name: 'smoky', weight: 100 },
        { name: 'marine', weight: 36 },
      ],
    });
    expect(direction.environment.toLowerCase()).not.toMatch(/tide|coastal|sea|wet stone terrace/);
  });

  it('leads the frame with a note that justified the world, not a top note', () => {
    const direction = buildRuleCreativeDirection({ perfume: ibraq });
    const lead = direction.heroElements[0]?.toLowerCase() ?? '';
    expect(lead).not.toMatch(/water|droplet/);
    expect(lead).toMatch(/leather|agarwood|oud|birch|incense|amber/);
  });

  it('never lists an atmospheric effect as a hero or secondary object', () => {
    for (const perfume of [ibraq, khamrah, ariz]) {
      const direction = buildRuleCreativeDirection({ perfume });
      const props = [...direction.heroElements, ...direction.secondaryElements];
      for (const prop of props) {
        expect(prop).not.toMatch(/\b(smoke|mist|haze|steam|dust)\b/i);
      }
    }
  });

  it('keeps the frame inside the element budget', () => {
    for (const perfume of [ibraq, khamrah, ariz]) {
      const direction = buildRuleCreativeDirection({ perfume });
      expect(direction.heroElements.length).toBeGreaterThanOrEqual(1);
      expect(direction.heroElements.length).toBeLessThanOrEqual(7);
      expect(direction.secondaryElements.length).toBeLessThanOrEqual(2);
      expect(direction.atmosphericEffects.length).toBeLessThanOrEqual(2);
    }
  });

  it('adds no symbolic element when the bottle has no motif', () => {
    const plain: BottleAnalysis = {
      shape: 'tall faceted flask',
      proportions: 'vertical',
      materials: ['smoky glass', 'gold'],
      dominantColors: ['grey', 'gold'],
      capDescription: 'gold sphere',
      bottleDescription: 'a faceted smoky glass flacon with a gold sphere cap',
      visualPersonality: 'formal',
      luxuryLevel: 'high',
      distinctiveElements: ['diamond facet pattern', 'polished gold sphere cap'],
    };
    const direction = buildRuleCreativeDirection({ perfume: ibraq, bottleAnalysis: plain });
    expect(direction.symbolicElement).toBeUndefined();
  });

  it('adds a motif only when the product actually carries one', () => {
    const serpent: BottleAnalysis = {
      shape: 'cylindrical bottle',
      proportions: 'vertical',
      materials: ['dark glass'],
      dominantColors: ['charcoal'],
      capDescription: 'matte black cap',
      bottleDescription: 'dark bottle',
      visualPersonality: 'dark, powerful',
      luxuryLevel: 'high',
      distinctiveElements: ['black serpent ornament coiled around the cap'],
    };
    const direction = buildRuleCreativeDirection({ perfume: ibraq, bottleAnalysis: serpent });
    expect(direction.symbolicElement).toBe('snake');
  });

  it('takes the palette from the bottle when colours were sampled', () => {
    const sampled = ['#F2ECE0', '#0B0B0D', '#C9A253', '#4A4750', '#8E7A55'];
    const direction = buildRuleCreativeDirection({ perfume: ibraq, bottlePalette: sampled });
    for (const colour of direction.colorPalette) {
      expect(sampled.map((c) => c.toUpperCase())).toContain(colour);
    }
    // Ordered dark to light, so the prompt reads ground through to highlight.
    expect(direction.colorPalette[0]).toBe('#0B0B0D');
  });

  it('ignores a sampled palette that is too small to be usable', () => {
    const direction = buildRuleCreativeDirection({ perfume: ibraq, bottlePalette: ['#FFFFFF'] });
    expect(direction.colorPalette.length).toBeGreaterThanOrEqual(3);
  });

  it('rejects malformed sampled colours rather than emitting them', () => {
    const direction = buildRuleCreativeDirection({
      perfume: ibraq,
      bottlePalette: ['charcoal', 'rgb(0,0,0)', '#12'],
    });
    expect(creativeDirectionSchema.safeParse(direction).success).toBe(true);
  });

  it('avoids a concept already in use', () => {
    const first = buildRuleCreativeDirection({ perfume: ibraq });
    const second = buildRuleCreativeDirection({
      perfume: ibraq,
      existingConcepts: [first.concept],
    });
    expect(second.concept).not.toBe(first.concept);
  });
});

describe('hashIdentity', () => {
  it('is stable for the same identity', () => {
    expect(hashIdentity(ibraq)).toBe(hashIdentity({ ...ibraq }));
  });

  it('differs for neighbouring names', () => {
    const a = hashIdentity(ibraq);
    const b = hashIdentity({ ...ibraq, name: 'Black Diamond Incense II' });
    expect(a).not.toBe(b);
  });

  it('ignores note changes, which are not identity', () => {
    expect(hashIdentity(ibraq)).toBe(hashIdentity({ ...ibraq, topNotes: [] }));
  });
});
