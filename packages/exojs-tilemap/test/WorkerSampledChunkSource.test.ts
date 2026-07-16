import { TextureRegion } from '@codexo/exojs';
import { type Texture } from '@codexo/exojs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TileLayer } from '../src/TileLayer';
import { TileSet } from '../src/TileSet';
import { TILE_TRANSFORM_IDENTITY, unpackTile } from '../src/types';
import { createWorkerSampledChunkSource } from '../src/WorkerSampledChunkSource';

// jsdom implements neither `Worker` nor `URL.createObjectURL` (verified empirically —
// both are `undefined` in a fresh JSDOM window). createWorkerSampledChunkSource calls
// `new Blob(...)`, `URL.createObjectURL(...)`, and `new Worker(...)` unconditionally at
// construction time, so all three must be stubbed before any test in this file runs.

class FakeWorker {
  public onmessage: ((event: MessageEvent) => void) | null = null;
  public onerror: ((event: ErrorEvent) => void) | null = null;
  public readonly posted: unknown[] = [];
  public terminated = false;

  public postMessage(message: unknown): void {
    this.posted.push(message);
  }

  public terminate(): void {
    this.terminated = true;
  }

  /** Test helper: simulate the worker replying with a response message. */
  public respond(data: unknown): void {
    this.onmessage?.({ data } as MessageEvent);
  }

  /** Test helper: simulate a global worker failure (e.g. a syntax error). */
  public fail(message: string): void {
    this.onerror?.({ message } as ErrorEvent);
  }
}

let lastWorker: FakeWorker | undefined;

function trackWorker(worker: FakeWorker): void {
  lastWorker = worker;
}

beforeEach(() => {
  lastWorker = undefined;
  class TrackedFakeWorker extends FakeWorker {
    public constructor() {
      super();
      trackWorker(this);
    }
  }
  vi.stubGlobal('Worker', TrackedFakeWorker as unknown as typeof Worker);
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:fake-url'),
    revokeObjectURL: vi.fn(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function fakeTexture(): Texture {
  return {
    width: 512,
    height: 512,
    uid: 0,
    label: 'test',
    destroy: vi.fn(),
    destroyed: false,
  } as unknown as Texture;
}

function makeTileset(): TileSet {
  return new TileSet({
    name: 'tiles',
    texture: new TextureRegion(fakeTexture(), { x: 0, y: 0, width: 512, height: 512 }),
    tileWidth: 32,
    tileHeight: 32,
    tileCount: 16,
  });
}

function makeUnboundedLayer(tileset: TileSet, chunkWidth = 4, chunkHeight = 4): TileLayer {
  return new TileLayer({
    id: 0, name: 'l',
    tileWidth: 16, tileHeight: 16, tilesets: [tileset],
    chunkWidth, chunkHeight,
  });
}

describe('createWorkerSampledChunkSource', () => {
  it('composes a ChunkPayload from a values response', async () => {
    const tileset = makeTileset();
    const layer = makeUnboundedLayer(tileset, 2, 2);
    const source = createWorkerSampledChunkSource(layer, {
      workerSource: '/* unused in this test — FakeWorker never executes it */',
      mapValueToTile: value => (value === 1 ? { tileset, localTileId: 3, transform: TILE_TRANSFORM_IDENTITY } : null),
    });
    const worker = lastWorker!;

    const payloadPromise = source.getChunk(0, 0);
    const request = worker.posted[0] as { requestId: number };
    worker.respond({ requestId: request.requestId, values: new Float64Array([1, 1, 1, 1]) });

    const payload = await payloadPromise;
    expect(payload).not.toBeNull();
    expect(payload!.width).toBe(2);
    expect(payload!.height).toBe(2);
    for (let i = 0; i < 4; i++) {
      expect(unpackTile(payload!.tiles[i])).toEqual({ tilesetIndex: 0, localTileId: 3, transform: TILE_TRANSFORM_IDENTITY });
    }
  });

  it('returns null when every sampled value maps to null', async () => {
    const tileset = makeTileset();
    const layer = makeUnboundedLayer(tileset, 2, 2);
    const source = createWorkerSampledChunkSource(layer, {
      workerSource: '/* unused */',
      mapValueToTile: () => null,
    });
    const worker = lastWorker!;

    const payloadPromise = source.getChunk(0, 0);
    const request = worker.posted[0] as { requestId: number };
    worker.respond({ requestId: request.requestId, values: new Float64Array([0, 0, 0, 0]) });

    expect(await payloadPromise).toBeNull();
  });

  it('clamps cells past a bounded layer\'s width/height to empty', async () => {
    const tileset = makeTileset();
    const layer = new TileLayer({
      id: 0, name: 'l', width: 5, height: 5,
      tileWidth: 16, tileHeight: 16, tilesets: [tileset],
      chunkWidth: 4, chunkHeight: 4,
    });
    const source = createWorkerSampledChunkSource(layer, {
      workerSource: '/* unused */',
      mapValueToTile: () => ({ tileset, localTileId: 7, transform: TILE_TRANSFORM_IDENTITY }),
    });
    const worker = lastWorker!;

    // Chunk (1,0) covers tiles tx=[4,7]; only tx=4 is in-bounds (width=5).
    const payloadPromise = source.getChunk(1, 0);
    const request = worker.posted[0] as { requestId: number };
    worker.respond({ requestId: request.requestId, values: new Float64Array([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]) });

    const payload = await payloadPromise;
    expect(payload).not.toBeNull();
    for (let localTy = 0; localTy < 4; localTy++) {
      expect(unpackTile(payload!.tiles[localTy * 4 + 0])).toEqual({ tilesetIndex: 0, localTileId: 7, transform: TILE_TRANSFORM_IDENTITY });
      expect(payload!.tiles[localTy * 4 + 1]).toBe(0);
      expect(payload!.tiles[localTy * 4 + 2]).toBe(0);
      expect(payload!.tiles[localTy * 4 + 3]).toBe(0);
    }
  });

  it('rejects only the corresponding getChunk() promise on a specific error response', async () => {
    const tileset = makeTileset();
    const layer = makeUnboundedLayer(tileset, 2, 2);
    const source = createWorkerSampledChunkSource(layer, {
      workerSource: '/* unused */',
      mapValueToTile: () => ({ tileset, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY }),
    });
    const worker = lastWorker!;

    const okPromise = source.getChunk(0, 0);
    const failPromise = source.getChunk(1, 0);
    const [okRequest, failRequest] = worker.posted as { requestId: number }[];

    // Respond out of order: the second-issued request fails, the first succeeds.
    worker.respond({ requestId: failRequest.requestId, error: 'boom' });
    worker.respond({ requestId: okRequest.requestId, values: new Float64Array([1, 1, 1, 1]) });

    await expect(failPromise).rejects.toThrow('boom');
    await expect(okPromise).resolves.not.toBeNull();
  });

  it('a global worker.onerror rejects every currently-pending request', async () => {
    const tileset = makeTileset();
    const layer = makeUnboundedLayer(tileset, 2, 2);
    const source = createWorkerSampledChunkSource(layer, {
      workerSource: '/* unused */',
      mapValueToTile: () => null,
    });
    const worker = lastWorker!;

    const promiseA = source.getChunk(0, 0);
    const promiseB = source.getChunk(1, 0);

    worker.fail('syntax error in workerSource');

    await expect(promiseA).rejects.toThrow('syntax error in workerSource');
    await expect(promiseB).rejects.toThrow('syntax error in workerSource');
  });

  it('destroy() rejects in-flight requests, terminates the worker, and is idempotent', async () => {
    const tileset = makeTileset();
    const layer = makeUnboundedLayer(tileset, 2, 2);
    const source = createWorkerSampledChunkSource(layer, {
      workerSource: '/* unused */',
      mapValueToTile: () => null,
    });
    const worker = lastWorker!;

    const pending = source.getChunk(0, 0);
    source.destroy();

    await expect(pending).rejects.toThrow();
    expect(worker.terminated).toBe(true);
    expect(() => source.destroy()).not.toThrow();
  });

  it('getChunk() called after destroy() rejects immediately without posting a message', async () => {
    const tileset = makeTileset();
    const layer = makeUnboundedLayer(tileset, 2, 2);
    const source = createWorkerSampledChunkSource(layer, {
      workerSource: '/* unused */',
      mapValueToTile: () => null,
    });
    const worker = lastWorker!;

    source.destroy();
    const postedCountBefore = worker.posted.length;

    await expect(source.getChunk(0, 0)).rejects.toThrow();
    expect(worker.posted.length).toBe(postedCountBefore);
  });
});
