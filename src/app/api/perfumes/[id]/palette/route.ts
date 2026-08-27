import { z } from 'zod';

import { handler, ok, parseJsonBody } from '@/lib/api/response';
import { applyBottlePalette } from '@/services/perfumePrepService';

export const runtime = 'nodejs';

type Context = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  palette: z
    .array(
      z
        .string()
        .trim()
        .regex(/^#[0-9a-fA-F]{6}$/, 'Expected a #RRGGBB hex colour'),
    )
    .min(1)
    .max(12),
  /** Rebuild the creative direction from the new palette. */
  rebuildDirection: z.boolean().default(true),
});

/**
 * Stores the colours sampled from the bottle photograph and, by default, rebuilds the
 * creative direction from them.
 *
 * A dedicated endpoint rather than a second scrape: the pages have already been read,
 * and only the palette-dependent part of the direction needs recomputing.
 */
export const POST = handler(async (request: Request, context: Context) => {
  const { id } = await context.params;
  const body = await parseJsonBody(request, bodySchema);

  const result = await applyBottlePalette(id, body.palette, {
    rebuildDirection: body.rebuildDirection,
  });

  return ok(result);
});
