import { describe, expect, it } from 'vitest';

import { normaliseImageUrl } from '@/lib/utils/html';
import { referenceScore, type ProductIdentity } from '@/services/referenceImageService';
import type { ReferenceCandidate } from '@/lib/types';

/**
 * Built from the exact candidate pool that produced a wrong pick: for Ibraq Black
 * Diamond Incense the app accepted `bg-desk.png`, a 2400x2035 theme background, purely
 * because it was the largest image on the page. The real product shots were a 1000x1000
 * and a 655x684 whose filenames named the perfume outright.
 *
 * These are the actual URLs, so a scoring change that regresses this case fails here.
 */

const IBRAQ: ProductIdentity = { brand: 'Ibraq', name: 'Black Diamond Incense' };

function candidate(
  sourceUrl: string,
  width: number,
  height: number,
  alt?: string,
): ReferenceCandidate {
  return {
    id: sourceUrl,
    storagePath: 'perfumes/x/references/y.jpg',
    url: '/api/files/perfumes/x/references/y.jpg',
    sourceUrl,
    pageUrl: 'https://example.com/product',
    mimeType: 'image/jpeg',
    byteLength: 1000,
    width,
    height,
    ...(alt ? { alt } : {}),
    usable: true,
  };
}

const THEME_BACKGROUND = candidate(
  'https://www.velvetoud.com/cdn/shop/files/bg-desk.png?v=1759265520&width=2400',
  2400,
  2035,
);

const AI_FILLER = candidate(
  'https://www.velvetoud.com/cdn/shop/files/magnific_create-a-luxury-perfume-a_2962847978.png?width=1024',
  1024,
  1024,
);

const NAMED_PRODUCT_SHOT = candidate(
  'https://www.parfumerie-de-dubai.com/wp-content/uploads/2026/05/parfum-black-diamond-incense-ibraq.jpg',
  1000,
  1000,
);

const CONCATENATED_NAME = candidate(
  'https://www.rehmafragrance.com/cdn/shop/files/BlackDiamondIncense.png?v=1778332428',
  655,
  684,
);

const OPAQUE_HASH = candidate(
  'https://www.perfumepeaks.com/cdn/shop/files/3af7abbe-d05b-44bf-8101-7d2bf745b483-1000x1000.webp',
  1000,
  1000,
);

describe('referenceScore', () => {
  it('ranks a named product shot above a larger theme background', () => {
    expect(referenceScore(NAMED_PRODUCT_SHOT, IBRAQ)).toBeGreaterThan(
      referenceScore(THEME_BACKGROUND, IBRAQ),
    );
  });

  it('ranks a small named shot above a larger unnamed one', () => {
    // 655x684 with the product name beats 1024x1024 without it.
    expect(referenceScore(CONCATENATED_NAME, IBRAQ)).toBeGreaterThan(
      referenceScore(AI_FILLER, IBRAQ),
    );
  });

  it('matches a name that has no separators in the filename', () => {
    // BlackDiamondIncense.png must register as naming the product.
    expect(referenceScore(CONCATENATED_NAME, IBRAQ)).toBeGreaterThan(
      referenceScore(OPAQUE_HASH, IBRAQ),
    );
  });

  it('picks the named product shot out of the whole real pool', () => {
    const pool = [THEME_BACKGROUND, AI_FILLER, NAMED_PRODUCT_SHOT, CONCATENATED_NAME, OPAQUE_HASH];
    const best = [...pool].sort((a, b) => referenceScore(b, IBRAQ) - referenceScore(a, IBRAQ))[0];
    expect(best?.sourceUrl).toBe(NAMED_PRODUCT_SHOT.sourceUrl);
  });

  it('demotes lifestyle photography even at high resolution', () => {
    const model = candidate(
      'https://example.com/media/campaign-model-portrait.jpg',
      3000,
      3000,
      'Woman wearing the fragrance',
    );
    expect(referenceScore(model, IBRAQ)).toBeLessThan(referenceScore(CONCATENATED_NAME, IBRAQ));
  });

  it('uses alt text when the filename is an opaque hash', () => {
    const withAlt = candidate(
      'https://cdn.example.com/files/9f8a7b6c5d4e.webp',
      900,
      900,
      'Ibraq Black Diamond Incense perfume bottle',
    );
    expect(referenceScore(withAlt, IBRAQ)).toBeGreaterThan(referenceScore(OPAQUE_HASH, IBRAQ));
  });

  it('still prefers the larger of two equally relevant images', () => {
    const small = candidate('https://x.com/black-diamond-incense-ibraq.jpg', 600, 600);
    const large = candidate('https://x.com/black-diamond-incense-ibraq-hd.jpg', 1600, 1600);
    expect(referenceScore(large, IBRAQ)).toBeGreaterThan(referenceScore(small, IBRAQ));
  });

  it('penalises a wide social card', () => {
    const card = candidate('https://x.com/black-diamond-incense-ibraq-og.jpg', 1200, 630);
    const square = candidate('https://x.com/black-diamond-incense-ibraq.jpg', 800, 800);
    expect(referenceScore(square, IBRAQ)).toBeGreaterThan(referenceScore(card, IBRAQ));
  });

  it('scores an image with unknown dimensions as unusable', () => {
    const unknown = candidate('https://x.com/black-diamond-incense.jpg', 0, 0);
    expect(referenceScore(unknown, IBRAQ)).toBe(0);
  });

  it('falls back to size and shape when no identity is supplied', () => {
    expect(referenceScore(NAMED_PRODUCT_SHOT)).toBeGreaterThan(0);
  });
});

describe('normaliseImageUrl', () => {
  it('collapses the rendition variants of one asset', () => {
    const variants = [
      'https://www.rehmafragrance.com/cdn/shop/files/BlackDiamondIncense.png?v=1778332428',
      'http://www.rehmafragrance.com/cdn/shop/files/BlackDiamondIncense.png?v=1778332428',
      'https://www.rehmafragrance.com//cdn//shop//files//BlackDiamondIncense.png?v=1778332428&width=1920',
      'https://rehmafragrance.com/cdn/shop/files/BlackDiamondIncense.png?width=3840',
    ];
    const keys = new Set(variants.map(normaliseImageUrl));
    expect(keys.size).toBe(1);
  });

  it('keeps genuinely different assets apart', () => {
    const a = normaliseImageUrl('https://x.com/files/bottle-front.png?width=800');
    const b = normaliseImageUrl('https://x.com/files/bottle-back.png?width=800');
    expect(a).not.toBe(b);
  });

  it('returns the input unchanged when it is not a URL', () => {
    expect(normaliseImageUrl('not a url')).toBe('not a url');
  });
});

describe('visual evidence', () => {
  const withVisual = (base: ReferenceCandidate, visualScore: number): ReferenceCandidate => ({
    ...base,
    visualScore,
  });

  it('lets a measured product shot beat a larger render', () => {
    // The real case: an AI render in the retailer gallery, 1024x1024 and carrying the
    // product's alt text, against Fragrantica's 2241x2241 shot on white whose filename
    // is an opaque id.
    const render = withVisual(
      candidate(
        'https://shop.example/files/magnific_create-a-luxury-perfume-a_2962847978.png',
        1024,
        1024,
        'Black Diamond Incense',
      ),
      0.64,
    );
    const studio = withVisual(candidate('https://cdn.example/o.100548.jpg', 2241, 2241), 1.0);

    expect(referenceScore(studio, IBRAQ)).toBeGreaterThan(referenceScore(render, IBRAQ));
  });

  it('separates high from middling confidence decisively, not marginally', () => {
    const base = candidate('https://x.com/black-diamond-incense.jpg', 1000, 1000);
    const confident = referenceScore(withVisual(base, 1.0), IBRAQ);
    const middling = referenceScore(withVisual(base, 0.64), IBRAQ);

    // A linear weighting left these within a few percent, which decided picks by luck.
    expect(confident / middling).toBeGreaterThan(1.8);
  });

  it('demotes a busy scene even when the filename names the product', () => {
    const named = candidate('https://x.com/black-diamond-incense-ibraq.jpg', 1400, 1400);
    const busy = referenceScore(withVisual(named, 0.1), IBRAQ);
    const clean = referenceScore(withVisual(named, 0.95), IBRAQ);
    expect(clean).toBeGreaterThan(busy * 4);
  });

  it('leaves unmeasured candidates on their metadata ranking', () => {
    const unmeasured = candidate('https://x.com/black-diamond-incense-ibraq.jpg', 1000, 1000);
    expect(referenceScore(unmeasured, IBRAQ)).toBeGreaterThan(0);
    expect(unmeasured.visualScore).toBeUndefined();
  });
});

describe('alt text versus filename', () => {
  it('trusts a filename more than gallery-wide alt text', () => {
    // Retailers apply one alt to a whole gallery, so alt alone must not make a
    // lifestyle image look as relevant as the product shot.
    const altOnly = candidate(
      'https://shop.example/files/9f8a7b6c.png',
      1200,
      1200,
      'Ibraq Black Diamond Incense',
    );
    const namedFile = candidate(
      'https://shop.example/files/ibraq-black-diamond-incense.png',
      1200,
      1200,
    );
    expect(referenceScore(namedFile, IBRAQ)).toBeGreaterThan(referenceScore(altOnly, IBRAQ));
  });
});
