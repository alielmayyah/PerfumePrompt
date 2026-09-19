import { ok, handler } from '@/lib/api/response';
import { pullAndRebuild } from '@/services/updateCheckService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = handler(async () => {
  const result = await pullAndRebuild();
  return ok(result);
});
