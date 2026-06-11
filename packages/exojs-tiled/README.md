# @codexo/exojs-tiled

Official ExoJS extension for loading [Tiled](https://mapeditor.org) maps (`.tmj` JSON format)
into a generic runtime `TileMap` or a typed parsed source model.

## Installation

```sh
npm install @codexo/exojs @codexo/exojs-tiled
```

`@codexo/exojs` is a peer dependency. `@codexo/exojs-tilemap` is a regular dependency and is
installed transitively by `@codexo/exojs-tiled` — you do not need to install it manually.

If you want the generic tilemap runtime without the Tiled adapter:

```sh
npm install @codexo/exojs @codexo/exojs-tilemap
```

## What this package provides

- `TileMap` (re-exported from `@codexo/exojs-tilemap`) — generic runtime tilemap; the common-case result of `loader.load(TileMap, url)`
- `TileMapNode` / `TileLayerNode` (re-exported from `@codexo/exojs-tilemap`) — scene nodes that render a loaded `TileMap` on WebGL2/WebGPU
- `TileMapView` / `TileMapBand` (re-exported from `@codexo/exojs-tilemap`) — group a map's layers into independently placeable bands for interleaving actors between tile layers; same class identity, so `instanceof` holds across both import paths (the canonical view/band docs live in the [`@codexo/exojs-tilemap` README](https://www.npmjs.com/package/@codexo/exojs-tilemap))
- `TiledMap` — parsed Tiled source model; advanced/diagnostic use via `loader.load(TiledMap, url)`
- `TiledTileset` — parsed tileset (atlas-image or collection-of-images); holds resolved textures
- `TiledLayer` hierarchy — `TiledTileLayer`, `TiledObjectLayer`, `TiledImageLayer`, `TiledGroupLayer`
- `TiledObject` — parsed object (point, ellipse, polygon, polyline, text, tile-ref, rectangle)
- `TiledFormatError` — typed error thrown on any structural problem in `.tmj`/`.tsj` data
- `tiledExtension` — extension descriptor; depends on `tilemapExtension` automatically

## Usage — common case

Register the extension, load a `.tmj` map into a generic runtime `TileMap`, and render it. One
extension enables **both** loading and rendering — `tiledExtension` depends on `tilemapExtension`,
so the tile chunk renderer bindings are materialised automatically (no manual `tilemapExtension`
registration):

```ts
import { Application } from '@codexo/exojs';
import { TileMap, TileMapNode, tiledExtension } from '@codexo/exojs-tiled';

const app = new Application({ extensions: [tiledExtension] });

const map = await app.loader.load(TileMap, 'maps/world.tmj');
// map is a @codexo/exojs-tilemap TileMap

app.scene.root.addChild(new TileMapNode(map));
```

`TileMapNode` and `TileLayerNode` are the same classes exported by `@codexo/exojs-tilemap` (see its
[README](https://www.npmjs.com/package/@codexo/exojs-tilemap) for the rendering/culling model and
actor interleaving). `instanceof TileMap` holds across both import paths.

## Usage — advanced parsed-source case

Load the fully resolved Tiled source model and convert it manually:

```ts
import { TiledMap } from '@codexo/exojs-tiled';

const source = await app.loader.load(TiledMap, 'maps/world.tmj');
const map = source.toTileMap();
```

Both paths are semantically equivalent. The runtime binding (`TileMap`) uses the Loader-managed
source-model sub-load internally, so concurrent or duplicate loads are deduplicated.

## `/register` convenience entry

Importing `/register` registers `tiledExtension` (and its `tilemapExtension` dependency) in the
global `ExtensionRegistry`. Subsequently created Applications that use global defaults will
receive both extensions automatically.

```ts
// Side effect: registers tiledExtension in the global ExtensionRegistry.
import '@codexo/exojs-tiled/register';

// All named exports are also re-exported from /register:
import { TileMap, TiledMap, tiledExtension } from '@codexo/exojs-tiled/register';
```

## Extension dependency

`tiledExtension.dependencies` includes `tilemapExtension` from `@codexo/exojs-tilemap`.
Registering `tiledExtension` is sufficient — `buildSnapshot` and `ExtensionRegistry.register`
traverse the dependency graph automatically.

## Asset loading

`loader.load(TileMap, url)` (common path) and `loader.load(TiledMap, url)` (advanced path) both:

1. Fetch and validate the `.tmj` file.
2. Resolve each tileset entry (fetches external `.tsj` files via the Loader cache).
3. Load atlas images (`tileset.image`) and per-tile images (collection-of-images tilesets)
   via `loader.load(Texture, …)` — the Loader deduplicates identical URLs.
4. Validate GID ranges (no duplicates, no overlaps, all layer GIDs covered) — throws
   `TiledFormatError` on any inconsistency.

The runtime binding additionally calls `TiledMap.toTileMap()` to produce the generic `TileMap`.

### Load options

```ts
// `.tmj`/`.tsj` are recognised by extension; a format hint is only needed for
// Tiled data served from a generic `.json` path:
await loader.load(TileMap, 'maps/world.json', { format: 'tiled' });
```

| Option | Type | Default | Description |
|---|---|---|---|
| `format` | `'tiled'` | `'tiled'` | Format hint for ambiguous `.json` paths. `.tmj`/`.tsj` are recognised by extension. `'tiled'` is the only accepted value (a foreign format is a compile error). Participates in the asset identity key. |

Options are optional. Parsing is always strict: `validateTiledMapData` throws a `TiledFormatError` on any malformed *known* field, and silently preserves *unknown* fields (so real-world Tiled files using features ExoJS does not model still load).

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
map.toTileMap()             // → TileMap — synchronous runtime conversion
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
| 0.13.x | 0.13.x |

## Links

- [API reference](https://exojs.dev/api/exojs-tiled)
- [Tiled map editor](https://mapeditor.org)

## License

MIT
