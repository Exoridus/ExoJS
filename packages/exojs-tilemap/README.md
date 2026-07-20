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
- `TileLayerNode` — renders one `TileLayer`; generated per layer by `TileMapView` (or construct
  directly).
- `TileMapView` — groups a map's layers into independently placeable layer nodes and named
  `TileMapBand`s for actor interleaving (a helper, not a scene node).
- `TileMapBand` — a `Container` of tile-layer nodes produced by `TileMapView`.
- `tilemapExtension` — extension descriptor carrying the WebGL2/WebGPU renderer bindings.

## Usage — procedural map

```ts
import { Application, TextureRegion } from '@codexo/exojs';
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
const atlas = await app.loader.load('tiles.png');
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
app.scenes.root.addChild(new TileMapNode(map));
```

### Interleaving actors between layers — `TileMapView`

`TileMapNode` owns **only** the map's layer nodes and renders them back-to-front — use it when
nothing renders between layers. To draw application actors *between* tile layers, create a
`TileMapView`: it generates one `TileLayerNode` per map layer (stable identity, map document
order) and groups them into named `TileMapBand`s that you parent yourself, as siblings of your
own actor containers:

```ts
const view = map.createView({
  bands: {
    ground: ['background', 'ground'],
    roof: ['roofs', 'foreground'],
  },
});

worldRoot.addChild(
  view.band('ground'),
  actors,            // app-owned actor container — drawn between ground and roof
  view.band('roof'),
);
```

Or, without bands, place the generated per-layer nodes directly:

```ts
const view = map.createView();

worldRoot.addChild(view.getLayerNodeById(groundId)!, actors, view.getLayerNodeById(roofId)!);
```

Actors are application-owned siblings. `TileMapView` never adopts or destroys actors.

- A band definition **selects** layers (by id, or by unique layer name); rendering order within
  a band always follows map document order — definitions never reorder layers.
- Layers not listed in any band stay reachable via `view.getLayerNodeById(id)` /
  `view.getLayerNodesByName(name)`; they are not auto-added to any band.
- Destroying a view or a band destroys only the tile nodes it generated — never actors, the
  `TileMap`, its `TileLayer`s, or tileset textures.
- There is no map-replacement API: to swap maps, destroy the old view and create a new view from
  the new map — the actor tree is untouched.
- After layers are structurally added to or removed from the map, call `view.refreshLayers()`:
  unchanged layer nodes keep their identity and bands keep their placement in your scene graph.

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
- **Sampling.** Tile UVs are exact (no half-texel inset), which assumes **nearest** atlas
  filtering — the typical pixel-art case. Under linear or mipmap filtering, author tilesets with
  extruded tile margins to avoid neighbour bleed at tile edges (extrusion-aware tilemap UV
  insetting is a planned follow-up; the `NineSlice` / `RepeatingSprite` geometry paths already
  inset).

## Ownership & lifecycle

- Tileset **textures are Loader-owned**. The runtime and renderer never destroy them.
- `TileMapNode` / `TileMapView` / `TileMapBand` / `TileLayerNode` reference — but never own —
  the `TileMap`. Destroying a map node, view, or band frees only the tile nodes it generated
  (detaching them from their application parents) and their cached geometry; application actors,
  the `TileMap` data, its `TileLayer`s, and textures all survive. Free those via
  `TileMap.destroy()` and `Loader.destroy()` respectively.
- A `TileMapNode` or `TileMapView` reflects the layer set at construction time. After layers are
  structurally added to or removed from the map call `node.refreshLayers()` /
  `view.refreshLayers()`; after tiles are written into previously-empty chunks call
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
