/**
 * Prompt versioning.
 *
 * The version travels with every prompt this app produces, so an image you generated
 * weeks ago can be traced to the exact prompt revision that described it. Bump it
 * whenever the prompt text changes in a way that affects output.
 */

export const PROMPT_VERSIONS = {
  campaignGeneration: 'CAMPAIGN_GENERATION_PROMPT_V2',
} as const;

export type PromptStage = keyof typeof PROMPT_VERSIONS;
export type PromptVersion = (typeof PROMPT_VERSIONS)[PromptStage];

export function promptVersionSnapshot(): Record<string, string> {
  return { ...PROMPT_VERSIONS };
}
