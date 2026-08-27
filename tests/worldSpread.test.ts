import { describe, expect, it } from 'vitest';

import { buildRuleCreativeDirection } from '@/services/creativeDirectorRules';
import type { PerfumeCreativeInput } from '@/lib/types';

/**
 * The headline requirement: different perfumes must get visibly different campaigns.
 * This runs the whole reference catalogue through the rule engine at once and asserts
 * the spread, which is the property most at risk of quietly regressing.
 */
const CATALOGUE: PerfumeCreativeInput[] = [
  {
    brand: 'Ibraq', name: 'Black Diamond Incense',
    topNotes: ['Black Currant', 'Aquatic Notes', 'Birch'],
    heartNotes: ['Incense', 'Vanilla', 'Sandalwood'],
    baseNotes: ['Leather', 'Oud', 'Smoke', 'Amber'],
  },
  {
    brand: 'Lattafa', name: 'Khamrah', variant: 'Qahwa',
    topNotes: ['Coffee', 'Cinnamon', 'Cardamom'],
    heartNotes: ['Dried Fruits', 'Praline', 'Tuberose'],
    baseNotes: ['Vanilla', 'Tonka Bean', 'Benzoin', 'Amber'],
  },
  {
    brand: 'Afnan', name: '9PM',
    topNotes: ['Apple', 'Cinnamon', 'Lavender'],
    heartNotes: ['Orange Blossom', 'Blue Lotus'],
    baseNotes: ['Tonka Bean', 'Vanilla', 'Amber', 'Patchouli'],
  },
  {
    brand: 'Lattafa', name: 'Ariz',
    topNotes: ['Bergamot', 'Saffron', 'Pink Pepper'],
    heartNotes: ['Rose', 'Jasmine', 'Orange Blossom'],
    baseNotes: ['Sandalwood', 'White Musk', 'Amber', 'Vanilla'],
  },
  {
    brand: 'Lattafa', name: 'Musamam', variant: 'Black Intense',
    topNotes: ['Lavender', 'Nutmeg', 'Bergamot', 'Sage'],
    heartNotes: ['Geranium', 'Cedarwood', 'Maple Wood'],
    baseNotes: ['Patchouli', 'Tonka Bean', 'Amber'],
  },
];

describe('catalogue spread', () => {
  const directions = CATALOGUE.map((perfume) =>
    buildRuleCreativeDirection({ perfume }),
  );

  it('gives the coffee fragrance a coffee world despite its amber base', () => {
    const qahwa = directions[1]!;
    expect(qahwa.environment.toLowerCase()).toMatch(/coffee|roast|majlis/);
    expect(qahwa.heroElements.join(' ').toLowerCase()).toMatch(/coffee|bean/);
  });

  it('keeps the coffee world when ranked accords are supplied too', () => {
    /*
     * The case above passes no accords, so the note votes carry the decision. Real
     * scraped data arrives with accords, and those took a different code path that
     * ignored world specificity: vanilla, sweet and warm spicy summed to 174 against
     * coffee's 100, so the live run directed Khamrah Qahwa as an amber interior while
     * this file still reported green.
     */
    const qahwa = buildRuleCreativeDirection({
      perfume: CATALOGUE[1]!,
      accords: [
        { name: 'coffee', weight: 100 },
        { name: 'vanilla', weight: 82 },
        { name: 'sweet', weight: 64 },
        { name: 'gourmand', weight: 46 },
        { name: 'warm spicy', weight: 28 },
      ],
    });
    expect(qahwa.environment.toLowerCase()).toMatch(/coffee|roast|majlis/);
  });

  it('does not put a floral fragrance in a dark smoky room', () => {
    const ariz = directions[3]!;
    expect(ariz.environment.toLowerCase()).toMatch(/marble|garden|silk/);
  });

  it('produces distinct concepts across the catalogue', () => {
    const concepts = directions.map((d) => d.concept);
    expect(new Set(concepts).size).toBe(concepts.length);
  });

  it('produces distinct environments across the catalogue', () => {
    const environments = directions.map((d) => d.environment);
    // Five perfumes, at least four distinct scenes.
    expect(new Set(environments).size).toBeGreaterThanOrEqual(4);
  });

  it('never invents a symbolic element without a bottle motif', () => {
    for (const direction of directions) {
      expect(direction.symbolicElement).toBeUndefined();
    }
  });

  it('keeps every hero list within the frame budget', () => {
    for (const direction of directions) {
      expect(direction.heroElements.length).toBeGreaterThanOrEqual(1);
      expect(direction.heroElements.length).toBeLessThanOrEqual(7);
    }
  });
});
