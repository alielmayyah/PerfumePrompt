/**
 * Controlled creative vocabulary (brief section 13).
 *
 * These lists are handed to the Creative Director as *guidance*, not as a closed
 * enum: the model may pick from them or propose a sensible variation. Their job is
 * to keep generations coherent and premium rather than chaotic, and to give the
 * uniqueness check a shared frame of reference.
 */

export const ENVIRONMENTS = [
  'dark forest',
  'luxury marble room',
  'Arabian palace',
  'coffee lounge',
  'desert night',
  'rainy city',
  'luxury hotel',
  'royal garden',
  'ancient library',
  'dark volcanic landscape',
  'smoky lounge',
  'coastal environment',
  'silk atelier',
  'orchard at dawn',
  'spice market at dusk',
  'moonlit courtyard',
] as const;

export const LIGHTING = [
  'moonlight',
  'golden hour',
  'candlelight',
  'warm amber',
  'cold rim light',
  'dramatic spotlight',
  'soft diffused light',
  'sunset',
  'neon night',
  'shafts of window light',
] as const;

export const MATERIALS = [
  'black stone',
  'marble',
  'walnut',
  'sandstone',
  'wet slate',
  'gold metal',
  'glass',
  'velvet',
  'dark wood',
  'brushed brass',
  'raw silk',
  'travertine',
] as const;

export const ATMOSPHERE = [
  'smoke',
  'mist',
  'steam',
  'dust',
  'embers',
  'rain droplets',
  'floating petals',
  'light rays',
  'fine spice powder',
  'drifting pollen',
] as const;

export const SYMBOLIC_ELEMENTS = [
  'snake',
  'panther',
  'wolf',
  'falcon',
  'butterfly',
  'scorpion',
  'horse',
  'peacock',
  'lion',
  'none',
] as const;

export const CAMERA_ANGLES = [
  'straight-on editorial angle',
  'slightly low luxury editorial angle',
  'slight three-quarter hero angle',
  'eye-level macro product angle',
  'subtle top-down still-life angle',
] as const;

/**
 * Note-to-visual translation hints (brief section 11).
 *
 * Deliberately a *mapping of ideas*, not a rendering rule: the Creative Director
 * decides which notes are visually meaningful and ignores the rest. Keys are
 * matched as substrings against note names, lower-cased.
 */
export const NOTE_VISUAL_HINTS: Readonly<Record<string, string>> = {
  coffee: 'roasted coffee beans, a small Arabic coffee cup, curling steam',
  qahwa: 'Arabic coffee pot, roasted beans, cardamom pods',
  espresso: 'dark roasted beans, crema, warm steam',
  cinnamon: 'cinnamon sticks and fine cinnamon dust',
  cardamom: 'green cardamom pods',
  saffron: 'saffron threads on stone',
  nutmeg: 'cracked nutmeg and its shell',
  pepper: 'scattered peppercorns',
  clove: 'whole cloves',
  ginger: 'fresh ginger root slices',
  lavender: 'lavender sprigs and loose buds',
  rose: 'rose petals, a single bloom',
  jasmine: 'jasmine blossoms',
  geranium: 'geranium leaves and small blooms',
  violet: 'violet petals',
  iris: 'iris root and pale petals',
  tuberose: 'creamy white tuberose blooms',
  ylang: 'ylang-ylang petals',
  orange: 'sliced orange, curled zest',
  bergamot: 'halved bergamot, glossy peel',
  lemon: 'sliced lemon, zest curls',
  citrus: 'sliced citrus and bright zest',
  grapefruit: 'halved pink grapefruit',
  apple: 'a sliced apple',
  peach: 'a halved peach',
  pineapple: 'pineapple wedge',
  berry: 'dark berries',
  plum: 'split plum',
  fig: 'halved fig and fig leaf',
  date: 'glossy dates on a brass dish',
  vanilla: 'split vanilla pods',
  tonka: 'tonka beans',
  caramel: 'amber caramel pour',
  honey: 'honeycomb and slow-dripping honey',
  chocolate: 'broken dark chocolate',
  praline: 'caramelised nuts',
  almond: 'cracked almonds',
  coconut: 'split coconut',
  amber: 'glowing amber resin chunks',
  benzoin: 'warm resin fragments',
  labdanum: 'dark sticky resin',
  incense: 'smouldering incense and thin smoke',
  frankincense: 'frankincense resin tears',
  myrrh: 'myrrh resin',
  oud: 'dark agarwood pieces and drifting smoke',
  agarwood: 'dense dark wood shards',
  sandalwood: 'pale sandalwood blocks and shavings',
  cedar: 'split cedar wood and shavings',
  cedarwood: 'split cedar wood and shavings',
  vetiver: 'vetiver roots',
  patchouli: 'dried patchouli leaves',
  moss: 'damp moss on stone',
  leather: 'aged leather hide texture',
  suede: 'soft suede folds',
  tobacco: 'cured tobacco leaves',
  musk: 'soft white fabric folds',
  ambergris: 'pale mineral stones',
  sage: 'sage leaves',
  mint: 'fresh mint sprigs',
  basil: 'basil leaves',
  lily: 'white lily blooms',
  maple: 'dark maple wood grain',
  birch: 'pale birch bark',
  juniper: 'juniper berries and needles',
  sea: 'wet stones and sea spray',
  marine: 'wet stones and sea spray',
  aquatic: 'water surface and droplets',
  salt: 'coarse salt crystals',
  smoke: 'thin drifting smoke',
  wood: 'split raw wood',
  spice: 'assorted whole spices',
  floral: 'fresh cut blooms',
  fruity: 'sliced ripe fruit',
  powdery: 'fine soft powder haze',
};

/** Returns visual hints for whichever notes we recognise, capped for prompt hygiene. */
export function visualHintsForNotes(notes: readonly string[], limit = 10): string[] {
  const hints: string[] = [];
  const used = new Set<string>();
  for (const note of notes) {
    const key = note.toLowerCase();
    for (const [needle, hint] of Object.entries(NOTE_VISUAL_HINTS)) {
      if (!key.includes(needle) || used.has(hint)) continue;
      used.add(hint);
      hints.push(`${note}: ${hint}`);
      break;
    }
    if (hints.length >= limit) break;
  }
  return hints;
}

export const VOCABULARY = {
  environments: ENVIRONMENTS,
  lighting: LIGHTING,
  materials: MATERIALS,
  atmosphere: ATMOSPHERE,
  symbolicElements: SYMBOLIC_ELEMENTS,
  cameraAngles: CAMERA_ANGLES,
} as const;

export function formatVocabulary(): string {
  return [
    `Environments: ${ENVIRONMENTS.join(', ')}`,
    `Lighting: ${LIGHTING.join(', ')}`,
    `Surfaces and materials: ${MATERIALS.join(', ')}`,
    `Atmospheric effects: ${ATMOSPHERE.join(', ')}`,
    `Symbolic elements: ${SYMBOLIC_ELEMENTS.join(', ')}`,
    `Camera angles: ${CAMERA_ANGLES.join(', ')}`,
  ].join('\n');
}
