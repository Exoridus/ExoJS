import { describe, expect, test } from 'vitest';

import { inflateKtx2Levels, parseKtx2 } from '#assets/factories/ktx2';
import { compressedLevelByteLength, CompressedTextureFormat } from '#rendering/texture/CompressedTextureFormat';

import { ktx2Dfd } from './ktx2-dfd';

const headerBytes = 80;
const levelEntryBytes = 24;
const dfd = ktx2Dfd(145);
const dfdBytes = dfd.length;
const identifier = [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a];

const align8 = (value: number): number => Math.ceil(value / 8) * 8;
// BC7 levels start on 16 bytes.
const align16 = (value: number): number => Math.ceil(value / 16) * 16;

const join = (chunks: readonly Uint8Array[]): Uint8Array => {
  const result = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0));
  let cursor = 0;

  for (const chunk of chunks) {
    result.set(chunk, cursor);
    cursor += chunk.byteLength;
  }

  return result;
};

const deflate = async (data: Uint8Array<ArrayBuffer>): Promise<Uint8Array> => {
  const stream = new CompressionStream('deflate');
  const writer = stream.writable.getWriter();
  const reader = stream.readable.getReader();
  const pump = (async (): Promise<void> => {
    await writer.write(data);
    await writer.close();
  })();
  const chunks: Uint8Array[] = [];

  for (;;) {
    const { done, value } = await reader.read();

    if (done) break;
    chunks.push(value);
  }

  await pump;

  return join(chunks);
};

const buildPlain = (): ArrayBuffer => {
  const lengths = [
    compressedLevelByteLength(CompressedTextureFormat.Bc7RgbaUnorm, 8, 8),
    compressedLevelByteLength(CompressedTextureFormat.Bc7RgbaUnorm, 4, 4),
  ];
  const dfdOffset = headerBytes + lengths.length * levelEntryBytes;
  const dataOffset = align16(dfdOffset + dfdBytes);
  const buffer = new ArrayBuffer(dataOffset + lengths.reduce((total, length) => total + length, 0));
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  bytes.set(identifier);
  view.setUint32(12, 145, true);
  view.setUint32(16, 1, true);
  view.setUint32(20, 8, true);
  view.setUint32(24, 8, true);
  view.setUint32(36, 1, true);
  view.setUint32(40, lengths.length, true);
  view.setUint32(48, dfdOffset, true);
  view.setUint32(52, dfdBytes, true);
  bytes.set(dfd, dfdOffset);

  let cursor = dataOffset + lengths.reduce((total, length) => total + length, 0);

  for (let index = lengths.length - 1; index >= 0; index--) {
    const length = lengths[index]!;

    cursor -= length;
    view.setUint32(headerBytes + index * levelEntryBytes, cursor, true);
    view.setUint32(headerBytes + index * levelEntryBytes + 8, length, true);
    view.setUint32(headerBytes + index * levelEntryBytes + 16, length, true);
    bytes.fill(index + 1, cursor, cursor + length);
  }

  return buffer;
};

const zlibKtx2 = async (): Promise<ArrayBuffer> => {
  const plain = buildPlain();
  const source = new Uint8Array(plain);
  const view = new DataView(plain);
  const entries = [0, 1].map(index => ({
    index,
    offset: view.getUint32(headerBytes + index * levelEntryBytes, true),
    length: view.getUint32(headerBytes + index * levelEntryBytes + 8, true),
  }));
  const compressed = await Promise.all(entries.map(entry => deflate(source.subarray(entry.offset, entry.offset + entry.length))));
  const prefix = Math.min(...entries.map(entry => entry.offset));
  const result = new Uint8Array(compressed.reduce((total, level) => align8(total + level.byteLength), align8(prefix)));
  const resultView = new DataView(result.buffer);

  result.set(source.subarray(0, prefix));
  resultView.setUint32(44, 3, true);
  let cursor = align8(prefix);

  for (const entry of [...entries].sort((a, b) => a.offset - b.offset)) {
    const level = compressed[entry.index]!;

    result.set(level, cursor);
    resultView.setUint32(headerBytes + entry.index * levelEntryBytes, cursor, true);
    resultView.setUint32(headerBytes + entry.index * levelEntryBytes + 8, level.byteLength, true);
    resultView.setUint32(headerBytes + entry.index * levelEntryBytes + 16, entry.length, true);
    cursor = align8(cursor + level.byteLength);
  }

  return result.buffer;
};

describe('KTX2 ZLIB inflation', () => {
  test('inflates every validated level into a parser-ready mip chain', async () => {
    const payload = parseKtx2(await inflateKtx2Levels(await zlibKtx2(), 'mips.ktx2'), 'mips.ktx2');

    expect(payload.kind).toBe('compressed');
    expect(payload.kind === 'compressed' && payload.levels.map(level => [level.width, level.height, level.data[0]])).toEqual([
      [8, 8, 1],
      [4, 4, 2],
    ]);
  });

  test('rejects a stream that exceeds its declared output before buffering it', async () => {
    const buffer = await zlibKtx2();

    new DataView(buffer).setUint32(headerBytes + 16, 8, true);

    await expect(inflateKtx2Levels(buffer, 'overflow.ktx2')).rejects.toThrow(/inflates to \d+ bytes but declares 8/);
  });

  test('rejects a truncated ZLIB stream with a KTX2 diagnostic', async () => {
    const buffer = await zlibKtx2();
    const view = new DataView(buffer);
    const offset = view.getUint32(headerBytes, true);
    const length = view.getUint32(headerBytes + 8, true);

    view.setUint32(headerBytes + 8, length - 1, true);
    new Uint8Array(buffer)[offset + length - 1] = 0;

    await expect(inflateKtx2Levels(buffer, 'truncated.ktx2')).rejects.toThrow(/complete ZLIB stream/);
  });

  test('rejects declared output beyond the decoded-byte budget before allocation', async () => {
    const buffer = await zlibKtx2();

    new DataView(buffer).setUint32(headerBytes + 16, 0x2000_0000, true);

    await expect(inflateKtx2Levels(buffer, 'bomb.ktx2')).rejects.toThrow(/ZLIB safety budget/);
  });

  test('preserves an AbortError when cancelled before streaming', async () => {
    const controller = new AbortController();

    controller.abort();

    await expect(inflateKtx2Levels(await zlibKtx2(), 'cancelled.ktx2', controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });
});
