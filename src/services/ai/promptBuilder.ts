/**
 * Public entry point for prompt construction.
 *
 * Everything here is pure and deterministic, and nothing in `src/components` builds a
 * prompt itself. This is the app's only output, so it is also the thing most worth
 * keeping unit-tested.
 */

export { buildCampaignPrompt, variationNudge } from './prompts/campaignGeneration';
export type { CampaignPromptInput } from './prompts/campaignGeneration';

export { PROMPT_VERSIONS, promptVersionSnapshot } from './prompts/registry';
export type { PromptStage, PromptVersion } from './prompts/registry';
