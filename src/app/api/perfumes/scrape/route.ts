import { z } from 'zod';

import { created, handler, parseJsonBody } from '@/lib/api/response';
import { prepareFromBrandAndName } from '@/services/perfumePrepService';

export const runtime = 'nodejs';
export const maxDuration = 300;

const bodySchema = z.object({
  brand: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(120),
  variant: z.string().trim().max(120).optional(),
  arabicName: z.string().trim().max(120).optional(),
  /** Read exactly these pages instead of searching. */
  urls: z.array(z.string().trim().min(8).max(2048)).max(6).optional(),
  /** Accept the best bottle candidate automatically. */
  autoAcceptBottle: z.boolean().default(true),
  /** Build the rule-based creative direction and the generation prompt. */
  buildDirection: z.boolean().default(true),
});

/**
 * One call, brand and name in, campaign-ready perfume out.
 *
 * Scrapes the notes and accords, collects bottle reference candidates, accepts the
 * best one, derives a creative direction from rules, and builds the generation prompt.
 * No model calls and no API key: everything here is web scraping plus deterministic
 * logic, so it runs for free and never hits a quota.
 */
export const POST = handler(async (request: Request) => {
  const body = await parseJsonBody(request, bodySchema);
  const result = await prepareFromBrandAndName(body);
  return created(result);
});
