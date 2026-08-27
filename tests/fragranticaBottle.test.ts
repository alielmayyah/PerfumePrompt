import { describe, expect, it } from 'vitest';

import { fragranticaBottleUrl } from '@/services/referenceImageService';

/**
 * Fragrantica pages publish only social cards, so the bottle is addressed by the numeric
 * perfume id in the page URL instead of being ranked out of the markup. That makes the
 * bottle correct by construction, which is worth pinning down: the bug it replaces was a
 * Lattafa row wearing a "Classic Stone" bottle from an entirely different house.
 */
describe('fragranticaBottleUrl', () => {
  it('derives the CDN bottle from a perfume page URL', () => {
    expect(
      fragranticaBottleUrl(
        'https://www.fragrantica.com/perfume/Lattafa-Perfumes/Teriaq-Intense-99586.html',
      ),
    ).toBe('https://fimgs.net/mdimg/perfume/375x500.99586.jpg');
  });

  it('reads the id regardless of how many hyphens the name has', () => {
    expect(
      fragranticaBottleUrl(
        'https://www.fragrantica.com/perfume/Giorgio-Armani/Emporio-Armani-Stronger-With-You-Absolutely-64501.html',
      ),
    ).toBe('https://fimgs.net/mdimg/perfume/375x500.64501.jpg');
  });

  it('accepts the country domains', () => {
    expect(
      fragranticaBottleUrl('https://www.fragrantica.it/perfume/Versace/Eros-16657.html'),
    ).toBe('https://fimgs.net/mdimg/perfume/375x500.16657.jpg');
  });

  it('ignores pages that are not perfume pages', () => {
    expect(
      fragranticaBottleUrl('https://www.fragrantica.com/designers/Lattafa-Perfumes.html'),
    ).toBeUndefined();
    expect(
      fragranticaBottleUrl('https://www.fragrantica.com/board/viewtopic.php?id=342620'),
    ).toBeUndefined();
  });

  it('ignores other hosts, including lookalikes', () => {
    expect(fragranticaBottleUrl('https://www.parfumo.com/Perfumes/Lattafa/teriaq-12345.html'))
      .toBeUndefined();
    // A hostname that merely contains the word must not be treated as Fragrantica.
    expect(fragranticaBottleUrl('https://notfragrantica.example.com/perfume/x-123.html'))
      .toBeUndefined();
  });

  it('does not throw on a malformed URL', () => {
    expect(fragranticaBottleUrl('not a url')).toBeUndefined();
  });
});
