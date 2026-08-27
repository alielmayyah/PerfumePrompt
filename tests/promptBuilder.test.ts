import { describe, expect, it } from 'vitest';

import { aspectRatioSpec } from '@/lib/config/constants';
import type { BottleAnalysis, CreativeDirection, PerfumeCreativeInput } from '@/lib/types';
import { buildCampaignPrompt, variationNudge } from '@/services/ai/prompts/campaignGeneration';
import { PROMPT_VERSIONS } from '@/services/ai/prompts/registry';

const perfume: PerfumeCreativeInput = {
  brand: 'Lattafa',
  name: 'Musamam',
  arabicName: 'مسمم',
  variant: 'Black Intense',
  topNotes: ['Lavender', 'Nutmeg', 'Bergamot', 'Sage'],
  heartNotes: ['Geranium', 'Cedarwood'],
  baseNotes: ['Patchouli', 'Tonka Bean'],
  fragranceFamily: 'Aromatic Woody',
  mainAccords: ['aromatic', 'woody'],
};

const analysis: BottleAnalysis = {
  shape: 'tall cylindrical bottle',
  proportions: 'vertical with broad lower body',
  materials: ['smoky gray glass', 'matte black metal'],
  dominantColors: ['charcoal', 'black'],
  capDescription: 'large matte black cylindrical cap',
  bottleDescription: 'dark cylindrical luxury perfume bottle',
  visualPersonality: 'dark, mysterious, powerful',
  luxuryLevel: 'high',
  distinctiveElements: ['black serpent ornament around cap'],
};

const direction: CreativeDirection = {
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
  cameraAngle: 'slightly low luxury editorial angle',
  visualStory: 'A serpent rite in a cold cedar forest after dark',
};

const base = {
  perfume,
  creativeDirection: direction,
  bottleAnalysis: analysis,
  aspectRatio: '4:5' as const,
  hasBottleImage: true,
  includeText: false,
};

describe('buildCampaignPrompt', () => {
  it('is deterministic for identical input', () => {
    expect(buildCampaignPrompt(base)).toBe(buildCampaignPrompt(base));
  });

  it('protects the real bottle and forbids redesigning it', () => {
    const prompt = buildCampaignPrompt(base);
    expect(prompt).toContain('protected hero product');
    expect(prompt).toContain('attached photograph');
    expect(prompt).toContain('Do not redesign it.');
    expect(prompt).toContain('Do not change the bottle.');
    // Every fidelity-critical feature named by the brief must be listed.
    for (const feature of ['geometry', 'proportions', 'cap', 'label', 'logo', 'typography', 'embossing']) {
      expect(prompt.toLowerCase()).toContain(feature);
    }
  });

  it('carries the creative direction into the scene description', () => {
    const prompt = buildCampaignPrompt(base);
    expect(prompt).toContain(direction.concept);
    expect(prompt).toContain(direction.environment);
    expect(prompt).toContain(direction.lighting);
    expect(prompt).toContain(direction.surface);
    for (const element of direction.heroElements) {
      expect(prompt).toContain(element);
    }
  });

  it('suppresses all model-rendered text by default', () => {
    const prompt = buildCampaignPrompt(base);
    expect(prompt).toContain('Render NO text of any kind');
    expect(prompt).not.toContain('Any text must be spelled exactly');
  });

  it('allows text only when explicitly asked for', () => {
    const prompt = buildCampaignPrompt({ ...base, includeText: true });
    expect(prompt).toContain('Any text must be spelled exactly');
    expect(prompt).not.toContain('Render NO text of any kind');
  });

  it('states that no symbolic element means no animals at all', () => {
    const { symbolicElement: _omitted, ...withoutSymbol } = direction;
    const prompt = buildCampaignPrompt({ ...base, creativeDirection: withoutSymbol });
    expect(prompt).toContain('Symbolic element: none');
    expect(prompt).toContain('Do not add animals');
  });

  it('embeds the requested format and its safe area', () => {
    for (const ratio of ['1:1', '4:5', '9:16'] as const) {
      const spec = aspectRatioSpec(ratio);
      const prompt = buildCampaignPrompt({ ...base, aspectRatio: ratio });
      expect(prompt).toContain(`${spec.width} by ${spec.height}`);
      expect(prompt).toContain(`${Math.round(spec.safeAreaRatio * 100)} percent`);
    }
  });

  it('falls back to the written analysis when no photograph is available', () => {
    const prompt = buildCampaignPrompt({ ...base, hasBottleImage: false });
    expect(prompt).toContain('no photograph available');
    expect(prompt).toContain(analysis.shape);
    expect(prompt).toContain('written description below');
    expect(prompt).not.toContain('attached photograph is the actual');
  });

  it('never promises a description it did not include', () => {
    // With neither a photograph nor an analysis the prompt must not point the model
    // at a product description that is not there.
    const { bottleAnalysis: _omitted, ...withoutAnalysis } = base;
    const prompt = buildCampaignPrompt({ ...withoutAnalysis, hasBottleImage: false });
    expect(prompt).not.toContain('description below');
    expect(prompt).not.toContain('analysis below');
    expect(prompt).toContain('no product description are available');
  });

  it('records the prompt version', () => {
    expect(buildCampaignPrompt(base)).toContain(PROMPT_VERSIONS.campaignGeneration);
  });
});

describe('variationNudge', () => {
  it('gives each variation a distinct steer', () => {
    const nudges = [0, 1, 2].map(variationNudge);
    expect(new Set(nudges).size).toBe(3);
  });

  it('wraps around rather than returning undefined', () => {
    expect(variationNudge(99)).toBeTruthy();
  });

  it('produces different full prompts per variation', () => {
    const prompt = buildCampaignPrompt(base);
    const a = `${prompt}\n\n${variationNudge(0)}`;
    const b = `${prompt}\n\n${variationNudge(1)}`;
    expect(a).not.toBe(b);
  });
});
