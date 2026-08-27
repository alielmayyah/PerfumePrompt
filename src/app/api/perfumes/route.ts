import { z } from 'zod';

import { created, handler, ok, parseJsonBody, parseQuery } from '@/lib/api/response';
import { perfumeCreateBodySchema } from '@/lib/schemas/api';
import { createPerfume, listPerfumes } from '@/services/perfumeService';

export const runtime = 'nodejs';

const listQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const GET = handler(async (request: Request) => {
  const query = parseQuery(request, listQuerySchema);
  const perfumes = await listPerfumes(query);
  return ok({ perfumes });
});

export const POST = handler(async (request: Request) => {
  const body = await parseJsonBody(request, perfumeCreateBodySchema);
  const perfume = await createPerfume(body);
  return created({ perfume });
});
