import { ok, handler } from '@/lib/api/response';
import { checkUpdateStatus } from '@/services/updateCheckService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handler(async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const force = searchParams.get('force') === 'true';
  const status = await checkUpdateStatus({ force });
  return ok(status);
});
