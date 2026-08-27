import { z } from 'zod';

import { handler, ok, parseJsonBody } from '@/lib/api/response';
import { rankCandidatesWithVisualScores } from '@/services/perfumeService';

export const runtime = 'nodejs';

type Context = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  /** Candidate id to 0-1 visual score, measured in the browser. */
  scores: z.record(z.string().min(1), z.number().min(0).max(1)),
  /** Accept the new top candidate as the product reference. */
  accept: z.boolean().default(true),
});

/**
 * Re-ranks bottle candidates using visual scores measured in the browser.
 *
 * The server cannot decode images, so this is the only place pixel evidence can enter
 * the ranking. It is a separate call rather than part of the scrape so that a failure
 * to measure never costs the scrape itself.
 */
export const POST = handler(async (request: Request, context: Context) => {
  const { id } = await context.params;
  const body = await parseJsonBody(request, bodySchema);

  const result = await rankCandidatesWithVisualScores(id, body.scores, {
    accept: body.accept,
  });

  return ok(result);
});
