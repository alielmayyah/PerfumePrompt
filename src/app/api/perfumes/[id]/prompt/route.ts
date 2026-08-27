import { z } from 'zod';

import { handler, ok, parseQuery } from '@/lib/api/response';
import { CAMPAIGN_ASPECT_RATIOS } from '@/lib/config/constants';
import { buildPerfumePrompt } from '@/services/perfumePrepService';

export const runtime = 'nodejs';

type Context = { params: Promise<{ id: string }> };

const querySchema = z.object({
  aspectRatio: z.enum(CAMPAIGN_ASPECT_RATIOS).optional(),
  /** Also write a .txt copy into the export folder. */
  save: z.enum(['true', 'false']).optional(),
});

/**
 * The finished generation prompt for a perfume.
 *
 * Separate from campaign creation so the prompt can be fetched, copied and pasted into
 * any image tool without committing to a campaign record first. This is the main
 * output of the free path through the app.
 */
export const GET = handler(async (request: Request, context: Context) => {
  const { id } = await context.params;
  const query = parseQuery(request, querySchema);

  const result = await buildPerfumePrompt(id, {
    ...(query.aspectRatio ? { aspectRatio: query.aspectRatio } : {}),
    save: query.save === 'true',
  });

  return ok(result);
});
