import { View } from '@codexo/exojs';
import { ChunkStreamer, createSampledChunkSource, TileLayer } from '@codexo/exojs-tilemap';

// #region guide:chunk-streaming
const terrain = new TileLayer({ id: 1, name: 'terrain', tileWidth: 64, tileHeight: 64, tilesets: [] });
const view = new View(0, 0, 1280, 720);

// Any ChunkSource works; the next section builds a real procedural one. This
// placeholder leaves every chunk empty.
const source = createSampledChunkSource(terrain, {
  sample: () => 0,
  mapValueToTile: () => null,
});

// loadRadius / unloadRadius are a hysteresis band (defaults 1 / 2). The gap
// between them prevents load/unload thrashing when the view sits on a chunk
// boundary. unloadRadius must be >= loadRadius or the constructor throws.
const streamer = new ChunkStreamer(terrain, source, view, {
  loadRadius: 2,
  unloadRadius: 3,
  maxChunkLoadsPerFrame: 8,
});

// Tick from update(). The very first call loads the whole initial wanted set
// unbudgeted, so the starting screen never pops in; every later call is
// capped at maxChunkLoadsPerFrame (default 8).
streamer.update();

// On teardown, destroy() evicts exactly the chunks this instance loaded -
// nothing that predated it or another source installed. Idempotent.
streamer.destroy();
// #endregion guide:chunk-streaming
