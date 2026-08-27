import 'server-only';

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { env } from '@/lib/config/env';
import { createLogger } from '@/lib/logger';
import { slugify } from '@/lib/utils/id';
import type { CampaignAspectRatio } from '@/lib/config/constants';

const log = createLogger('export-folder');

export interface WriteTextInput {
  brand: string;
  name: string;
  variant?: string;
  aspectRatio: CampaignAspectRatio;
  /** Distinguishes this file from the artwork, e.g. `prompt`. */
  suffix: string;
  extension: string;
  contents: string;
}

/**
 * Writes a text companion file next to the exported artwork.
 *
 * The generation prompt is the main deliverable of the free path through the app, so it
 * belongs in the same folder a person already opens to collect their output, under the
 * same predictable naming.
 */
export async function writeTextToExportFolder(input: WriteTextInput): Promise<string | undefined> {
  const stem = [input.brand, input.name, input.variant].filter(Boolean).join(' ');
  const filename = [
    slugify(stem) || 'campaign',
    input.suffix,
    input.aspectRatio.replace(':', 'x'),
  ].join('-');
  // Same opt-out as the image writer below: the export directory is configurable, so
  // the bundler cannot statically scope it and would otherwise trace the whole project.
  const relative = path.join(/*turbopackIgnore: true*/ env.local.exportDir, `${filename}.${input.extension}`);
  const absolute = path.resolve(/*turbopackIgnore: true*/ process.cwd(), relative);

  try {
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, input.contents, 'utf8');
    return relative.split(path.sep).join('/');
  } catch (error) {
    log.warn('could not write the text companion file', {
      relative,
      reason: error instanceof Error ? error.message : 'unknown',
    });
    return undefined;
  }
}
