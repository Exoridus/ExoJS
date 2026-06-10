# @codexo/exojs-tiled

Official ExoJS extension for parsing [Tiled](https://mapeditor.org) maps (`.tmj` JSON format)
into a typed, validated source model.

## Installation

```sh
npm install @codexo/exojs @codexo/exojs-tiled @codexo/exojs-tilemap
```

`@codexo/exojs` and `@codexo/exojs-tilemap` are peer dependencies.
All three packages must be at the same version (`0.12.x`).

## What this package provides

**Phase C1 — Source model and parsing:**

- `TiledMap` — parsed Tiled map; validates GID coverage and tileset ranges on construction
- `TiledTileset` — parsed tileset (atlas-image or collection-of-images); holds resolved textures
- `TiledLayer` hierarchy — `TiledTileLayer`, `TiledObjectLayer`, `TiledImageLayer`, `TiledGroupLayer`
- `TiledObject` — parsed object (point, ellipse, polygon, polyline, text, tile-ref, rectangle)
- `TiledFormatError` — typed error thrown on any structural problem in `.tmj`/`.tsj` data
- `tiledExtension` — extension descriptor; depends on `tilemapExtension` automatically
- Loader integration: `loader.load(TiledMap, url)` fetches and parses a `.tmj` file,
  resolves external `.tsj` tilesets, and loads tileset textures through the Loader cache

> **Not yet available:** `TiledMap → TileMap` runtime conversion, rendering via `TileMapNode` /
> `TileLayerNode`, `.tmj` file-extension auto-routing, and infinite-map runtime support.
> These are scheduled for the next phase (C2).

## Usage — side-effect-free root entry

```ts
import { Application } from '@codexo/exojs';
import { TiledMap, tiledExtension } from '@codexo/exojs-tiled';

const app = new Application({ extensions: [tiledExtension] });

class GameScene extends Scene {
    map!: TiledMap;

    override async load(loader) {
        // Token-based load: requires the TiledMap constructor as the first argument.
        await loader.load(TiledMap, { level1: '/maps/level1.tmj' });
    }

    override create(loader) {
        const map = loader.get(TiledMap, 'level1');

        // Inspect the parsed source model:
        console.log(map.width, map.height);               // tile dimensions
        console.log(map.tilesets[0].name);                // tileset name
        console.log(map.tilesets[0].texture);             // loaded Texture (Loader-owned)
        console.log(map.findTilesetForGid(3));            // tileset owning GID 3

        const ground = map.layers.find(l => l.name === 'Ground');
        if (ground?.type === 'tilelayer') {
            console.log(ground.data);                     // flat GID array
        }
    }
}
```

Importing from the root entry does **not** register the extension globally.

## `/register` convenience entry

Importing `/register` registers `tiledExtension` (and its `tilemapExtension` dependency) in the
global `ExtensionRegistry`. Subsequently created Applications that use global defaults will
receive both extensions automatically.

```ts
// Side effect: registers tiledExtension in the global ExtensionRegistry.
import '@codexo/exojs-tiled/register';

// All named exports are also re-exported from /register:
import { TiledMap, tiledExtension } from '@codexo/exojs-tiled/register';
```

## Extension dependency

`tiledExtension.dependencies` includes `tilemapExtension` from `@codexo/exojs-tilemap`.
You do not need to register `tilemapExtension` separately — `buildSnapshot` and
`ExtensionRegistry.register` traverse the dependency graph automatically.

## Asset loading

`loader.load(TiledMap, source)` fetches and validates the `.tmj` file, then:

1. Resolves each tileset entry (fetches external `.tsj` files via the Loader cache).
2. Loads atlas images (`tileset.image`) and per-tile images (collection-of-images tilesets)
   via `loader.load(Texture, …)` — the Loader deduplicates identical URLs.
3. Validates GID ranges (no duplicates, no overlaps, all layer GIDs covered) — throws
   `TiledFormatError` on any inconsistency.

### Token-only loading

`tiledMapBinding` does **not** claim the `.tmj` file extension. This means:

- `loader.load(TiledMap, url)` — works; loads and parses the TMJ.
- `loader.load(url)` without a type token — does **not** resolve to `TiledMap` in this phase.
- `.tmj` extension auto-routing is reserved for the C2 `TileMap` runtime binding.

## Parsed API overview

### `TiledMap`

```ts
map.source            // resolved URL this map was loaded from
map.width             // map width in tiles
map.height            // map height in tiles
map.tileWidth         // tile grid cell width in pixels
map.tileHeight        // tile grid cell height in pixels
map.orientation       // 'orthogonal' | 'isometric' | 'staggered' | 'hexagonal'
map.renderOrder       // 'right-down' | 'right-up' | 'left-down' | 'left-up' | undefined
map.infinite          // true for infinite maps (layers use chunks, not flat data)
map.backgroundColor   // optional CSS color string
map.layers            // TiledLayer[] — parsed layer hierarchy
map.tilesets          // TiledTileset[] — sorted by firstGid ascending
map.properties        // TiledPropertyData[] — custom properties
map.findTilesetForGid(gid)  // → TiledTileset | undefined (masks flip bits automatically)
map.getProperty(name)       // → TiledPropertyData | undefined
map.destroy()               // no-op; textures are Loader-owned
```

### `TiledTileset`

```ts
tileset.firstGid      // first GID in this tileset's range (inclusive)
tileset.lastGid       // last GID in this tileset's range (inclusive)
tileset.name
tileset.tileWidth / tileHeight
tileset.tileCount / columns / spacing / margin
tileset.source        // resolved .tsj URL (undefined for embedded tilesets)
tileset.imageUrl      // resolved atlas image URL (undefined for collection-of-images)
tileset.texture       // Texture loaded for imageUrl (Loader-owned)
tileset.tileTextures  // Map<localId, Texture> for collection-of-images tilesets (Loader-owned)
tileset.tiles         // TiledTileData[] — per-tile animation/property/collision data
tileset.getTile(localId)    // → TiledTileData | undefined
tileset.getProperty(name)   // → TiledPropertyData | undefined
```

### `TiledLayer` subclasses

All layers extend `TiledLayer` (base: `id`, `name`, `class`, `visible`, `opacity`, `x`, `y`,
`offsetX/Y`, `parallaxX/Y`, `tintColor`, `properties`, `getProperty(name)`).

| Subclass | `type` | Extra fields |
|---|---|---|
| `TiledTileLayer` | `'tilelayer'` | `width`, `height`, `data?: number[]` (finite), `chunks?` (infinite) |
| `TiledObjectLayer` | `'objectgroup'` | `drawOrder`, `objects: TiledObject[]` |
| `TiledImageLayer` | `'imagelayer'` | `image`, `repeatX`, `repeatY` |
| `TiledGroupLayer` | `'group'` | `layers: TiledLayer[]` |

### `TiledObject`

Shape discriminants: `point` (boolean), `ellipse` (boolean), `polygon`, `polyline`, `text`,
`gid` (tile object). If none are set, the object is a plain rectangle.

## Texture ownership

Textures for tileset images are loaded via the Loader and remain in the Loader cache.
`TiledMap.destroy()` releases the parsed source model's reference but does **not** unload textures.
The Loader handles texture lifecycle (including deduplication across maps that share tilesets).

## Core compatibility

| `@codexo/exojs-tiled` | `@codexo/exojs` |
|---|---|
| 0.12.x | 0.12.x |

## Links

- [API reference](https://exojs.dev/api/exojs-tiled)
- [Tiled map editor](https://mapeditor.org)

## License

MIT
