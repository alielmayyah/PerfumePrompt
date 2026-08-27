import { z } from 'zod';

import { handler, ok, parseJsonBody } from '@/lib/api/response';
import { errors } from '@/lib/errors';
import { acceptReferenceAsBottle } from '@/services/perfumeService';

export const runtime = 'nodejs';

type Context = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  candidateId: z.string().trim().min(1),
});

/**
 * Promotes one candidate to the protected product reference.
 *
 * A separate, explicit step: this is the image every generation is held against, so
 * a human decides which one it is.
 */
export const POST = handler(async (request: Request, context: Context) => {
  const { id } = await context.params;
  const { candidateId } = await parseJsonBody(request, bodySchema);

  const perfume = await acceptReferenceAsBottle(id, candidateId);
  if (!perfume) throw errors.notFound('Reference candidate');

  return ok({ perfume });
});
