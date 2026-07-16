import { TextureRegion, View } from '@codexo/exojs';
import { type Texture } from '@codexo/exojs';
import { describe, expect, it, vi } from 'vitest';

import { ChunkStreamer } from '../../src/ChunkStreamer';
import { TileLayer } from '../../src/TileLayer';
import { TileSet } from '../../src/TileSet';
import { createWorkerSampledChunkSource } from '../../src/WorkerSampledChunkSource';

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

// A minimal, self-contained worker script matching the documented protocol:
// sample(tx, ty) = tx + ty, response for every requested chunk. Written as a
// literal template string, the same pattern this file's WorkerSampledChunkSource
// consumer documents and WorkletEffect._workletSource already establishes
// elsewhere in this codebase.
const WORKER_SOURCE = `
  self.onmessage = (event) => {
    const { requestId, cx, cy, chunkWidth, chunkHeight } = event.data;
    const values = new Float64Array(chunkWidth * chunkHeight);
    const startTx = cx * chunkWidth;
    const startTy = cy * chunkHeight;
    for (let ty = 0; ty < chunkHeight; ty++) {
      for (let tx = 0; tx < chunkWidth; tx++) {
        values[ty * chunkWidth + tx] = (startTx + tx) + (startTy + ty);
      }
    }
    self.postMessage({ requestId, values }, [values.buffer]);
  };
`;

describe('createWorkerSampledChunkSource — real Worker', () => {
  it('tiles installed via ChunkStreamer are readable through TileLayer.getTileAt', async () => {
    const tileset = makeTileset();
    const layer = new TileLayer({
      id: 0, name: 'l',
      tileWidth: 16, tileHeight: 16, tilesets: [tileset],
      chunkWidth: 4, chunkHeight: 4,
    });
    const source = createWorkerSampledChunkSource(layer, {
      workerSource: WORKER_SOURCE,
      mapValueToTile: value => (value % 2 === 0 ? { tileset, localTileId: 1, transform: { flipX: false, flipY: false, diagonal: false } } : null),
    });
    const view = new View(0, 0, 32, 32);
    const streamer = new ChunkStreamer(layer, source, view);

    try {
      streamer.update();
      // ChunkStreamer's async branch installs on a later microtask/message-event
      // tick, not synchronously — wait for the worker round trip to actually
      // complete before asserting.
      await vi.waitFor(() => {
        expect(layer.getTileAt(0, 0)).not.toBeNull();
      }, { timeout: 5000 });

      // (0,0): sample = 0, even -> resolves.
      expect(layer.getTileAt(0, 0)).toEqual({ tileset, localTileId: 1, transform: { flipX: false, flipY: false, diagonal: false } });
      // (1,0): sample = 1, odd -> stays empty.
      expect(layer.getTileAt(1, 0)).toBeNull();
      // (2,0): sample = 2, even -> resolves.
      expect(layer.getTileAt(2, 0)).toEqual({ tileset, localTileId: 1, transform: { flipX: false, flipY: false, diagonal: false } });
    } finally {
      streamer.destroy();
      source.destroy();
    }
  });
});
