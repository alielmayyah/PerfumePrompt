import 'server-only';

import {
  DEFAULT_ASPECT_RATIO,
  type CampaignAspectRatio,
  CAMPAIGN_ASPECT_RATIOS,
} from './constants';

/**
 * Server-only configuration.
 *
 * There are no secrets here: this app scrapes public pages and derives prompts with
 * deterministic rules, so it needs no API key. `server-only` is kept because these
 * paths and defaults have no business in a client bundle.
 */

function str(name: string): string | undefined {
  const raw = process.env[name];
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function int(name: string, fallback: number): number {
  const raw = str(name);
  if (raw === undefined) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function oneOf<T extends string>(name: string, allowed: readonly T[], fallback: T): T {
  const raw = str(name);
  if (raw === undefined) return fallback;
  return (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
}

export interface StudioEnv {
  /** Paths used by the local database and storage drivers. */
  readonly local: {
    readonly dataDir: string;
    readonly storageDir: string;
    /** Human-browsable folder that saved prompts are written into. */
    readonly exportDir: string;
  };
  readonly creative: {
    /** How many alternative takes on the concept to produce prompts for. */
    readonly takeCount: number;
    readonly defaultAspectRatio: CampaignAspectRatio;
  };
}

export const env: StudioEnv = {
  local: {
    dataDir: str('STUDIO_LOCAL_DATA_DIR') ?? '.data',
    storageDir: str('STUDIO_LOCAL_STORAGE_DIR') ?? '.data/storage',
    exportDir: str('STUDIO_EXPORT_DIR') ?? 'exports',
  },
  creative: {
    takeCount: Math.min(6, Math.max(1, int('STUDIO_TAKE_COUNT', 3))),
    defaultAspectRatio: oneOf<CampaignAspectRatio>(
      'STUDIO_DEFAULT_ASPECT_RATIO',
      CAMPAIGN_ASPECT_RATIOS,
      DEFAULT_ASPECT_RATIO,
    ),
  },
};
