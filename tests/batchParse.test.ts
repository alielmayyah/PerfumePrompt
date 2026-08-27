import { describe, expect, it } from 'vitest';

import { parseEntries } from '@/components/prompt/BatchPrepare';

/**
 * A perfume list arrives from wherever it arrives: pasted JSON from an API response, or
 * lines copied out of a spreadsheet. Both are accepted, because rejecting one just means
 * the user reformats by hand.
 */

const JSON_LIST = `[
  { "brand": "Assaf", "name": "Black Strike" },
  { "brand": "Ibraq", "name": "Black Diamond Incense" },
  { "brand": "Emporio Armani", "name": "Stronger With You Absolutely" }
]`;

describe('parseEntries', () => {
  it('reads a JSON array of brand and name', () => {
    const entries = parseEntries(JSON_LIST);
    expect(entries).toHaveLength(3);
    expect(entries[0]).toEqual({ brand: 'Assaf', name: 'Black Strike' });
    expect(entries[2]?.name).toBe('Stronger With You Absolutely');
  });

  it('keeps a variant when one is given', () => {
    const entries = parseEntries('[{"brand":"Lattafa","name":"Musamam","variant":"Black Intense"}]');
    expect(entries[0]).toEqual({ brand: 'Lattafa', name: 'Musamam', variant: 'Black Intense' });
  });

  it('accepts a single JSON object as well as an array', () => {
    expect(parseEntries('{"brand":"Versace","name":"Eros"}')).toEqual([
      { brand: 'Versace', name: 'Eros' },
    ]);
  });

  it('skips JSON entries missing a brand or a name', () => {
    const entries = parseEntries('[{"brand":"Afnan"},{"brand":"Afnan","name":"9 PM"},{"name":"x"}]');
    expect(entries).toEqual([{ brand: 'Afnan', name: '9 PM' }]);
  });

  it('reads plain lines separated by a comma', () => {
    const entries = parseEntries('Rasasi, Hawas Elixir\nZimaya, Mazaaj Rhythm');
    expect(entries).toEqual([
      { brand: 'Rasasi', name: 'Hawas Elixir' },
      { brand: 'Zimaya', name: 'Mazaaj Rhythm' },
    ]);
  });

  it('accepts a pipe or a spaced dash as the separator', () => {
    expect(parseEntries('Versace | Dylan Blue')).toEqual([
      { brand: 'Versace', name: 'Dylan Blue' },
    ]);
    expect(parseEntries('Lattafa - Opulent Dubai')).toEqual([
      { brand: 'Lattafa', name: 'Opulent Dubai' },
    ]);
  });

  it('does not split a hyphenated name', () => {
    // The dash separator requires surrounding spaces, so a hyphen inside a name is safe.
    expect(parseEntries('Maison, Rose-Oud')).toEqual([{ brand: 'Maison', name: 'Rose-Oud' }]);
  });

  it('keeps multi-word names intact on a plain line', () => {
    expect(parseEntries('Afnan, 9 PM Night Out')).toEqual([
      { brand: 'Afnan', name: '9 PM Night Out' },
    ]);
  });

  it('ignores blank lines and comments', () => {
    const entries = parseEntries('# my list\n\nVersace, Eros\n\n');
    expect(entries).toEqual([{ brand: 'Versace', name: 'Eros' }]);
  });

  it('returns nothing for empty input', () => {
    expect(parseEntries('   ')).toEqual([]);
  });

  it('throws on malformed JSON rather than silently returning nothing', () => {
    // A truncated paste should be reported, not treated as an empty list.
    expect(() => parseEntries('[{"brand":"Assaf",')).toThrow();
  });
});
