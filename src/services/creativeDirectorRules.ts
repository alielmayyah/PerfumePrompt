import { HERO_ELEMENT_RANGE } from '@/lib/config/constants';
import type { BottleAnalysis, CreativeDirection, PerfumeCreativeInput } from '@/lib/types';
import type { WeightedAccord } from '@/lib/utils/noteExtraction';
import { visualHintsForNotes } from './ai/vocabulary';

/**
 * Rule-based creative director.
 *
 * Produces a full `CreativeDirection` from scraped data alone: no model call, no API
 * key, no quota, and deterministic for a given perfume. It exists because image
 * generation is the only stage that genuinely needs a paid plan, and it is wasteful to
 * let a missing text quota also block getting a campaign specified.
 *
 * It follows the same reasoning order the prompt asks a model to follow:
 *
 *   1. the dominant accord decides which world the perfume belongs to;
 *   2. the bottle's own colours set the palette and the light temperature;
 *   3. the notes populate the scene with objects;
 *   4. a hash of the perfume's identity picks between equally valid variants, so two
 *      smoky fragrances do not receive a byte-identical scene.
 *
 * The output is a starting point, not a verdict. It is written to the same editable
 * field the model writes to, so it can be refined by hand or replaced by a model run.
 */

export interface RuleDirectionInput {
  perfume: PerfumeCreativeInput;
  accords?: WeightedAccord[];
  bottleAnalysis?: BottleAnalysis;
  /** Dominant colours sampled from the bottle photograph, as #RRGGBB. */
  bottlePalette?: string[];
  /** Concepts already in use, so the result differs from them. */
  existingConcepts?: string[];
}

/* ------------------------------------------------------------------- worlds */

interface World {
  key: string;
  /** Accord names that select this world, strongest first. */
  accords: string[];
  /** Note keywords that also select it, when accords are unavailable. */
  noteHints: string[];
  concepts: string[];
  environments: string[];
  surfaces: string[];
  lighting: string[];
  atmosphere: string[];
  /** Palette used when the bottle offers no usable colours. */
  fallbackPalette: string[];
  mood: string;
  /**
   * How much a note in this world says about the fragrance.
   *
   * A coffee or marine note is highly diagnostic; amber and woody notes appear almost
   * everywhere, so matching them should not outweigh a distinctive signal.
   */
  specificity: number;
}

/**
 * The controlled worlds a perfume can land in.
 *
 * Each carries several interchangeable variants so the hash has something to choose
 * between. They are intentionally distinct from one another: the failure mode this
 * whole file guards against is every dark perfume becoming the same dark scene.
 */
const WORLDS: World[] = [
  {
    key: 'smoke',
    accords: ['smoky', 'oud', 'incense', 'tobacco', 'leather'],
    noteHints: ['oud', 'incense', 'smoke', 'agarwood', 'frankincense', 'leather', 'birch'],
    concepts: ['Faceted Smoke', 'Slow Burn', 'Resin and Stone', 'The Quiet Ember'],
    environments: [
      'a dark polished stone gallery with a single high slit window',
      'a shuttered room where light enters in one narrow band',
      'a vaulted stone chamber, empty except for the product',
    ],
    surfaces: [
      'honed dark grey stone with a faint cold sheen',
      'a black basalt slab, matte and slightly dusty',
      'aged dark walnut, oiled and low in sheen',
    ],
    lighting: [
      'one hard cold slit of light from high on the left, with a warm ember glow rising from below',
      'a single raking light across the surface, everything behind falling to black',
      'cold directional light met by a low warm glow at the base',
    ],
    atmosphere: ['thin drifting smoke', 'fine dust suspended in the light', 'low warm haze'],
    fallbackPalette: ['#0A0A0C', '#1C1B1F', '#4A4750', '#6E5A3A', '#C9A253', '#E8DCC6'],
    mood: 'formal, precious, smouldering',
    specificity: 2,
  },
  {
    key: 'coffee',
    accords: ['coffee', 'cacao', 'caramel', 'praline', 'chocolate'],
    noteHints: ['coffee', 'qahwa', 'espresso', 'cacao', 'chocolate', 'praline', 'caramel'],
    concepts: ['Midnight Qahwa', 'The Roasting Hour', 'Cardamom and Crema'],
    environments: [
      'a dark Arabian coffee lounge after service',
      'a low-lit roastery back room',
      'a private majlis with the lamps turned down',
    ],
    surfaces: [
      'rich dark walnut, worn smooth',
      'a brass tray on unpolished stone',
      'deep-toned tadelakt plaster',
    ],
    lighting: [
      'warm amber candlelight with a subtle rim light on the glass',
      'a single low lamp, everything falling into brown shadow',
      'late warm light through a lattice screen',
    ],
    atmosphere: ['curling steam', 'fine spice dust', 'warm haze'],
    fallbackPalette: ['#140C07', '#331C10', '#6B3E1D', '#A6702F', '#C99142', '#E6D4B8'],
    mood: 'warm, seductive, sophisticated',
    specificity: 3,
  },
  {
    key: 'marine',
    accords: ['marine', 'aquatic', 'salty', 'ozonic', 'fresh'],
    noteHints: ['sea', 'marine', 'aquatic', 'salt', 'water', 'seaweed', 'algae'],
    concepts: ['Cold Tide', 'Wet Stone', 'After the Rain'],
    environments: [
      'a wet stone terrace at first light',
      'a shallow black reflecting pool in a bare courtyard',
      'a rain-slicked coastal ledge',
    ],
    surfaces: [
      'wet slate holding a thin film of water',
      'sea-washed granite, still damp',
      'polished stone with a clean mirror reflection',
    ],
    lighting: [
      'cool overcast light with a hard specular edge on the glass',
      'pale blue pre-dawn light, low and even',
      'bright cold light raking across a wet surface',
    ],
    atmosphere: ['fine sea mist', 'scattered water droplets', 'cool haze'],
    fallbackPalette: ['#07090C', '#152029', '#39525E', '#7C99A6', '#B9CBD4', '#EDF2F4'],
    mood: 'cold, clean, expansive',
    specificity: 3,
  },
  {
    key: 'floral',
    accords: ['floral', 'rose', 'white floral', 'powdery', 'iris', 'violet'],
    noteHints: ['rose', 'jasmine', 'tuberose', 'iris', 'violet', 'peony', 'lily', 'orange blossom'],
    concepts: ['Ivory Bloom', 'The Silk Room', 'Petal and Marble'],
    environments: [
      'a pale marble room with sheer curtains lifting',
      'a walled garden in the last hour of light',
      'a silk atelier with cloth draped over stone',
    ],
    surfaces: [
      'cream travertine, softly veined',
      'pale marble with a satin finish',
      'raw ivory silk laid over stone',
    ],
    lighting: [
      'soft diffused daylight from a large window, shadows kept open',
      'warm late sun through fabric',
      'even bright light with the faintest golden cast',
    ],
    atmosphere: ['drifting petals', 'a soft powder haze', 'gentle floating pollen'],
    fallbackPalette: ['#F4EFE6', '#E3D6C3', '#C9AE8A', '#A8865C', '#6E5638', '#2C231A'],
    mood: 'elegant, soft, luminous',
    specificity: 3,
  },
  {
    key: 'woody',
    accords: ['woody', 'sandalwood', 'cedar', 'vetiver', 'earthy', 'mossy'],
    noteHints: ['cedar', 'sandalwood', 'vetiver', 'patchouli', 'moss', 'pine', 'juniper', 'birch'],
    concepts: ['Timber and Dust', 'The Standing Grove', 'Cut Cedar'],
    environments: [
      'a dim timber workshop at the end of the day',
      'a stand of dark trees with light breaking between trunks',
      'a bare wooden room with one shuttered window',
    ],
    surfaces: ['split raw cedar, pale at the cut', 'oiled dark wood grain', 'weathered sandstone'],
    lighting: [
      'shafts of light between trunks, cool in the shadow and warm where it lands',
      'a single warm lamp raking across grain',
      'low sun through a shutter, hard-edged',
    ],
    atmosphere: ['fine wood dust in the light', 'thin mist between trunks', 'drifting sawdust'],
    fallbackPalette: ['#0D0C0A', '#231C14', '#4E3D28', '#7E6440', '#B79A6A', '#E2D6C0'],
    mood: 'grounded, dry, composed',
    specificity: 1.2,
  },
  {
    key: 'amber',
    accords: ['amber', 'vanilla', 'sweet', 'balsamic', 'warm spicy', 'powdery'],
    noteHints: ['amber', 'vanilla', 'tonka', 'benzoin', 'labdanum', 'honey', 'myrrh'],
    concepts: ['Amber Interior', 'The Warm Dark', 'Resin Light'],
    environments: [
      'a warm panelled interior with the lamps low',
      'a dim room where every surface holds a golden reflection',
      'a heavy-curtained study after dark',
    ],
    surfaces: ['dark lacquer holding a warm reflection', 'aged brass on stone', 'deep red-brown wood'],
    lighting: [
      'warm amber light from a low source, falling off quickly into shadow',
      'candlelight close to the glass, soft-edged',
      'golden light through resin, glowing from within',
    ],
    atmosphere: ['warm haze', 'slow-drifting smoke', 'suspended golden dust'],
    fallbackPalette: ['#0F0A06', '#2A1B0F', '#5E3A1B', '#9A6529', '#D09A45', '#F0DEC0'],
    mood: 'warm, enveloping, sensual',
    specificity: 1,
  },
  {
    key: 'spicy',
    accords: ['warm spicy', 'fresh spicy', 'cinnamon', 'saffron', 'aromatic'],
    noteHints: ['cinnamon', 'cardamom', 'saffron', 'pepper', 'clove', 'nutmeg', 'ginger'],
    concepts: ['Spice and Shadow', 'The Dusk Market', 'Saffron Dark'],
    environments: [
      'a spice merchant stall at dusk, lamps just lit',
      'a dim stone alcove lined with open vessels',
      'a shaded courtyard with spices laid on cloth',
    ],
    surfaces: ['unglazed terracotta', 'rough sandstone dusted with spice', 'dark wood on woven cloth'],
    lighting: [
      'warm low lamplight with deep falloff',
      'last daylight through a high opening, dust visible',
      'a hard warm beam across a dusty surface',
    ],
    atmosphere: ['fine spice powder in the air', 'warm dust', 'thin smoke'],
    fallbackPalette: ['#120B08', '#33190F', '#7A3B1B', '#B36A28', '#D9A24A', '#EFDCC0'],
    mood: 'rich, warm, animated',
    specificity: 2,
  },
  {
    key: 'citrus',
    accords: ['citrus', 'fruity', 'green', 'aromatic', 'fresh'],
    noteHints: ['bergamot', 'lemon', 'orange', 'grapefruit', 'mandarin', 'lime', 'apple', 'currant'],
    concepts: ['First Light Citrus', 'Cold Marble, Bright Peel', 'Green and Clean'],
    environments: [
      'a bright stone terrace early in the day',
      'a pale minimal room with hard morning light',
      'a shaded orchard edge with sun breaking through',
    ],
    surfaces: ['cool white marble', 'pale limestone, dry and matte', 'bleached wood'],
    lighting: [
      'crisp directional morning light with clean shadows',
      'bright even daylight, high key',
      'hard sun through leaves, dappled',
    ],
    atmosphere: ['light citrus mist', 'fine bright haze', 'drifting zest'],
    fallbackPalette: ['#F2F0E9', '#DCE0D2', '#A8B98C', '#7A8C4E', '#C8A63C', '#2E3120'],
    mood: 'bright, clean, immediate',
    specificity: 2.2,
  },
];

const DEFAULT_WORLD = WORLDS[0]!;

/**
 * Accords too common to point at any one world.
 *
 * These appear in listings across the whole spectrum, so they carry almost no
 * information about where a fragrance should be photographed. They still count toward a
 * world's score, just without the specificity multiplier that a diagnostic accord earns.
 */
const GENERIC_ACCORDS = new Set(['aromatic', 'fresh', 'sweet', 'powdery']);

/* ------------------------------------------------------------------- public */

export function buildRuleCreativeDirection(input: RuleDirectionInput): CreativeDirection {
  const { perfume } = input;
  const allNotes = [...perfume.topNotes, ...perfume.heartNotes, ...perfume.baseNotes];

  const world = selectWorld(input.accords ?? [], allNotes, perfume.fragranceFamily);
  const seed = hashIdentity(perfume);

  // Rotate variant choice by the identity hash and by any clash with existing
  // concepts, so a second perfume in the same world still reads differently.
  const clashOffset = countClashes(world.concepts, input.existingConcepts ?? []);
  const pick = <T>(list: readonly T[], salt: number): T =>
    list[(seed + salt + clashOffset) % list.length]!;

  const palette = derivePalette(input.bottlePalette, world);
  const temperature = paletteTemperature(palette);

  const heroElements = deriveHeroElements(allNotes, input.accords ?? [], world, perfume);
  const secondaryElements = deriveSecondaryElements(allNotes, heroElements);

  const concept = pickUnusedConcept(world.concepts, seed + clashOffset, input.existingConcepts ?? []);
  const environment = pick(world.environments, 1);
  const surface = pick(world.surfaces, 2);
  const lighting = adjustLightingForTemperature(pick(world.lighting, 3), temperature);
  // If the fragrance itself is smoky or powdery, say so in the atmosphere rather than
  // relying only on the world default.
  const noteDrivenAtmosphere = visualHintsForNotes(allNotes, 16)
    .map((hint) => firstClause(hint.split(': ')[1] ?? ''))
    .filter((object) => isAtmospheric(object));
  const atmosphere = [...new Set([...noteDrivenAtmosphere.slice(0, 1), pick(world.atmosphere, 4)])].slice(0, 2);

  const symbolicElement = deriveSymbolicElement(input.bottleAnalysis);

  return {
    concept,
    mood: world.mood,

    environment,
    background: deriveBackground(world, palette, temperature),
    surface,

    lighting,

    colorPalette: palette,

    heroElements,
    secondaryElements,
    atmosphericEffects: atmosphere,

    ...(symbolicElement ? { symbolicElement } : {}),

    composition:
      'bottle centred and upright as the hero, ingredients low and to the sides, atmosphere behind, wide clear negative space above for typography',
    cameraAngle: pick(
      [
        'straight-on editorial angle at label height',
        'slightly low luxury editorial angle',
        'slight three-quarter hero angle',
      ],
      5,
    ),

    visualStory: buildVisualStory(environment, heroElements, temperature),
  };
}

/** Exposed so the UI can explain why a direction came out the way it did. */
export function explainRuleDirection(input: RuleDirectionInput): string {
  const allNotes = [
    ...input.perfume.topNotes,
    ...input.perfume.heartNotes,
    ...input.perfume.baseNotes,
  ];
  const world = selectWorld(input.accords ?? [], allNotes, input.perfume.fragranceFamily);
  const dominant = input.accords?.[0];

  const reasons: string[] = [];
  reasons.push(
    dominant
      ? `Dominant accord "${dominant.name}" (${dominant.weight}/100) placed this in the ${world.key} world.`
      : `Notes placed this in the ${world.key} world; no accord weights were available.`,
  );
  reasons.push(
    input.bottlePalette && input.bottlePalette.length > 0
      ? `Palette sampled from the bottle photograph (${input.bottlePalette.length} colours), which also set the light temperature.`
      : 'No bottle colours were available, so the world default palette was used.',
  );
  reasons.push('Hero elements were taken from the notes that photograph as objects.');
  return reasons.join(' ');
}

/* -------------------------------------------------------------- world choice */

function selectWorld(
  accords: WeightedAccord[],
  notes: string[],
  family: string | undefined,
): World {
  const scores = new Map<string, number>();
  const votes = new Map<string, number>();
  const add = (key: string, amount: number) => {
    scores.set(key, (scores.get(key) ?? 0) + amount);
    votes.set(key, (votes.get(key) ?? 0) + 1);
  };

  /*
   * Accord weights are the strongest signal available: they are ranked already.
   *
   * Scaled by world specificity for the same reason the note votes below are. A
   * gourmand oriental lists vanilla, sweet and warm spicy alongside coffee, and those
   * three ubiquitous accords outweighed the one diagnostic accord on raw weight alone:
   * Khamrah Qahwa scored amber 174 to coffee 100 and was directed as an amber interior
   * rather than a coffee one. Specificity says a coffee accord tells us far more about
   * a fragrance than a sweet accord does.
   */
  for (const accord of accords) {
    for (const world of WORLDS) {
      const matched = world.accords.find((candidate) => accord.name.includes(candidate));
      if (matched === undefined) continue;
      /*
       * A generic accord never inherits a world's specificity.
       *
       * "Aromatic" sits in the citrus world's list but describes half of perfumery, so
       * scaling it by citrus's 2.2 made it the loudest signal in the room: Musamam
       * Black Intense, a dark woody aromatic, was directed as cold marble and bright
       * peel. Only a genuinely diagnostic accord earns the multiplier.
       */
      const weight = GENERIC_ACCORDS.has(matched) ? accord.weight : accord.weight * world.specificity;
      add(world.key, weight);
    }
  }

  /*
   * Each note votes exactly once, for the world whose hint matches it most
   * specifically.
   *
   * Two problems make the naive approach wrong. First, counting every match means
   * ubiquitous base notes win: amber, vanilla and tonka appear in most orientals, so a
   * coffee fragrance called Qahwa would be scored as an amber one purely on volume.
   * Weighting by world specificity fixes that, since a coffee note says far more about
   * a fragrance than an amber note does.
   *
   * Second, hints overlap as substrings: "Orange Blossom" contains "orange". Taking
   * only the longest matching hint per note means the floral reading wins over the
   * citrus one, which is the correct call.
   */
  const noteWeight = accords.length > 0 ? 6 : 20;
  for (const note of notes) {
    const lower = note.toLowerCase();
    let bestWorld: World | undefined;
    let bestHintLength = 0;

    for (const world of WORLDS) {
      for (const hint of world.noteHints) {
        if (!lower.includes(hint)) continue;
        if (hint.length > bestHintLength) {
          bestHintLength = hint.length;
          bestWorld = world;
        }
      }
    }

    if (bestWorld) add(bestWorld.key, noteWeight * bestWorld.specificity);
  }

  if (family) {
    const lower = family.toLowerCase();
    for (const world of WORLDS) {
      if (world.accords.some((candidate) => lower.includes(candidate))) add(world.key, 12);
    }
  }

  let best: World = DEFAULT_WORLD;
  let bestScore = -1;
  let bestVotes = -1;
  for (const world of WORLDS) {
    const score = scores.get(world.key) ?? 0;
    const vote = votes.get(world.key) ?? 0;
    // Score decides; a tie goes to the world more notes actually pointed at.
    if (score > bestScore || (score === bestScore && vote > bestVotes)) {
      best = world;
      bestScore = score;
      bestVotes = vote;
    }
  }
  return best;
}

/* ------------------------------------------------------------------ palette */

const HEX = /^#[0-9a-fA-F]{6}$/;

function derivePalette(sampled: string[] | undefined, world: World): string[] {
  const valid = (sampled ?? []).filter((colour) => HEX.test(colour));
  if (valid.length < 3) return world.fallbackPalette.slice(0, 6);

  // Order dark to light so the palette reads as ground through to highlight, which is
  // how the generation prompt consumes it.
  const ordered = [...new Set(valid.map((c) => c.toUpperCase()))].sort(
    (a, b) => luminance(a) - luminance(b),
  );
  if (ordered.length <= 6) return ordered;

  // Thin evenly across the range rather than taking the first six, so the palette
  // keeps both its darkest ground and its brightest highlight.
  const step = (ordered.length - 1) / 5;
  return Array.from({ length: 6 }, (_, i) => ordered[Math.round(i * step)]!);
}

function rgb(hex: string): [number, number, number] {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

export function luminance(hex: string): number {
  const [r, g, b] = rgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export type PaletteTemperature = 'cool' | 'neutral' | 'warm';

/** Warm or cool by comparing red against blue across the palette. */
export function paletteTemperature(palette: string[]): PaletteTemperature {
  let bias = 0;
  for (const colour of palette) {
    if (!HEX.test(colour)) continue;
    const [r, , b] = rgb(colour);
    bias += r - b;
  }
  const average = palette.length > 0 ? bias / palette.length : 0;
  if (average > 18) return 'warm';
  if (average < -12) return 'cool';
  return 'neutral';
}

function adjustLightingForTemperature(lighting: string, temperature: PaletteTemperature): string {
  if (temperature === 'warm' && !/warm|amber|gold|candle/i.test(lighting)) {
    return `${lighting}, graded warm to agree with the bottle`;
  }
  if (temperature === 'cool' && !/cold|cool|blue|moon/i.test(lighting)) {
    return `${lighting}, graded cool to agree with the bottle`;
  }
  return lighting;
}

function deriveBackground(
  world: World,
  palette: string[],
  temperature: PaletteTemperature,
): string {
  const darkest = palette.reduce(
    (lowest, colour) => (HEX.test(colour) && luminance(colour) < luminance(lowest) ? colour : lowest),
    palette[0] ?? '#101010',
  );
  const bright = luminance(darkest) > 140;
  const tone = temperature === 'warm' ? 'warm' : temperature === 'cool' ? 'cool' : 'neutral';

  return bright
    ? `a bright ${tone} ${world.key === 'floral' ? 'plaster' : 'stone'} background falling away softly, kept clean and uncluttered`
    : `a deep ${tone} background built from ${darkest}, falling away into shadow behind the product`;
}

/* ------------------------------------------------------------------ objects */

/**
 * Hero elements come only from notes that photograph as a physical object.
 *
 * Notes with no visual counterpart (musk, most abstract accords) are deliberately
 * dropped rather than illustrated, which is the same discipline the model prompt asks
 * for and the main defence against an overcrowded frame.
 */
function deriveHeroElements(
  notes: string[],
  accords: WeightedAccord[],
  world: World,
  perfume: PerfumeCreativeInput,
): string[] {
  const hints = visualHintsForNotes(notes, 16);
  const objects = hints
    .map((hint) => {
      const [note, description] = hint.split(': ');
      return { note: (note ?? '').toLowerCase(), object: firstClause(description ?? '') };
    })
    // Some notes translate to an effect rather than an object. Smoke is not a prop you
    // can place on a surface, and listing it as a hero element both wastes one of the
    // few slots available and duplicates the atmosphere entry.
    .filter((entry) => entry.object.length > 0 && !isAtmospheric(entry.object));

  const accordWeight = (note: string): number => {
    let best = 0;
    for (const accord of accords) {
      if (note.includes(accord.name) || accord.name.includes(note)) {
        best = Math.max(best, accord.weight);
      }
    }
    return best;
  };

  /*
   * The note that decided the world should lead the frame.
   *
   * Without this, ranking falls back to the order the notes were listed in, which puts
   * top notes first — so a smoke-dominant oriental would open on its aquatic top note
   * and the scene would contradict the concept. Relevance to the chosen world is the
   * signal that survives when accord weights are unavailable.
   */
  const worldRelevance = (note: string): number =>
    world.noteHints.some((hint) => note.includes(hint)) ? 100 : 0;

  // Base notes carry the character of a heavy fragrance; top notes carry a fresh one.
  const baseSet = new Set(perfume.baseNotes.map((n) => n.toLowerCase()));
  const topSet = new Set(perfume.topNotes.map((n) => n.toLowerCase()));
  const freshWorld = world.key === 'citrus' || world.key === 'marine';
  const tierBonus = (note: string): number => {
    if (freshWorld) return topSet.has(note) ? 30 : baseSet.has(note) ? 5 : 15;
    return baseSet.has(note) ? 30 : topSet.has(note) ? 5 : 15;
  };

  const ranked = objects
    .map((entry, index) => ({
      ...entry,
      score: worldRelevance(entry.note) + accordWeight(entry.note) + tierBonus(entry.note) - index,
    }))
    .sort((a, b) => b.score - a.score);

  const chosen: string[] = [];
  const seen = new Set<string>();
  for (const entry of ranked) {
    // Stay inside the configured frame budget rather than a local literal, so the
    // rules and the model prompt are held to the same limit.
    if (chosen.length >= HERO_ELEMENT_RANGE.max) break;
    const key = entry.object.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    chosen.push(entry.object);
  }

  // A frame needs something in it. If nothing mapped, the product alone is a legitimate
  // luxury composition rather than an invented prop.
  if (chosen.length === 0) return ['the product alone on the surface, no props'];
  return chosen;
}

/**
 * Props that did not make the hero cut.
 *
 * Atmospherics are excluded here as well as from the heroes: they already have their
 * own field, and listing the same effect twice reads to the image model as emphasis it
 * was never meant to have.
 */
function deriveSecondaryElements(notes: string[], heroes: string[]): string[] {
  const used = new Set(heroes.map((hero) => hero.toLowerCase()));
  const remaining = visualHintsForNotes(notes, 20)
    .map((hint) => firstClause(hint.split(': ')[1] ?? ''))
    .filter((object) => !isAtmospheric(object))
    .filter((object) => object.length > 0 && !used.has(object.toLowerCase()));
  return [...new Set(remaining)].slice(0, 2);
}

/**
 * Effects belong in `atmosphericEffects`, never in `heroElements`.
 *
 * Word-boundary anchored so "sandalwood" is not mistaken for an effect, while
 * "drifting smoke" and "fine dust" are.
 */
const ATMOSPHERIC_RE = /\b(smoke|smoky|mist|haze|steam|dust|vapour|vapor|fog)\b/i;

function isAtmospheric(object: string): boolean {
  return ATMOSPHERIC_RE.test(object);
}

function firstClause(description: string): string {
  return (description.split(',')[0] ?? '').trim();
}

/**
 * A motif only when the real bottle already carries one.
 *
 * This is the rule the brief is most emphatic about, and a rule engine is the right
 * place to enforce it absolutely: no amount of dark, dramatic input can talk this
 * function into adding a serpent that the product does not have.
 */
function deriveSymbolicElement(analysis: BottleAnalysis | undefined): string | undefined {
  if (!analysis) return undefined;
  const haystack = [...analysis.distinctiveElements, analysis.bottleDescription]
    .join(' ')
    .toLowerCase();

  const creatures = [
    'snake',
    'serpent',
    'panther',
    'wolf',
    'falcon',
    'eagle',
    'butterfly',
    'scorpion',
    'horse',
    'lion',
    'peacock',
    'dragon',
  ];
  const found = creatures.find((creature) => haystack.includes(creature));
  if (!found) return undefined;
  return found === 'serpent' ? 'snake' : found;
}

function buildVisualStory(
  environment: string,
  heroes: string[],
  temperature: PaletteTemperature,
): string {
  const lead = heroes[0] ?? 'the product';
  const light =
    temperature === 'warm'
      ? 'Warm light'
      : temperature === 'cool'
        ? 'Cold light'
        : 'Controlled light';
  // The chosen environment, not the world default: the story must describe the same
  // scene the rest of the direction specifies.
  const place = environment.replace(/^an? /, '');
  return `${light} on ${lead}, in ${place}`;
}

/* --------------------------------------------------------------------- hash */

/**
 * Stable hash of the perfume identity.
 *
 * Deterministic so the same perfume always yields the same direction, and spread
 * enough that neighbouring names do not collide onto the same variant.
 */
export function hashIdentity(perfume: PerfumeCreativeInput): number {
  const source = `${perfume.brand}|${perfume.name}|${perfume.variant ?? ''}`.toLowerCase();
  let hash = 2166136261;
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

/**
 * Picks a concept the library is not already using.
 *
 * The clash offset alone only nudges the starting point, so two perfumes in the same
 * world still landed on the same concept whenever their identity hashes lined up — a
 * live run gave both Hawas Elixir and Khamrah Qahwa "Midnight Qahwa". Walking the list
 * from the hashed start and stopping at the first unused concept makes the guarantee
 * real. If every concept in the world is taken the hashed pick stands, since repeating
 * a concept beats returning nothing.
 */
function pickUnusedConcept(concepts: string[], start: number, existing: string[]): string {
  const used = new Set(existing.map((value) => value.trim().toLowerCase()));
  for (let step = 0; step < concepts.length; step += 1) {
    const candidate = concepts[(start + step) % concepts.length]!;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
  return concepts[start % concepts.length]!;
}

function countClashes(concepts: string[], existing: string[]): number {
  const used = new Set(existing.map((c) => c.trim().toLowerCase()));
  return concepts.filter((concept) => used.has(concept.toLowerCase())).length;
}
