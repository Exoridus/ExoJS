import { describe, expect, it } from 'vitest';

import { decodeTiledLayerData } from '../src/decodeLayerData';
import { TiledFormatError } from '../src/validate';

// ── Helpers ───────────────────────────────────────────────────────────────

function gidsToBytes(gids: readonly number[]): Uint8Array {
  const buffer = new ArrayBuffer(gids.length * 4);
  const view = new DataView(buffer);
  gids.forEach((g, i) => view.setUint32(i * 4, g, true)); // little-endian
  return new Uint8Array(buffer);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

async function compress(bytes: Uint8Array, format: 'gzip' | 'deflate'): Promise<Uint8Array> {
  const source = new ReadableStream<BufferSource>({
    start(controller) {
      controller.enqueue(bytes as BufferSource);
      controller.close();
    },
  });
  const reader = source.pipeThrough(new CompressionStream(format)).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function makeRawMap(layer: Record<string, unknown>): Record<string, unknown> {
  return { type: 'map', layers: [layer] };
}

const GIDS = [1, 2, 3, 0, 5, 8, 0, 1];

// ── Tests ─────────────────────────────────────────────────────────────────

describe('decodeTiledLayerData', () => {
  it('leaves CSV (plain array) data untouched', async () => {
    const raw = makeRawMap({ type: 'tilelayer', data: [...GIDS] });
    await decodeTiledLayerData(raw, 'test.tmj');
    expect((raw.layers as Record<string, unknown>[])[0].data).toEqual(GIDS);
  });

  it('decodes uncompressed base64 to a GID array and drops the markers', async () => {
    const raw = makeRawMap({
      type: 'tilelayer',
      encoding: 'base64',
      data: bytesToBase64(gidsToBytes(GIDS)),
    });
    await decodeTiledLayerData(raw, 'test.tmj');
    const layer = (raw.layers as Record<string, unknown>[])[0];
    expect(layer.data).toEqual(GIDS);
    expect(layer.encoding).toBeUndefined();
    expect(layer.compression).toBeUndefined();
  });

  it('decodes base64 + gzip', async () => {
    const raw = makeRawMap({
      type: 'tilelayer',
      encoding: 'base64',
      compression: 'gzip',
      data: bytesToBase64(await compress(gidsToBytes(GIDS), 'gzip')),
    });
    await decodeTiledLayerData(raw, 'test.tmj');
    expect((raw.layers as Record<string, unknown>[])[0].data).toEqual(GIDS);
  });

  it('decodes base64 + zlib (deflate)', async () => {
    const raw = makeRawMap({
      type: 'tilelayer',
      encoding: 'base64',
      compression: 'zlib',
      data: bytesToBase64(await compress(gidsToBytes(GIDS), 'deflate')),
    });
    await decodeTiledLayerData(raw, 'test.tmj');
    expect((raw.layers as Record<string, unknown>[])[0].data).toEqual(GIDS);
  });

  it('decodes base64 chunk data (infinite-map shape)', async () => {
    const raw = makeRawMap({
      type: 'tilelayer',
      encoding: 'base64',
      chunks: [{ x: 0, y: 0, width: 4, height: 2, data: bytesToBase64(gidsToBytes(GIDS)) }],
    });
    await decodeTiledLayerData(raw, 'test.tmj');
    const chunk = ((raw.layers as Record<string, unknown>[])[0].chunks as Record<string, unknown>[])[0];
    expect(chunk.data).toEqual(GIDS);
  });

  it('recurses into group layers', async () => {
    const raw = makeRawMap({
      type: 'group',
      layers: [{ type: 'tilelayer', encoding: 'base64', data: bytesToBase64(gidsToBytes(GIDS)) }],
    });
    await decodeTiledLayerData(raw, 'test.tmj');
    const inner = ((raw.layers as Record<string, unknown>[])[0].layers as Record<string, unknown>[])[0];
    expect(inner.data).toEqual(GIDS);
  });

  it('rejects zstd compression with a clear error', async () => {
    const raw = makeRawMap({
      type: 'tilelayer',
      encoding: 'base64',
      compression: 'zstd',
      data: bytesToBase64(gidsToBytes(GIDS)),
    });
    await expect(decodeTiledLayerData(raw, 'test.tmj')).rejects.toThrow(TiledFormatError);
    await expect(decodeTiledLayerData(raw, 'test.tmj')).rejects.toThrow(/zstd/);
  });

  it('throws on a byte length that is not a multiple of 4', async () => {
    const raw = makeRawMap({
      type: 'tilelayer',
      encoding: 'base64',
      data: bytesToBase64(new Uint8Array([1, 2, 3])), // 3 bytes
    });
    await expect(decodeTiledLayerData(raw, 'test.tmj')).rejects.toThrow(TiledFormatError);
  });

  it('rejects an unrecognised (non-empty) compression value', async () => {
    const raw = makeRawMap({
      type: 'tilelayer',
      encoding: 'base64',
      compression: 'rle',
      data: bytesToBase64(gidsToBytes(GIDS)),
    });
    await expect(decodeTiledLayerData(raw, 'test.tmj')).rejects.toThrow(TiledFormatError);
    await expect(decodeTiledLayerData(raw, 'test.tmj')).rejects.toThrow(/unsupported tile layer compression/);
  });

  it('skips a non-object entry in the chunks array', async () => {
    const raw = makeRawMap({
      type: 'tilelayer',
      encoding: 'base64',
      chunks: [null, { x: 0, y: 0, width: 4, height: 2, data: bytesToBase64(gidsToBytes(GIDS)) }],
    });
    await decodeTiledLayerData(raw, 'test.tmj');
    const layer = (raw.layers as Record<string, unknown>[])[0];
    const chunks = layer.chunks as unknown[];
    expect(chunks[0]).toBeNull();
    expect((chunks[1] as Record<string, unknown>).data).toEqual(GIDS);
  });

  it('leaves a chunk whose data is not a string untouched', async () => {
    const raw = makeRawMap({
      type: 'tilelayer',
      encoding: 'base64',
      chunks: [{ x: 0, y: 0, width: 1, height: 1 }], // no "data" field
    });
    await decodeTiledLayerData(raw, 'test.tmj');
    const layer = (raw.layers as Record<string, unknown>[])[0];
    const chunk = (layer.chunks as Record<string, unknown>[])[0];
    expect(chunk.data).toBeUndefined();
  });

  it('skips a non-object entry in a layers array', async () => {
    const raw = makeRawMap({ type: 'tilelayer', data: [...GIDS] });
    (raw.layers as unknown[]).unshift('not-a-layer-object');
    await decodeTiledLayerData(raw, 'test.tmj');
    const layers = raw.layers as unknown[];
    expect(layers[0]).toBe('not-a-layer-object');
    expect((layers[1] as Record<string, unknown>).data).toEqual(GIDS);
  });

  it('returns a non-object raw document unchanged without throwing', async () => {
    await expect(decodeTiledLayerData('not a map', 'test.tmj')).resolves.toBe('not a map');
    await expect(decodeTiledLayerData(null, 'test.tmj')).resolves.toBeNull();
  });
});
