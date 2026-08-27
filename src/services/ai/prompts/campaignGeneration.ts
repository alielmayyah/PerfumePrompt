import { aspectRatioSpec, type CampaignAspectRatio } from '@/lib/config/constants';
import type { BottleAnalysis, CreativeDirection, PerfumeCreativeInput } from '@/lib/types';
import { PROMPT_VERSIONS } from './registry';

export interface CampaignPromptInput {
  perfume: PerfumeCreativeInput;
  creativeDirection: CreativeDirection;
  bottleAnalysis?: BottleAnalysis;
  aspectRatio: CampaignAspectRatio;
  /** True when the real bottle photograph is attached as reference image 1. */
  hasBottleImage: boolean;
  /** When false, the model is told to render no text at all (our compositor adds it). */
  includeText: boolean;
}

/**
 * The image-generation prompt.
 *
 * Written for a tool that accepts a text prompt alongside reference images, such as
 * Google Flow: the bottle photograph is described as attached rather than embedded in
 * the text, and the fidelity rules address that attachment directly.
 *
 * Deterministic and pure, so the same perfume always yields the same prompt. The
 * per-take nudges are applied separately by `variationNudge`, keeping the shared base
 * comparable across takes.
 */
export function buildCampaignPrompt(input: CampaignPromptInput): string {
  const { perfume, creativeDirection: cd, bottleAnalysis } = input;
  const spec = aspectRatioSpec(input.aspectRatio);
  const identity = [perfume.brand, perfume.name, perfume.variant].filter(Boolean).join(' ');

  const blocks: string[] = [];

  blocks.push('Create a premium luxury perfume advertising campaign photograph.');

  blocks.push(
    [
      'REFERENCE IMAGE',
      input.hasBottleImage
        ? 'The attached photograph is the actual perfume bottle, and it is the protected hero product of this image.'
        : bottleAnalysis
          ? 'No product photograph is attached. Build the bottle from the written description below.'
          : 'No product photograph and no product description are available. Render a restrained, plausible luxury bottle consistent with the art direction, and keep it simple.',
    ].join('\n'),
  );

  if (input.hasBottleImage) {
    blocks.push(
      [
        'PRODUCT FIDELITY (highest priority)',
        'Reproduce the bottle from the attached photograph exactly as it appears. Do not redesign it.',
        'Preserve with maximum fidelity:',
        '- overall geometry and silhouette',
        '- proportions and relative scale of body, shoulders, neck and cap',
        '- the cap: shape, size, material and finish',
        '- glass colour, glass finish and transparency',
        '- liquid colour and fill level',
        '- the label, the logo, the wordmark and all typography exactly as it appears',
        '- embossing, engraving and applied metalwork',
        '- every decorative element and ornament the real bottle carries',
        '- brand markings and physical construction',
        'Do not restyle, simplify, modernise, re-letter or re-proportion any part of the product.',
        'Do not substitute a different bottle. Do not add a second bottle unless asked.',
      ].join('\n'),
    );
  } else if (bottleAnalysis) {
    blocks.push(
      [
        'PRODUCT DESCRIPTION (no photograph available, render faithfully from this)',
        `Shape: ${bottleAnalysis.shape}`,
        `Proportions: ${bottleAnalysis.proportions}`,
        `Materials: ${bottleAnalysis.materials.join(', ')}`,
        `Colours: ${bottleAnalysis.dominantColors.join(', ')}`,
        `Cap: ${bottleAnalysis.capDescription}`,
        bottleAnalysis.distinctiveElements.length > 0
          ? `Distinctive elements: ${bottleAnalysis.distinctiveElements.join(', ')}`
          : 'No ornamentation.',
      ].join('\n'),
    );
  }

  blocks.push(
    [
      'PERFUME',
      identity,
      '',
      'FRAGRANCE NOTES',
      `Top: ${listOrNone(perfume.topNotes)}`,
      `Heart: ${listOrNone(perfume.heartNotes)}`,
      `Base: ${listOrNone(perfume.baseNotes)}`,
      perfume.fragranceFamily ? `Family: ${perfume.fragranceFamily}` : undefined,
    ]
      .filter((line) => line !== undefined)
      .join('\n'),
  );

  blocks.push(
    [
      'CREATIVE DIRECTION',
      `Concept: ${cd.concept}`,
      `Mood: ${cd.mood}`,
      `Visual story: ${cd.visualStory}`,
      `Environment: ${cd.environment}`,
      `Background: ${cd.background}`,
      `Surface the bottle stands on: ${cd.surface}`,
      `Lighting: ${cd.lighting}`,
      `Colour palette: ${cd.colorPalette.join(', ')}`,
      `Hero elements in frame: ${cd.heroElements.join(', ')}`,
      cd.secondaryElements.length > 0
        ? `Secondary elements, subtle: ${cd.secondaryElements.join(', ')}`
        : undefined,
      cd.atmosphericEffects.length > 0
        ? `Atmospheric effects, restrained: ${cd.atmosphericEffects.join(', ')}`
        : undefined,
      cd.symbolicElement
        ? `Symbolic element: ${cd.symbolicElement}. Render it as a supporting presence only, clearly subordinate to the bottle, never overlapping or obscuring it.`
        : 'Symbolic element: none. Do not add animals, figures or mascots.',
      `Composition: ${cd.composition}`,
      `Camera angle: ${cd.cameraAngle}`,
    ]
      .filter((line) => line !== undefined)
      .join('\n'),
  );

  blocks.push(
    [
      'COMPOSITION RULES',
      `Format: ${spec.ratio} portrait-safe framing at ${spec.width} by ${spec.height}.`,
      `Keep the outer ${Math.round(spec.safeAreaRatio * 100)} percent of every edge free of`,
      'critical detail, so headline text or a logo can be laid over the image later.',
      'The bottle is the clear hero: centred or near-centred, fully visible, unobstructed,',
      'in sharp focus, and the largest single object in frame.',
      'Ingredients frame and support the bottle. They must not overlap, lean on, or cast',
      'clutter across the product.',
      'Use depth of field and atmosphere for separation, not for hiding the product.',
    ].join('\n'),
  );

  blocks.push(
    [
      'QUALITY TARGET',
      'Photorealistic commercial product photography. High-end editorial fragrance campaign.',
      'Physically plausible light, real material response, controlled colour grading,',
      'beautiful atmospheric depth, sophisticated art direction.',
      '',
      'AVOID',
      'Generic AI art. Cartoon, anime, illustration or 3D-render look. Random unrelated props.',
      'Overcrowded still-life. Stock-photo collage. Cheap ecommerce lighting. Plastic surfaces.',
      'Duplicated or floating objects. Warped reflections. Extra bottles. Visible watermarks.',
    ].join('\n'),
  );

  blocks.push(
    input.includeText
      ? [
          'TEXT',
          'Any text must be spelled exactly as written here and set in a restrained luxury style:',
          identity,
        ].join('\n')
      : [
          'TEXT',
          'Render NO text of any kind: no headline, no tagline, no logo lockup, no watermark,',
          'no caption, no lettering on surfaces or props. The only lettering allowed anywhere in',
          'the image is the wordmark that physically exists on the bottle itself.',
        ].join('\n'),
  );

  blocks.push(
    [
      'This campaign is designed for this specific perfume. Do not produce a generic perfume',
      'advertisement. Do not change the bottle.',
      '',
      `Prompt version: ${PROMPT_VERSIONS.campaignGeneration}`,
    ].join('\n'),
  );

  return blocks.join('\n\n');
}

/**
 * Per-take steer. Varies the interpretation without changing the concept, so several
 * takes read as genuinely different photographs of the same idea rather than
 * near-duplicates.
 */
export function variationNudge(index: number): string {
  const nudges = [
    'Variation A: the definitive hero frame. Balanced symmetry, ingredients settled evenly around the base, the primary lighting concept at full strength.',
    'Variation B: a more cinematic take. Push atmosphere and negative space, move the light source further off-axis, let the background fall deeper into shadow or haze.',
    'Variation C: a tighter, more tactile take. Bring the camera closer, foreground one or two hero ingredients in soft focus near the frame edge, emphasise material texture.',
    'Variation D: a wider editorial take. More environment, more architectural context, the bottle smaller in frame but still unmistakably dominant.',
    'Variation E: a graphic take. Stronger single-source light, cleaner shadow shapes, fewer props, more of the palette carried by the background itself.',
    'Variation F: a warmer, softer take. Diffuse the key light, lift the shadows slightly, let atmosphere carry most of the depth.',
  ];
  return nudges[index % nudges.length] ?? nudges[0]!;
}

function listOrNone(values: readonly string[]): string {
  return values.length > 0 ? values.join(', ') : 'not specified';
}
