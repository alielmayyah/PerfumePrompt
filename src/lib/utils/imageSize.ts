/**
 * Reads intrinsic image dimensions from the file header.
 *
 * Needed to rank reference candidates and reject thumbnails: a 150x150 listing
 * thumbnail is worthless as a product-fidelity reference, and the only reliable way
 * to tell is to look at the actual pixels rather than trust a URL that claims
 * "1000x1000". Header-only, so it costs nothing.
 */

export interface ImageDimensions {
  width: number;
  height: number;
}

export function readImageDimensions(bytes: Uint8Array): ImageDimensions | undefined {
  return readPng(bytes) ?? readJpeg(bytes) ?? readWebp(bytes) ?? readGif(bytes) ?? readAvif(bytes);
}

function u16be(b: Uint8Array, o: number): number {
  return ((b[o] ?? 0) << 8) | (b[o + 1] ?? 0);
}
function u32be(b: Uint8Array, o: number): number {
  return (((b[o] ?? 0) << 24) | ((b[o + 1] ?? 0) << 16) | ((b[o + 2] ?? 0) << 8) | (b[o + 3] ?? 0)) >>> 0;
}
function u16le(b: Uint8Array, o: number): number {
  return (b[o] ?? 0) | ((b[o + 1] ?? 0) << 8);
}
function u24le(b: Uint8Array, o: number): number {
  return (b[o] ?? 0) | ((b[o + 1] ?? 0) << 8) | ((b[o + 2] ?? 0) << 16);
}

function readPng(b: Uint8Array): ImageDimensions | undefined {
  if (b.length < 24) return undefined;
  if (!(b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47)) return undefined;
  return { width: u32be(b, 16), height: u32be(b, 20) };
}

/** Walks JPEG segments to the first SOF marker. */
function readJpeg(b: Uint8Array): ImageDimensions | undefined {
  if (b.length < 4 || !(b[0] === 0xff && b[1] === 0xd8)) return undefined;

  let offset = 2;
  while (offset + 9 < b.length) {
    if (b[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = b[offset + 1] ?? 0;

    // Standalone markers carry no length payload.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) break;

    const length = u16be(b, offset + 2);
    if (length < 2) break;

    // SOF0..SOF15, excluding DHT (c4), JPGA (c8) and DAC (cc).
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      return { height: u16be(b, offset + 5), width: u16be(b, offset + 7) };
    }
    offset += 2 + length;
  }
  return undefined;
}

/** Handles the three WebP flavours: lossy VP8, lossless VP8L and extended VP8X. */
function readWebp(b: Uint8Array): ImageDimensions | undefined {
  if (b.length < 30) return undefined;
  const isRiff = b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46;
  const isWebp = b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50;
  if (!isRiff || !isWebp) return undefined;

  const fourcc = String.fromCharCode(b[12] ?? 0, b[13] ?? 0, b[14] ?? 0, b[15] ?? 0);

  if (fourcc === 'VP8 ') {
    // Frame header: 3-byte tag, 3-byte sync code, then 14-bit width/height.
    return { width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff };
  }
  if (fourcc === 'VP8L') {
    // Little-endian bit packing after the 1-byte signature: 14 bits width then
    // 14 bits height, each stored as value-minus-one.
    const packed =
      ((b[21] ?? 0) | ((b[22] ?? 0) << 8) | ((b[23] ?? 0) << 16) | ((b[24] ?? 0) << 24)) >>> 0;
    return {
      width: (packed & 0x3fff) + 1,
      height: ((packed >>> 14) & 0x3fff) + 1,
    };
  }
  if (fourcc === 'VP8X') {
    return { width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 };
  }
  return undefined;
}

/**
 * AVIF and other ISO-BMFF images.
 *
 * Rather than walking the full box tree (meta > iprp > ipco > ispe), this scans for
 * the `ispe` box directly, which is the only place the intrinsic size is declared.
 * That is enough for ranking candidates and avoids a lot of container parsing. The
 * first `ispe` belongs to the primary item in every file produced by real encoders.
 */
function readAvif(b: Uint8Array): ImageDimensions | undefined {
  if (b.length < 32) return undefined;
  const isBmff = b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70;
  if (!isBmff) return undefined;

  // Only scan the header region; `ispe` always precedes the media data.
  const limit = Math.min(b.length - 12, 65_536);
  for (let i = 8; i < limit; i += 1) {
    if (b[i] !== 0x69 || b[i + 1] !== 0x73 || b[i + 2] !== 0x70 || b[i + 3] !== 0x65) continue;
    // fourcc, then 4 bytes version+flags, then width and height as u32be.
    const width = u32be(b, i + 8);
    const height = u32be(b, i + 12);
    if (width > 0 && height > 0 && width < 65_536 && height < 65_536) {
      return { width, height };
    }
  }
  return undefined;
}

function readGif(b: Uint8Array): ImageDimensions | undefined {
  if (b.length < 10) return undefined;
  if (!(b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46)) return undefined;
  return { width: u16le(b, 6), height: u16le(b, 8) };
}
