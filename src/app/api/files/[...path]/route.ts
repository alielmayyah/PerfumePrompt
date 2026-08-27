import { fail } from '@/lib/api/response';
import { errors } from '@/lib/errors';
import { getStorage } from '@/lib/storage';

export const runtime = 'nodejs';

type Context = { params: Promise<{ path: string[] }> };

/**
 * Serves stored files.
 *
 * Files live outside the build output, so this route is how the browser reaches
 * bottle photographs, campaign variations and final exports. Only keys inside the
 * studio namespace are served, and the driver itself rejects any key that tries to
 * escape the storage root.
 */
export async function GET(_request: Request, context: Context): Promise<Response> {
  try {
    const { path } = await context.params;
    const key = path.map(decodeURIComponent).join('/');
    if (!key.startsWith('perfumes/') || key.includes('..')) {
      throw errors.notFound('File');
    }

    const file = await getStorage().read(key);

    return new Response(new Uint8Array(file.bytes), {
      headers: {
        'content-type': file.mimeType,
        'content-length': String(file.bytes.byteLength),
        'cache-control': 'private, max-age=3600',
      },
    });
  } catch (error) {
    return fail(error);
  }
}
