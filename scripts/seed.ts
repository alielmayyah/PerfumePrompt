/**
 * Seeds the perfume library from `perfumes.json`.
 *
 * Talks to the running app over HTTP rather than importing the service layer:
 * those modules are `server-only` and are aliased by the Next bundler, so they
 * cannot be loaded from a plain Node process. Going through the API also means the
 * seed data passes exactly the same validation as a manual entry.
 *
 * Usage:
 *   npm run dev            # in one terminal
 *   npm run seed           # in another
 *
 * Override the target with STUDIO_SEED_URL (default http://localhost:3000).
 *
 * Scope: identity, notes, and optionally a creative direction that was authored by
 * hand and is worth keeping. Bottle images and bottle analysis are always produced
 * inside the app, so nothing about the product reference is hardcoded, and seeded
 * notes land UNAPPROVED so a human still signs them off before they drive a
 * campaign. A seeded direction is a starting point, not a lock: the app can
 * regenerate or edit it freely.
 */

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

interface SeedEntry {
  brand: string;
  name: string;
  arabicName?: string;
  variant?: string;
  fragranceFamily?: string;
  topNotes?: string[];
  heartNotes?: string[];
  baseNotes?: string[];
  mainAccords?: string[];
  /**
   * Optional authored creative direction. Present so a design worked out by hand
   * survives a wiped data directory and can be re-seeded verbatim; the app can
   * still regenerate or edit it afterwards.
   */
  creativeDirection?: Record<string, unknown>;
}

interface PerfumeSummary {
  id: string;
  brand: string;
  name: string;
  variant?: string;
}

const baseUrl = (process.env['STUDIO_SEED_URL'] ?? 'http://localhost:3000').replace(/\/$/, '');

async function main(): Promise<void> {
  const localFile = path.resolve(process.cwd(), 'perfumes.local.json');
  const defaultFile = path.resolve(process.cwd(), 'perfumes.json');
  const file = existsSync(localFile) ? localFile : defaultFile;
  const fileName = path.basename(file);
  const parsed = JSON.parse(await readFile(file, 'utf8')) as { perfumes?: SeedEntry[] };
  const entries = parsed.perfumes ?? [];

  if (entries.length === 0) {
    console.log(`${fileName} contains no entries. Nothing to seed.`);
    return;
  }

  const existing = await listExisting();
  const key = (entry: { brand: string; name: string; variant?: string }) =>
    `${entry.brand}|${entry.name}|${entry.variant ?? ''}`.toLowerCase();
  const seen = new Set(existing.map(key));

  let created = 0;
  let skipped = 0;

  for (const entry of entries) {
    if (!entry.brand || !entry.name) {
      console.warn('Skipping an entry with no brand or name.');
      continue;
    }
    if (seen.has(key(entry))) {
      skipped += 1;
      continue;
    }

    const perfume = await createPerfume({
      brand: entry.brand,
      name: entry.name,
      ...(entry.arabicName ? { arabicName: entry.arabicName } : {}),
      ...(entry.variant ? { variant: entry.variant } : {}),
      ...(entry.fragranceFamily ? { fragranceFamily: entry.fragranceFamily } : {}),
      topNotes: entry.topNotes ?? [],
      heartNotes: entry.heartNotes ?? [],
      baseNotes: entry.baseNotes ?? [],
      mainAccords: entry.mainAccords ?? [],
      notesSource: 'seed',
      notesApproved: false,
    });

    created += 1;
    let suffix = '';

    if (entry.creativeDirection) {
      // Applied as a second call so an invalid direction is reported against the
      // perfume that already exists, rather than silently losing the whole entry.
      const st = await patchPerfume(perfume.id, { creativeDirection: entry.creativeDirection });
      suffix = st === 200 ? ' (+ creative direction)' : ' (creative direction rejected)';
    }

    console.log(
      `Created ${perfume.brand} ${perfume.name}${entry.variant ? ` ${entry.variant}` : ''}${suffix}`,
    );
  }

  console.log(
    `\nDone. ${created} created, ${skipped} already present.\n` +
      'Next: open each perfume, upload its real bottle image, then run the wizard.',
  );
}

async function listExisting(): Promise<PerfumeSummary[]> {
  const response = await request('GET', '/api/perfumes');
  const body = (await response.json()) as { perfumes?: PerfumeSummary[] };
  return body.perfumes ?? [];
}

async function createPerfume(input: Record<string, unknown>): Promise<PerfumeSummary> {
  const response = await request('POST', '/api/perfumes', input);
  const body = (await response.json()) as { perfume: PerfumeSummary };
  return body.perfume;
}

async function patchPerfume(id: string, patch: Record<string, unknown>): Promise<number> {
  try {
    const response = await request('PATCH', `/api/perfumes/${id}`, patch);
    return response.status;
  } catch (error) {
    console.warn(`  could not apply the creative direction: ${(error as Error).message}`);
    return 0;
  }
}

async function request(method: string, route: string, body?: unknown): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${route}`, {
      method,
      headers: body !== undefined ? { 'content-type': 'application/json' } : {},
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new Error(
      `Could not reach ${baseUrl}. Start the app with "npm run dev" first, or set STUDIO_SEED_URL.`,
    );
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${method} ${route} failed with ${response.status}: ${text.slice(0, 300)}`);
  }
  return response;
}

main().catch((error: unknown) => {
  console.error('Seeding failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
