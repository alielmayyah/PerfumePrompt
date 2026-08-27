import { handler, noContent, ok, parseJsonBody } from '@/lib/api/response';
import { perfumeUpdateBodySchema } from '@/lib/schemas/api';
import { deletePerfume, getPerfumeOrThrow, updatePerfume } from '@/services/perfumeService';

export const runtime = 'nodejs';

type Context = { params: Promise<{ id: string }> };

export const GET = handler(async (_request: Request, context: Context) => {
  const { id } = await context.params;
  const perfume = await getPerfumeOrThrow(id);
  return ok({ perfume });
});

export const PATCH = handler(async (request: Request, context: Context) => {
  const { id } = await context.params;
  const body = await parseJsonBody(request, perfumeUpdateBodySchema);
  const perfume = await updatePerfume(id, body);
  return ok({ perfume });
});

export const DELETE = handler(async (_request: Request, context: Context) => {
  const { id } = await context.params;
  await deletePerfume(id);
  return noContent();
});
