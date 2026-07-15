import { TextureRegion } from '@codexo/exojs';
import { type Texture } from '@codexo/exojs';
import { View } from '@codexo/exojs';
import { describe, expect, it, vi } from 'vitest';

import type { ChunkPayload, ChunkSource } from '../src/ChunkSource';
import { ChunkStreamer } from '../src/ChunkStreamer';
import { TileLayer } from '../src/TileLayer';
import { TileSet } from '../src/TileSet';
import { tileToChunkCoord } from '../src/types';

// ── helpers ────────────────────────────────────────────────────────────

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

function makeUnboundedLayer(tileset: TileSet, chunkSize = 4, tileSize = 16): TileLayer {
  return new TileLayer({
    id: 0, name: 'l',
    tileWidth: tileSize, tileHeight: tileSize, tilesets: [tileset],
    chunkWidth: chunkSize, chunkHeight: chunkSize,
  });
}

/** Always returns a valid (all-empty-tile) payload for any coordinate. */
function makeAlwaysAvailableSource(chunkSize = 4): ChunkSource {
  return {
    getChunk: (): ChunkPayload => ({
      width: chunkSize,
      height: chunkSize,
      tiles: new Uint32Array(chunkSize * chunkSize),
    }),
  };
}

/** Computes the expected wanted chunk range using the same public helpers ChunkStreamer uses internally. */
function expectedCoreRange(layer: TileLayer, view: View): { minCx: number; minCy: number; maxCx: number; maxCy: number } {
  const bounds = view.getBounds();
  const topLeftTile = layer.pixelToTile(bounds.left, bounds.top);
  const bottomRightTile = layer.pixelToTile(bounds.right, bounds.bottom);
  const topLeftChunk = tileToChunkCoord(topLeftTile.tx, topLeftTile.ty, layer.chunkWidth, layer.chunkHeight);
  const bottomRightChunk = tileToChunkCoord(bottomRightTile.tx, bottomRightTile.ty, layer.chunkWidth, layer.chunkHeight);
  return { minCx: topLeftChunk.cx, minCy: topLeftChunk.cy, maxCx: bottomRightChunk.cx, maxCy: bottomRightChunk.cy };
}

// ═══════════════════════════════════════════════════════════════════════

describe('ChunkStreamer construction', () => {
  it('rejects unloadRadius < loadRadius', () => {
    const tileset = makeTileset();
    const layer = makeUnboundedLayer(tileset);
    const view = new View(0, 0, 64, 64);
    expect(() => new ChunkStreamer(layer, makeAlwaysAvailableSource(), view, { loadRadius: 3, unloadRadius: 1 }))
      .toThrow(/unloadRadius.*loadRadius/);
  });

  it('accepts unloadRadius === loadRadius', () => {
    const tileset = makeTileset();
    const layer = makeUnboundedLayer(tileset);
    const view = new View(0, 0, 64, 64);
    expect(() => new ChunkStreamer(layer, makeAlwaysAvailableSource(), view, { loadRadius: 2, unloadRadius: 2 }))
      .not.toThrow();
  });
});

describe('ChunkStreamer.update() — sync provider, load range', () => {
  it('first update() loads every chunk in core-range + default loadRadius(1), and nothing further out', () => {
    const tileset = makeTileset();
    const layer = makeUnboundedLayer(tileset);
    const view = new View(0, 0, 64, 64);
    const streamer = new ChunkStreamer(layer, makeAlwaysAvailableSource(), view);

    streamer.update();

    const core = expectedCoreRange(layer, view);
    for (let cy = core.minCy - 1; cy <= core.maxCy + 1; cy++) {
      for (let cx = core.minCx - 1; cx <= core.maxCx + 1; cx++) {
        expect(layer.getChunk(cx, cy), `expected (${cx},${cy}) loaded`).toBeDefined();
      }
    }
    expect(layer.getChunk(core.minCx - 2, core.minCy - 2)).toBeUndefined();
    expect(layer.getChunk(core.maxCx + 2, core.maxCy + 2)).toBeUndefined();
  });

  it('residentCount matches the number of chunks actually adopted', () => {
    const tileset = makeTileset();
    const layer = makeUnboundedLayer(tileset);
    const view = new View(0, 0, 64, 64);
    const streamer = new ChunkStreamer(layer, makeAlwaysAvailableSource(), view);

    streamer.update();

    const core = expectedCoreRange(layer, view);
    const expectedCount = (core.maxCx - core.minCx + 1 + 2) * (core.maxCy - core.minCy + 1 + 2);
    expect(streamer.residentCount).toBe(expectedCount);
  });

  it('works on a bounded layer too, clamped to chunkRange()', () => {
    const tileset = makeTileset();
    const layer = new TileLayer({
      id: 0, name: 'l', width: 8, height: 8,
      tileWidth: 16, tileHeight: 16, tilesets: [tileset],
      chunkWidth: 4, chunkHeight: 4,
    }); // chunkRange() = {minCx:0,minCy:0,maxCx:1,maxCy:1}
    const view = new View(200, 200, 64, 64); // far outside the map, near the edge in chunk-range-clamped terms
    const streamer = new ChunkStreamer(layer, makeAlwaysAvailableSource(), view, { loadRadius: 5, unloadRadius: 5 });

    streamer.update();

    const range = layer.chunkRange()!;
    for (const chunk of layer.loadedChunks()) {
      expect(chunk.cx).toBeGreaterThanOrEqual(range.minCx);
      expect(chunk.cx).toBeLessThanOrEqual(range.maxCx);
      expect(chunk.cy).toBeGreaterThanOrEqual(range.minCy);
      expect(chunk.cy).toBeLessThanOrEqual(range.maxCy);
    }
  });
});

describe('ChunkStreamer.update() — unload hysteresis', () => {
  it('a chunk beyond unloadRadius is evicted; a chunk within [loadRadius, unloadRadius] stays resident', () => {
    const tileset = makeTileset();
    const layer = makeUnboundedLayer(tileset, 4, 10);
    const view = new View(20, 20, 40, 40); // exactly spans chunk (0,0)'s pixel extent
    const streamer = new ChunkStreamer(layer, makeAlwaysAvailableSource(), view, { loadRadius: 1, unloadRadius: 2 });

    streamer.update();
    const initialCore = expectedCoreRange(layer, view);
    // The near corner of the streamer's OWN initial load range — must come from
    // a chunk the streamer itself adopted (via its own `_source`), not a chunk
    // installed directly on the layer: `ChunkStreamer` only ever evicts chunks
    // in its own resident set, by design (see the class's own JSDoc) — a
    // directly-`_adoptChunk`'d chunk from "another source" is deliberately left
    // alone even once it falls outside every radius.
    const cornerCx = initialCore.minCx - 1;
    const cornerCy = initialCore.minCy - 1;
    expect(layer.getChunk(cornerCx, cornerCy)).toBeDefined();

    view.setCenter(20 + 100 * 4 * 10, 20); // move 100 chunk-widths to the right — far beyond unloadRadius
    streamer.update();

    expect(layer.getChunk(cornerCx, cornerCy)).toBeUndefined();
  });

  it('moving the view by less than unloadRadius keeps previously-loaded chunks resident', () => {
    const tileset = makeTileset();
    const layer = makeUnboundedLayer(tileset, 4, 10);
    const view = new View(20, 20, 40, 40);
    const streamer = new ChunkStreamer(layer, makeAlwaysAvailableSource(), view, { loadRadius: 1, unloadRadius: 2 });

    streamer.update();
    const core1 = expectedCoreRange(layer, view);
    const cornerCx = core1.minCx - 1; // the near-edge of the initially-loaded load-range box
    const cornerCy = core1.minCy - 1;
    expect(layer.getChunk(cornerCx, cornerCy)).toBeDefined();

    view.setCenter(20 + 10, 20); // move by one tile — well within hysteresis
    streamer.update();

    expect(layer.getChunk(cornerCx, cornerCy)).toBeDefined();
  });
});

describe('ChunkStreamer.update() — load budget', () => {
  it('a large single-step move loads at most maxChunkLoadsPerFrame new chunks per update() call', () => {
    const tileset = makeTileset();
    const layer = makeUnboundedLayer(tileset, 4, 10);
    const view = new View(0, 0, 40, 40);
    const streamer = new ChunkStreamer(layer, makeAlwaysAvailableSource(), view, { maxChunkLoadsPerFrame: 3 });
    streamer.update(); // primes the initial (unbudgeted) view

    view.setCenter(100_000, 100_000); // teleport far away (default unloadRadius=2 — every old chunk is now astronomically out of range and gets evicted this same tick)
    streamer.update();

    // All previously-resident chunks were evicted (well beyond unloadRadius), and
    // the newly-wanted set at the teleported position is capped at the budget —
    // so residentCount after this tick is exactly the budget, not a range.
    expect(streamer.residentCount).toBe(3);
  });

  it('repeated update() calls at a fixed view position drain the load backlog over multiple ticks', () => {
    const tileset = makeTileset();
    const layer = makeUnboundedLayer(tileset, 4, 10);
    const view = new View(0, 0, 40, 40);
    const streamer = new ChunkStreamer(layer, makeAlwaysAvailableSource(), view, { maxChunkLoadsPerFrame: 3 });
    streamer.update();

    view.setCenter(100_000, 100_000);
    const core = expectedCoreRange(layer, view);
    const totalWanted = (core.maxCx - core.minCx + 1 + 2) * (core.maxCy - core.minCy + 1 + 2); // + 2*loadRadius default(1)

    let ticks = 0;
    while (streamer.residentCount < totalWanted && ticks < 50) {
      streamer.update();
      ticks++;
    }

    expect(streamer.residentCount).toBe(totalWanted);
  });
});

describe('ChunkStreamer.update() — async provider', () => {
  it('installs a resolved async chunk only after the promise resolves, not synchronously', async () => {
    const tileset = makeTileset();
    const layer = makeUnboundedLayer(tileset);
    const view = new View(0, 0, 32, 32);
    let resolvePayload!: (payload: ChunkPayload | null) => void;
    const pending = new Promise<ChunkPayload | null>(resolve => { resolvePayload = resolve; });
    const source: ChunkSource = { getChunk: () => pending };
    const streamer = new ChunkStreamer(layer, source, view);

    streamer.update();
    expect(layer.getChunk(0, 0)).toBeUndefined(); // still pending

    resolvePayload({ width: 4, height: 4, tiles: new Uint32Array(16) });
    await pending;
    await Promise.resolve(); // flush the .then() microtask

    expect(layer.getChunk(0, 0)).toBeDefined();
  });

  it('a provider returning null installs nothing and does not throw', async () => {
    const tileset = makeTileset();
    const layer = makeUnboundedLayer(tileset);
    const view = new View(0, 0, 32, 32);
    const source: ChunkSource = { getChunk: async () => null };
    const streamer = new ChunkStreamer(layer, source, view);

    streamer.update();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(layer.getChunk(0, 0)).toBeUndefined();
  });

  it('a rejected promise logs a __DEV__ warning and does not install a chunk', async () => {
    const tileset = makeTileset();
    const layer = makeUnboundedLayer(tileset);
    const view = new View(0, 0, 32, 32);
    const source: ChunkSource = { getChunk: async () => { throw new Error('boom'); } };
    const streamer = new ChunkStreamer(layer, source, view);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    streamer.update();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(layer.getChunk(0, 0)).toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('a rejected coordinate is retried on a later update() call', async () => {
    const tileset = makeTileset();
    const layer = makeUnboundedLayer(tileset); // chunkSize=4, tileSize=16
    // A tiny view entirely inside chunk (0,0)'s pixel extent (tiles [0,4) on
    // each axis = px [0,64)), with loadRadius/unloadRadius both 0: the wanted
    // range is exactly the single chunk (0,0), so there is no ambiguity about
    // which of several simultaneously-requested coordinates the shared `calls`
    // counter below is tracking (a wider view issuing several parallel
    // requests on the unbudgeted first tick would make "call #1" land on
    // whichever coordinate the iteration order happens to visit first, not
    // necessarily (0,0)).
    const view = new View(32, 32, 2, 2);
    let calls = 0;
    const source: ChunkSource = {
      getChunk: async () => {
        calls++;
        if (calls === 1) throw new Error('boom');
        return { width: 4, height: 4, tiles: new Uint32Array(16) };
      },
    };
    const streamer = new ChunkStreamer(layer, source, view, { loadRadius: 0, unloadRadius: 0 });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    streamer.update(); // requests exactly (0,0), which rejects
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(layer.getChunk(0, 0)).toBeUndefined();

    streamer.update(); // retry — (0,0) is no longer in-flight and still not resident, gets re-requested
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(layer.getChunk(0, 0)).toBeDefined();
    expect(calls).toBe(2);
    warnSpy.mockRestore();
  });
});

describe('ChunkStreamer.update() — parallax-aware wanted range', () => {
  it('a parallax layer streams a different chunk range than a non-parallax layer at the same view position', () => {
    const tileset = makeTileset();
    const view = new View(1000, 0, 40, 40);

    const plainLayer = new TileLayer({
      id: 0, name: 'plain',
      tileWidth: 10, tileHeight: 10, tilesets: [tileset],
      chunkWidth: 4, chunkHeight: 4,
    });
    const parallaxLayer = new TileLayer({
      id: 1, name: 'parallax',
      tileWidth: 10, tileHeight: 10, tilesets: [tileset],
      chunkWidth: 4, chunkHeight: 4,
      parallaxX: 0.5, parallaxY: 0.5,
    });

    new ChunkStreamer(plainLayer, makeAlwaysAvailableSource(), view).update();
    new ChunkStreamer(parallaxLayer, makeAlwaysAvailableSource(), view).update();

    const plainChunks = [...plainLayer.loadedChunks()].map(c => `${c.cx},${c.cy}`).sort();
    const parallaxChunks = [...parallaxLayer.loadedChunks()].map(c => `${c.cx},${c.cy}`).sort();

    expect(plainChunks).not.toEqual(parallaxChunks);
  });

  it('a parallax layer\'s streamed range exactly matches TileLayer.pixelToTile()\'s own parallax-shifted formula', () => {
    const tileset = makeTileset();
    const view = new View(500, 0, 40, 40);
    const layer = new TileLayer({
      id: 0, name: 'l',
      tileWidth: 10, tileHeight: 10, tilesets: [tileset],
      chunkWidth: 4, chunkHeight: 4,
      parallaxX: 0.5, parallaxY: 1,
    });

    new ChunkStreamer(layer, makeAlwaysAvailableSource(), view).update();

    const bounds = view.getBounds();
    const centerX = view.center.x;
    const shiftX = centerX * (1 - layer.parallaxX);
    const topLeftTile = layer.pixelToTile(bounds.left - shiftX, bounds.top);
    const bottomRightTile = layer.pixelToTile(bounds.right - shiftX, bounds.bottom);
    const topLeftChunk = tileToChunkCoord(topLeftTile.tx, topLeftTile.ty, layer.chunkWidth, layer.chunkHeight);
    const bottomRightChunk = tileToChunkCoord(bottomRightTile.tx, bottomRightTile.ty, layer.chunkWidth, layer.chunkHeight);

    // Default loadRadius = 1: the loaded range's near corner must match core - 1.
    expect(layer.getChunk(topLeftChunk.cx - 1, topLeftChunk.cy - 1)).toBeDefined();
    expect(layer.getChunk(bottomRightChunk.cx + 1, bottomRightChunk.cy + 1)).toBeDefined();
    expect(layer.getChunk(topLeftChunk.cx - 2, topLeftChunk.cy - 2)).toBeUndefined();
  });
});
