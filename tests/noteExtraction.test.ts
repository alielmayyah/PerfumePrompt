import { describe, expect, it } from 'vitest';

import {
  cleanNoteSlug,
  extractMeta,
  extractNotes,
  extractProseNotes,
  extractPyramidNotes,
  extractTaggedNotes,
  extractWeightedAccords,
  htmlToText,
} from '@/lib/utils/noteExtraction';

/**
 * Fixtures are trimmed from markup actually served by the pages these parsers target,
 * so a site-structure assumption that is wrong fails here rather than silently
 * producing an empty note list in production.
 */

const LINKED_PYRAMID = `
<h4><span>Top Notes</span></h4>
<pyramid-level-new notes="top"><div class="pyramid-level-container">
  <a href="https://example.com/notes/Black-Currant-132.html">Black Currant</a>
  <a href="https://example.com/notes/Sea-Water-224.html">Sea Water</a>
  <a href="https://example.com/notes/Birch-329.html">Birch</a>
</div></pyramid-level-new>
<h4><span>Middle Notes</span></h4>
<pyramid-level-new notes="middle"><div>
  <a href="https://example.com/notes/Incense-68.html">Incense</a>
  <a href="https://example.com/notes/Vanilla-3.html">Vanilla</a>
</div></pyramid-level-new>
<h4><span>Base Notes</span></h4>
<pyramid-level-new notes="base"><div>
  <a href="https://example.com/notes/Leather-156.html">Leather</a>
  <a href="https://example.com/notes/Agarwood-Oud--180.html">Agarwood (Oud)</a>
  <a href="https://example.com/notes/Smoke-201.html">Smoke</a>
</div></pyramid-level-new>
`;

const TAGGED_PYRAMID = `
<div class="pyramid_block nb_t">
  <div class="pyramid_title"><img alt="Top Notes" class="pyramid-icon"> Top Notes</div>
  <div><span class="clickable_note_img notefont5" data-nt="t" data-n_id="3274"><span class="nowrap pointer"><img src="https://media.example.com/a.png?width=50" alt="Aquatic notes" loading="lazy" class="np np5">Aquatic notes</span></span>
  <span class="clickable_note_img notefont1" data-nt="t" data-n_id="329"><span class="nowrap pointer"><img src="https://media.example.com/b.png" alt="Birch" loading="lazy" class="np np1">Birch</span></span></div>
</div>
<div class="pyramid_block nb_m">
  <div><span class="clickable_note_img" data-nt="m" data-n_id="3032"><span><img src="https://media.example.com/c.png" alt="Sandalwood" class="np">Sandalwood</span></span></div>
</div>
<div class="pyramid_block nb_b">
  <div><span class="clickable_note_img" data-nt="b" data-n_id="1537"><span><img src="https://media.example.com/d.png" alt="Oud" class="np">Oud</span></span></div>
</div>
`;

const PROSE = `
<article><p><span>Aromatic Notes:</span></p>
<p><span>Top Notes: Aquatic Notes, Birch, Black Currant</span></p>
<p><span>Heart Notes: Incense, Sandalwood, Vanilla</span></p>
<p><span>Base Notes: Amber, Leather, Smoke, Oud</span></p></article>
`;

describe('extractPyramidNotes', () => {
  it('reads a linked pyramid', () => {
    const notes = extractPyramidNotes(LINKED_PYRAMID);
    expect(notes.strategy).toBe('pyramid');
    expect(notes.topNotes).toEqual(['Black Currant', 'Sea Water', 'Birch']);
    expect(notes.heartNotes).toEqual(['Incense', 'Vanilla']);
    expect(notes.baseNotes).toEqual(['Leather', 'Agarwood (Oud)', 'Smoke']);
  });

  it('returns nothing rather than guessing when the structure is absent', () => {
    expect(extractPyramidNotes('<p>no pyramid here</p>').strategy).toBe('none');
  });
});

describe('cleanNoteSlug', () => {
  it('turns hyphens into spaces', () => {
    expect(cleanNoteSlug('Black-Currant')).toBe('Black Currant');
  });

  it('treats a trailing hyphen as a parenthetical', () => {
    expect(cleanNoteSlug('Agarwood-Oud-')).toBe('Agarwood (Oud)');
  });

  it('decodes percent-encoding', () => {
    expect(cleanNoteSlug('Cypriol-Oil-or-Nagarmotha')).toBe('Cypriol Oil or Nagarmotha');
  });

  it('survives invalid percent-encoding', () => {
    expect(cleanNoteSlug('Bad-%ZZ')).toContain('Bad');
  });
});

describe('extractTaggedNotes', () => {
  it('reads names from note image alt text, keyed by tier tag', () => {
    const notes = extractTaggedNotes(TAGGED_PYRAMID);
    expect(notes.strategy).toBe('pyramid');
    expect(notes.topNotes).toEqual(['Aquatic Notes', 'Birch']);
    expect(notes.heartNotes).toEqual(['Sandalwood']);
    expect(notes.baseNotes).toEqual(['Oud']);
  });

  it('does not pair a tier tag with a later note name', () => {
    // Only one tagged note exists, so the base tier must stay empty rather than
    // borrowing the top note's alt text.
    const single = '<span data-nt="t"><img alt="Bergamot"></span>';
    const notes = extractTaggedNotes(single);
    expect(notes.topNotes).toEqual(['Bergamot']);
    expect(notes.baseNotes).toEqual([]);
  });
});

describe('extractProseNotes', () => {
  it('reads a prose note list', () => {
    const notes = extractProseNotes(PROSE);
    expect(notes.strategy).toBe('prose');
    expect(notes.topNotes).toEqual(['Aquatic Notes', 'Birch', 'Black Currant']);
    expect(notes.heartNotes).toEqual(['Incense', 'Sandalwood', 'Vanilla']);
    expect(notes.baseNotes).toEqual(['Amber', 'Leather', 'Smoke', 'Oud']);
  });

  it('does not let a note list swallow the following sentence', () => {
    const html = '<p>Top Notes: Bergamot, Lemon. A luxurious opening that lingers all day.</p>';
    const notes = extractProseNotes(html);
    expect(notes.topNotes).toEqual(['Bergamot', 'Lemon']);
  });

  it('splits on "and" as well as commas', () => {
    const notes = extractProseNotes('<p>Base Notes: Amber and Musk</p>');
    expect(notes.baseNotes).toEqual(['Amber', 'Musk']);
  });

  it('returns none when there is no note list', () => {
    expect(extractProseNotes('<p>A beautiful fragrance.</p>').strategy).toBe('none');
  });
});

describe('extractNotes', () => {
  it('prefers a structured pyramid over prose on the same page', () => {
    const combined = `${PROSE}${LINKED_PYRAMID}`;
    const notes = extractNotes(combined);
    expect(notes.strategy).toBe('pyramid');
    // Sea Water is only present in the structured markup.
    expect(notes.topNotes).toContain('Sea Water');
  });

  it('falls back to prose when no structure exists', () => {
    expect(extractNotes(PROSE).strategy).toBe('prose');
  });
});

describe('extractWeightedAccords', () => {
  it('reads weights from an accord search query', () => {
    const html =
      '<a href="/accords-search/?smoky=100&amp;amber=54&amp;oud=45&amp;f_from_perfume_id=100548">x</a>';
    expect(extractWeightedAccords(html)).toEqual([
      { name: 'smoky', weight: 100 },
      { name: 'amber', weight: 54 },
      { name: 'oud', weight: 45 },
    ]);
  });

  it('drops the id parameters that ride along', () => {
    const html = '<a href="/accords-search/?f_from_perfume_id=1&woody=80">x</a>';
    const accords = extractWeightedAccords(html);
    expect(accords.map((a) => a.name)).toEqual(['woody']);
  });

  it('returns empty when no accord query is present', () => {
    expect(extractWeightedAccords('<p>nothing</p>')).toEqual([]);
  });
});

describe('extractMeta', () => {
  it('reads year and audience from the title', () => {
    const html =
      '<meta property="og:title" content="Black Diamond Incense Ibraq perfume - a fragrance for women and men 2023">';
    expect(extractMeta(html)).toEqual({ year: 2023, audience: 'unisex' });
  });

  it('distinguishes a single-audience fragrance', () => {
    const html = '<title>Something - a fragrance for women 2019</title>';
    expect(extractMeta(html)).toEqual({ year: 2019, audience: 'women' });
  });
});

describe('htmlToText', () => {
  it('keeps block boundaries so adjacent lists do not merge', () => {
    const text = htmlToText('<p>Top Notes: A</p><p>Base Notes: B</p>');
    expect(text).toContain('Top Notes: A');
    expect(text).toContain('Base Notes: B');
    expect(text).not.toContain('A Base');
  });

  it('strips scripts and styles', () => {
    expect(htmlToText('<script>var x=1</script><p>Hi</p>')).not.toContain('var x');
  });
});
