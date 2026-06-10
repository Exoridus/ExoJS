# @codexo/exojs-tilemap

Generic, format-independent tilemap runtime **and** WebGL2/WebGPU chunk renderer for
[ExoJS](https://exojs.dev). No Tiled (or any other on-disk format) vocabulary leaks into this
package — adapters such as [`@codexo/exojs-tiled`](https://www.npmjs.com/package/@codexo/exojs-tiled)
parse their format and hand this runtime fully-resolved tiles.

## Installation

```sh
npm install @codexo/exojs @codexo/exojs-tilemap
```

`@codexo/exojs` is a peer dependency. Most users load Tiled maps and get this package
transitively through `@codexo/exojs-tiled` — install it directly only for procedural or
custom-format maps.

## What this package provides

**Runtime (data model)** — pure data, no scene graph:

- `TileMap` — a finite, chunk-first map: dimensions, tile size, `tilesets`, ordered `layers`.
- `TileLayer` — one tile layer; packed `Uint32Array` chunk storage, `visible` / `opacity` /
  `offsetX/Y`, queries, and revision tracking.
- `TileSet` — a resolved tileset grid over a Core `TextureRegion` (Loader-owned texture).
- `ResolvedTile` / `TileTransform` — value-typed tile references with `flipX` / `flipY` /
  `diagonal` orientation.

**Scene / rendering (`@advanced`)**:

- `TileMapNode` — convenience root that renders a whole `TileMap`.
- `TileLayerNode` — renders one `TileLayer`; place these yourself to interleave actors.
- `tilemapExtension` — extension descriptor carrying the WebGL2/WebGPU renderer bindings.

## Usage — procedural map

```ts
import { Application, Texture, TextureRegion } from '@codexo/exojs';
import {
  TileLayer,
  TileMap,
  TileMapNode,
  TileSet,
  tilemapExtension,
  TILE_TRANSFORM_IDENTITY,
} from '@codexo/exojs-tilemap';

const app = new Application({ extensions: [tilemapExtension] /* canvas, … */ });

// Tileset over a Loader-owned atlas texture (the runtime never destroys it).
const atlas = await app.loader.load(Texture, 'tiles.png');
const terrain = new TileSet({
  name: 'terrain',
  texture: new TextureRegion(atlas, { x: 0, y: 0, width: atlas.width, height: atlas.height }),
  tileWidth: 16,
  tileHeight: 16,
  tileCount: 256,
});

const ground = new TileLayer({
  id: 1,
  name: 'ground',
  width: 64,
  height: 64,
  tileWidth: 16,
  tileHeight: 16,
  tilesets: [terrain],
});
ground.setTileAt(0, 0, { tileset: terrain, localTileId: 5, transform: TILE_TRANSFORM_IDENTITY });

const map = new TileMap({
  name: 'world',
  width: 64,
  height: 64,
  tileWidth: 16,
  tileHeight: 16,
  tilesets: [terrain],
  layers: [ground],
});

// Render the whole map.
app.scene.root.addChild(new TileMapNode(map));
```

### Interleaving actors between layers

`TileMapNode` owns **only** the map's layer nodes. To place actors *between* layers, build the
layer nodes yourself and parent them in your own scene graph:

```ts
const background = new TileLayerNode(map.getTileLayer('background')!);
const foreground = new TileLayerNode(map.getTileLayer('foreground')!);

world.addChild(background);
world.addChild(player);      // app-owned actor, drawn between the two layers
world.addChild(foreground);
```

## `/register` convenience entry

```ts
// Side effect: registers tilemapExtension in the global ExtensionRegistry.
import '@codexo/exojs-tilemap/register';
```

## Renderer model

- **Chunk-first.** A `TileLayerNode` is a container of per-chunk `TileChunkNode` drawables (one
  per non-empty loaded chunk). The renderer batches tiles by `(shader, tileset texture)` and
  issues one instanced draw per batch — draw calls scale with *visible chunks × layers*, not
  total tile count.
- **Revision-cached geometry.** Each chunk's quad geometry is built once and cached against the
  source chunk's `revision`. Unchanged chunks never rebuild; a camera pan rebuilds nothing —
  off-screen chunks are culled by their local bounds before any geometry is touched.
- **Orientation.** `flipX` / `flipY` / `diagonal` are baked into the chunk geometry / resolved in
  the shader (all 8 combinations), with no per-tile matrix or per-frame cost.
- **Multiple tilesets** with differing tile sizes are first-class; tiles taller than the map grid
  are bottom-left aligned (Tiled orthogonal convention).
- **WebGL2 and WebGPU** share one CPU geometry builder and produce identical output (golden
  parity tested on both backends).

## Ownership & lifecycle

- Tileset **textures are Loader-owned**. The runtime and renderer never destroy them.
- `TileMapNode` / `TileLayerNode` reference — but never own — the `TileMap`. Destroying a map
  node frees its layer/chunk nodes and their cached geometry; the `TileMap` data and textures
  survive. Free those via `TileMap.destroy()` and `Loader.destroy()` respectively.
- A `TileMapNode` reflects the layer set at construction time. After structural changes (layers
  added/removed, or tiles written into previously-empty chunks) call `node.refreshLayers()` /
  `layerNode.refresh()`. In-place edits to existing chunks are picked up automatically.

## Core compatibility

| `@codexo/exojs-tilemap` | `@codexo/exojs` |
|---|---|
| 0.x | matching `0.x` |

## Links

- [API reference](https://exojs.dev/api/exojs-tilemap)
- [`@codexo/exojs-tiled`](https://www.npmjs.com/package/@codexo/exojs-tiled) — load Tiled `.tmj` maps into this runtime

## License

MIT
