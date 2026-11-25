/**
 * Container-level demuxer for animated GIF, APNG and animated WebP. It splits an
 * encoded file into per-frame placement, timing and disposal data plus a
 * standalone still image for each frame, so a browser that cannot decode
 * animations natively can still decode every frame with createImageBitmap and
 * compose them itself.
 * @internal
 */
import type { AnimatedImageMime } from './animatedImageMime';

export type FrameDispose = 'none' | 'background' | 'previous';
export type FrameBlend = 'source' | 'over';

export interface DemuxedFrame {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly durationMs: number;
  readonly dispose: FrameDispose;
  readonly blend: FrameBlend;
  /** Builds a complete single-frame file of the same format, decodable on its own. */
  readonly still: () => Uint8Array;
  readonly stillType: AnimatedImageMime;
}

export interface DemuxedAnimation {
  readonly width: number;
  readonly height: number;
  /** Repeats after the first play; Infinity repeats forever. */
  readonly repetitions: number;
  readonly frames: readonly DemuxedFrame[];
}

/** Browsers display a frame whose delay is 10 ms or less for 100 ms. */
const normalizeDelay = (ms: number): number => (ms <= 10 ? 100 : ms);

const u16le = (b: Uint8Array, p: number): number => b[p]! | (b[p + 1]! << 8);
const u24le = (b: Uint8Array, p: number): number => b[p]! | (b[p + 1]! << 8) | (b[p + 2]! << 16);
const u32le = (b: Uint8Array, p: number): number => (b[p]! | (b[p + 1]! << 8) | (b[p + 2]! << 16) | (b[p + 3]! << 24)) >>> 0;
const u32be = (b: Uint8Array, p: number): number => ((b[p]! << 24) | (b[p + 1]! << 16) | (b[p + 2]! << 8) | b[p + 3]!) >>> 0;
const u16be = (b: Uint8Array, p: number): number => (b[p]! << 8) | b[p + 1]!;
const tag = (b: Uint8Array, p: number): string => String.fromCharCode(b[p]!, b[p + 1]!, b[p + 2]!, b[p + 3]!);

const concat = (parts: readonly Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;

  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }

  return out;
};

const gifDispose = (method: number): FrameDispose => {
  if (method === 2) {
    return 'background';
  }

  return method === 3 ? 'previous' : 'none';
};

const apngDispose = (method: number): FrameDispose => {
  if (method === 1) {
    return 'background';
  }

  return method === 2 ? 'previous' : 'none';
};

// -- GIF -------------------------------------------------------------------

const readGifSubblocks = (b: Uint8Array, start: number): { end: number; data: Uint8Array } | null => {
  const chunks: Uint8Array[] = [];
  let p = start;

  while (p < b.length) {
    const size = b[p++]!;

    if (size === 0) {
      return { end: p, data: concat(chunks) };
    }

    if (p + size > b.length) {
      return null;
    }

    chunks.push(b.subarray(p, p + size));
    p += size;
  }

  return null;
};

const demuxGif = (b: Uint8Array): DemuxedAnimation | null => {
  if (b.length < 13) {
    return null;
  }

  const width = u16le(b, 6);
  const height = u16le(b, 8);
  const flags = b[10]!;
  const globalSize = (flags & 0x80) === 0 ? 0 : 3 * 2 ** ((flags & 0x07) + 1);
  const globalTable = b.subarray(13, 13 + globalSize);
  let p = 13 + globalSize;
  let repetitions = 0;
  let pending: { delay: number; dispose: FrameDispose; transparent: number } = { delay: 100, dispose: 'none', transparent: -1 };
  const frames: DemuxedFrame[] = [];

  while (p < b.length) {
    const block = b[p++]!;

    if (block === 0x3b) {
      break;
    }

    if (block === 0x21) {
      const label = b[p++]!;

      if (label === 0xf9 && b[p] === 4) {
        const packed = b[p + 1]!;
        const method = (packed >> 2) & 7;

        pending = {
          delay: normalizeDelay(u16le(b, p + 2) * 10),
          dispose: gifDispose(method),
          transparent: (packed & 1) === 0 ? -1 : b[p + 4]!,
        };
      }

      const sub = readGifSubblocks(b, p);

      if (sub === null) {
        return null;
      }

      if (
        label === 0xff &&
        sub.data.length >= 14 &&
        sub.data[11] === 1 &&
        String.fromCharCode(...sub.data.subarray(0, 11)) === 'NETSCAPE2.0'
      ) {
        const count = u16le(sub.data, 12);

        repetitions = count === 0 ? Number.POSITIVE_INFINITY : count;
      }

      p = sub.end;
    } else if (block === 0x2c) {
      if (p + 9 > b.length) {
        return null;
      }

      const x = u16le(b, p);
      const y = u16le(b, p + 2);
      const w = u16le(b, p + 4);
      const h = u16le(b, p + 6);
      const imageFlags = b[p + 8]!;
      const localSize = (imageFlags & 0x80) === 0 ? 0 : 3 * 2 ** ((imageFlags & 0x07) + 1);
      const table = localSize > 0 ? b.subarray(p + 9, p + 9 + localSize) : globalTable;
      const dataStart = p + 9 + localSize;
      const sub = readGifSubblocks(b, dataStart + 1);

      if (dataStart >= b.length || sub === null || w === 0 || h === 0) {
        return null;
      }

      const tableBits = Math.max(1, Math.ceil(Math.log2(Math.max(2, table.length / 3))));
      const padded = new Uint8Array(3 * 2 ** tableBits);

      padded.set(table.subarray(0, padded.length));

      const gce = pending.transparent >= 0 ? [0x21, 0xf9, 4, 1, 0, 0, pending.transparent, 0] : [];
      const imageData = b.subarray(dataStart, sub.end);
      const still = (): Uint8Array =>
        concat([
          Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, w & 255, w >> 8, h & 255, h >> 8, 0x80 | (tableBits - 1), 0, 0]),
          padded,
          Uint8Array.from(gce),
          Uint8Array.from([0x2c, 0, 0, 0, 0, w & 255, w >> 8, h & 255, h >> 8, imageFlags & 0x40]),
          imageData,
          Uint8Array.of(0x3b),
        ]);

      frames.push({
        x,
        y,
        width: w,
        height: h,
        durationMs: pending.delay,
        dispose: pending.dispose,
        blend: 'over',
        still,
        stillType: 'image/gif',
      });
      pending = { delay: 100, dispose: 'none', transparent: -1 };
      p = sub.end;
    } else {
      return null;
    }
  }

  return frames.length < 2 ? null : { width, height, repetitions, frames };
};

// -- PNG / APNG ------------------------------------------------------------

let crcTable: Uint32Array | null = null;

const crc32 = (parts: readonly Uint8Array[]): number => {
  if (crcTable === null) {
    crcTable = new Uint32Array(256);

    for (let n = 0; n < 256; n++) {
      let c = n;

      for (let k = 0; k < 8; k++) {
        c = (c & 1) === 0 ? c >>> 1 : 0xedb88320 ^ (c >>> 1);
      }

      crcTable[n] = c >>> 0;
    }
  }

  let crc = 0xffffffff;

  for (const part of parts) {
    for (let i = 0; i < part.length; i++) {
      crc = crcTable[(crc ^ part[i]!) & 0xff]! ^ (crc >>> 8);
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
};

const pngChunk = (type: string, data: Uint8Array): Uint8Array => {
  const typeBytes = Uint8Array.from(type, char => char.charCodeAt(0));
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);

  view.setUint32(0, data.length);
  out.set(typeBytes, 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32([typeBytes, data]));

  return out;
};

const pngSignature = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const demuxApng = (b: Uint8Array): DemuxedAnimation | null => {
  let p = 8;
  let ihdr: Uint8Array | null = null;
  let plays = 0;
  const shared: Uint8Array[] = [];
  const raw: Array<{ control: Uint8Array | null; data: Uint8Array[] }> = [];
  let current: { control: Uint8Array | null; data: Uint8Array[] } | null = null;
  let seenIdat = false;
  let pendingControl: Uint8Array | null = null;

  while (p + 12 <= b.length) {
    const length = u32be(b, p);
    const type = tag(b, p + 4);
    const data = b.subarray(p + 8, p + 8 + length);

    if (p + 12 + length > b.length) {
      return null;
    }

    if (type === 'IHDR') {
      ihdr = data;
    } else if (type === 'acTL') {
      plays = u32be(data, 4);
    } else if (type === 'fcTL') {
      pendingControl = data;

      if (seenIdat || current !== null) {
        current = { control: data, data: [] };
        raw.push(current);
      }
    } else if (type === 'IDAT') {
      if (!seenIdat) {
        seenIdat = true;
        // The default image is frame zero only when an fcTL precedes it.
        current = { control: pendingControl, data: [] };

        if (pendingControl !== null) {
          raw.push(current);
        }
      }

      current!.data.push(data);
    } else if (type === 'fdAT') {
      current?.data.push(data.subarray(4));
    } else if (type === 'IEND') {
      break;
    } else if (!seenIdat) {
      shared.push(b.subarray(p, p + 12 + length));
    }

    p += 12 + length;
  }

  if (ihdr === null || raw.length < 2) {
    return null;
  }

  const frames: DemuxedFrame[] = [];

  for (const entry of raw) {
    const c = entry.control;

    if (c === null || c.length < 26 || entry.data.length === 0) {
      return null;
    }

    const w = u32be(c, 4);
    const h = u32be(c, 8);
    const header = new Uint8Array(ihdr);
    const view = new DataView(header.buffer, header.byteOffset, header.byteLength);

    view.setUint32(0, w);
    view.setUint32(4, h);

    const den = u16be(c, 22);
    const delay = (u16be(c, 20) / (den === 0 ? 100 : den)) * 1000;
    const dispose = c[24]!;

    frames.push({
      x: u32be(c, 12),
      y: u32be(c, 16),
      width: w,
      height: h,
      durationMs: normalizeDelay(delay),
      dispose: apngDispose(dispose),
      blend: c[25] === 1 ? 'over' : 'source',
      still: () =>
        concat([
          pngSignature,
          pngChunk('IHDR', header),
          ...shared,
          ...entry.data.map(part => pngChunk('IDAT', part)),
          pngChunk('IEND', new Uint8Array(0)),
        ]),
      stillType: 'image/png',
    });
  }

  return {
    width: u32be(ihdr, 0),
    height: u32be(ihdr, 4),
    repetitions: plays === 0 ? Number.POSITIVE_INFINITY : plays - 1,
    frames,
  };
};

// -- WebP ------------------------------------------------------------------

const riffChunk = (type: string, data: Uint8Array): Uint8Array => {
  const out = new Uint8Array(8 + data.length + (data.length & 1));
  const view = new DataView(out.buffer);

  out.set(
    Uint8Array.from(type, char => char.charCodeAt(0)),
    0,
  );
  view.setUint32(4, data.length, true);
  out.set(data, 8);

  return out;
};

const standaloneWebp = (width: number, height: number, payload: Uint8Array): Uint8Array => {
  const vp8x = new Uint8Array(10);

  vp8x[0] = 0x10;
  vp8x[4] = (width - 1) & 255;
  vp8x[5] = ((width - 1) >> 8) & 255;
  vp8x[6] = ((width - 1) >> 16) & 255;
  vp8x[7] = (height - 1) & 255;
  vp8x[8] = ((height - 1) >> 8) & 255;
  vp8x[9] = ((height - 1) >> 16) & 255;

  const body = concat([Uint8Array.from([0x57, 0x45, 0x42, 0x50]), riffChunk('VP8X', vp8x), payload]);
  const out = concat([Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0]), body]);

  new DataView(out.buffer).setUint32(4, body.length, true);

  return out;
};

const demuxWebp = (b: Uint8Array): DemuxedAnimation | null => {
  let p = 12;
  let width = 0;
  let height = 0;
  let loops = 0;
  const frames: DemuxedFrame[] = [];

  while (p + 8 <= b.length) {
    const type = tag(b, p);
    const length = u32le(b, p + 4);
    const data = b.subarray(p + 8, p + 8 + length);

    if (p + 8 + length > b.length) {
      return null;
    }

    if (type === 'VP8X' && length >= 10) {
      width = u24le(data, 4) + 1;
      height = u24le(data, 7) + 1;
    } else if (type === 'ANIM' && length >= 6) {
      loops = u16le(data, 4);
    } else if (type === 'ANMF' && length > 16) {
      const w = u24le(data, 6) + 1;
      const h = u24le(data, 9) + 1;
      const flags = data[15]!;

      frames.push({
        x: u24le(data, 0) * 2,
        y: u24le(data, 3) * 2,
        width: w,
        height: h,
        durationMs: normalizeDelay(u24le(data, 12)),
        dispose: (flags & 1) === 0 ? 'none' : 'background',
        blend: (flags & 2) === 0 ? 'over' : 'source',
        still: () => standaloneWebp(w, h, data.subarray(16)),
        stillType: 'image/webp',
      });
    }

    p += 8 + length + (length & 1);
  }

  return frames.length < 2 || width === 0
    ? null
    : { width, height, repetitions: loops === 0 ? Number.POSITIVE_INFINITY : loops - 1, frames };
};

/** Splits an encoded animated image into frames; `null` when the structure is invalid or has fewer than two frames. */
export const demuxAnimatedImage = (encoded: ArrayBuffer, type: AnimatedImageMime): DemuxedAnimation | null => {
  const bytes = new Uint8Array(encoded);

  try {
    switch (type) {
      case 'image/gif':
        return demuxGif(bytes);
      case 'image/png':
        return demuxApng(bytes);
      case 'image/webp':
        return demuxWebp(bytes);
    }
  } catch {
    return null;
  }
};
