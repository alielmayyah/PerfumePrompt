import {
  ACCEPTED_IMAGE_MIME_TYPES,
  MAX_UPLOAD_BYTES,
  type AcceptedImageMimeType,
} from '@/lib/config/constants';
import { errors } from '@/lib/errors';

export interface ImagePayload {
  /** Raw base64 (no data-URL prefix). */
  base64: string;
  mimeType: string;
  byteLength: number;
}

const DATA_URL_RE = /^data:(?<mime>[a-z]+\/[a-z0-9.+-]+);base64,(?<data>[A-Za-z0-9+/=\s]+)$/i;

export function isAcceptedImageMime(value: string): value is AcceptedImageMimeType {
  return (ACCEPTED_IMAGE_MIME_TYPES as readonly string[]).includes(value.toLowerCase());
}

export function assertAcceptedImage(mimeType: string, byteLength: number): void {
  if (!isAcceptedImageMime(mimeType)) {
    throw errors.unsupportedMedia(
      `Unsupported image type "${mimeType}". Use PNG, JPEG, WebP or AVIF.`,
    );
  }
  if (byteLength <= 0) {
    throw errors.validation('The uploaded file is empty.');
  }
  if (byteLength > MAX_UPLOAD_BYTES) {
    throw errors.tooLarge(
      `Image is ${(byteLength / 1_048_576).toFixed(1)} MB. The limit is ${MAX_UPLOAD_BYTES / 1_048_576} MB.`,
    );
  }
}

/**
 * Sniffs the real image type from magic bytes. Browsers and clients can lie about
 * `Content-Type`, and the image model rejects mismatched mime types.
 */
export function sniffImageMime(bytes: Uint8Array): string | undefined {
  const at = (i: number) => bytes[i] ?? -1;
  if (at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47) return 'image/png';
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return 'image/jpeg';
  if (
    at(0) === 0x52 &&
    at(1) === 0x49 &&
    at(2) === 0x46 &&
    at(3) === 0x46 &&
    at(8) === 0x57 &&
    at(9) === 0x45 &&
    at(10) === 0x42 &&
    at(11) === 0x50
  ) {
    return 'image/webp';
  }
  // ISO-BMFF: "ftyp" at offset 4, brand at 8 (avif / avis).
  if (at(4) === 0x66 && at(5) === 0x74 && at(6) === 0x79 && at(7) === 0x70) {
    const brand = String.fromCharCode(at(8), at(9), at(10), at(11)).toLowerCase();
    if (brand === 'avif' || brand === 'avis') return 'image/avif';
  }
  return undefined;
}

export function extensionForMime(mimeType: string): string {
  switch (mimeType.toLowerCase()) {
    case 'image/png':
      return 'png';
    case 'image/jpeg':
      return 'jpg';
    case 'image/webp':
      return 'webp';
    case 'image/avif':
      return 'avif';
    default:
      return 'bin';
  }
}

export function parseDataUrl(dataUrl: string): ImagePayload {
  const match = DATA_URL_RE.exec(dataUrl.trim());
  const mime = match?.groups?.['mime'];
  const data = match?.groups?.['data'];
  if (!mime || !data) {
    throw errors.validation('Expected a base64 data URL.');
  }
  const base64 = data.replace(/\s+/g, '');
  return {
    base64,
    mimeType: mime.toLowerCase(),
    byteLength: Math.floor((base64.length * 3) / 4),
  };
}

export function toDataUrl(payload: Pick<ImagePayload, 'base64' | 'mimeType'>): string {
  return `data:${payload.mimeType};base64,${payload.base64}`;
}

export function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

export function base64ToBytes(base64: string): Uint8Array {
  return new Uint8Array(Buffer.from(base64, 'base64'));
}
