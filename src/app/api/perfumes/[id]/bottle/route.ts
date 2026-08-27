import { handler, ok } from '@/lib/api/response';
import { errors } from '@/lib/errors';
import { assertAcceptedImage, sniffImageMime } from '@/lib/utils/image';
import { attachBottleImage } from '@/services/perfumeService';

export const runtime = 'nodejs';

type Context = { params: Promise<{ id: string }> };

/**
 * Bottle upload.
 *
 * The declared content type is never trusted: the real type is sniffed from the
 * magic bytes and validated against the allow-list before anything is stored.
 */
export const POST = handler(async (request: Request, context: Context) => {
  const { id } = await context.params;

  const form = await request.formData().catch(() => {
    throw errors.validation('Expected a multipart form upload.');
  });

  const file = form.get('file');
  if (!(file instanceof File)) {
    throw errors.validation('No file was uploaded under the "file" field.');
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const sniffed = sniffImageMime(bytes);
  if (!sniffed) {
    throw errors.unsupportedMedia('That file is not a recognisable PNG, JPEG, WebP or AVIF image.');
  }
  assertAcceptedImage(sniffed, bytes.byteLength);

  const perfume = await attachBottleImage(id, bytes, sniffed);
  return ok({ perfume });
});
