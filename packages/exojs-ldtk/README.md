# @codexo/exojs-ldtk

Official ExoJS extension for loading [LDtk](https://ldtk.io) level files (`.ldtk`) into runtime
`TileMap`s — one per LDtk level — ready to render with the generic tilemap node.

## Installation

```sh
npm install @codexo/exojs @codexo/exojs-tilemap @codexo/exojs-ldtk
```

Both `@codexo/exojs` and `@codexo/exojs-tilemap` are **peer** dependencies, so install them
explicitly alongside the adapter. Nothing is pulled in transitively: strict package managers
(pnpm, Yarn PnP) will not resolve an unlisted peer, and npm's auto-install of peers still leaves
the versions outside your control. Keep the engine and every adapter on the same version.

## What this package provides

- `LdtkMap` — parsed LDtk world; the result of `loader.load('world.ldtk')`. Exposes the raw `data`,
  the converted runtime `levels` (`readonly TileMap[]`, in document order), and
  `getLevelByName(identifier)`
- `LdtkProject` — the streaming counterpart of `LdtkMap`: the result of
  `loader.load(Asset.type('ldtkProject', 'world.ldtk'))`. Loads the document and every tileset
  atlas, and **no** level payload. Exposes the world layout (`worlds` / `world`, one `MapWorld`
  per LDtk world) and `createRuntime({ scope })` for loading levels one at a time
- `ldtkToMapWorld` — build the format-neutral world model (level ids, bounds, neighbours) from a
  raw document, without reading any layer payload
- `ldtkToTileMap` — convert a single LDtk level to a `TileMap` (used internally; available for
  custom pipelines), plus its `LdtkToTileMapOptions`
- `getLdtkIntGridValueAt` — the named/coloured IntGrid value at a tile coordinate
- `createLdtkIntGridCellSource` — the layer's IntGrid as a `TileCellSource`, ready to hand to
  `buildTileCollisionGeometry` or `TileColliderStreamer` for collision authored per cell
- `ldtkExtension` — extension descriptor; depends on `tilemapExtension` automatically
- `ldtkMapBinding` / `ldtkProjectBinding` — the underlying `AssetBinding`s (advanced/custom wiring)
- The raw LDtk JSON types (`LdtkData`, `LdtkLevel`, `LdtkLayerInstance`, `LdtkEntityInstance`, …)
  and the flip-bit constants (`LDTK_FLIP_X`, `LDTK_FLIP_Y`, `LDTK_FLIP_XY`, `LDTK_FLIP_NONE`)
- `TileMap`, `TileMapNode`, `TileMapView`, `TileLayer`, `TileSet`, `ObjectLayer`, … re-exported
  from `@codexo/exojs-tilemap` (same class identity — `instanceof TileMap` holds across both import
  paths)

## Usage

Register the extension and load a `.ldtk` world. One extension enables **both** loading and
rendering — `ldtkExtension` depends on `tilemapExtension`, so the tile chunk renderer bindings are
materialised automatically:

```ts
import { Application } from '@codexo/exojs';
import { LdtkMap, TileMapNode, ldtkExtension } from '@codexo/exojs-ldtk';

const app = new Application({ extensions: [ldtkExtension] });

const world = await app.loader.load('levels/world.ldtk');

// Render the first level (each LDtk level is its own TileMap):
const level = world.getLevelByName('Level_0') ?? world.levels[0];
app.scenes.root.addChild(new TileMapNode(level));
```

`TileMapNode` is the same class exported by `@codexo/exojs-tilemap` (see its
[README](https://www.npmjs.com/package/@codexo/exojs-tilemap) for the rendering/culling model and
actor interleaving).

### Streaming levels

`ldtkMap` converts every level up front. For a project too large for that, load it as an
`ldtkProject` and load levels individually — each gets its own `LoaderScope`, and external
`.ldtkl` payloads are fetched only when their level is:

```ts
import { Application, Asset } from '@codexo/exojs';
import { ldtkExtension } from '@codexo/exojs-ldtk';

const app = new Application({ extensions: [ldtkExtension] });

const project = await app.loader.load(Asset.type('ldtkProject', 'levels/world.ldtk'));
const runtime = project.createRuntime({ scope: app.loader });

const forest = await runtime.loadLevel(project.world.getLevelByName('Forest')!.id);

// ... later
forest.destroy(); // map, spawned objects and the level's asset claims, in that order
```

Which levels to load, and when, stays game policy — `project.world` carries the bounds and
neighbour graph to decide with.

## Texture ownership

Tileset textures are loaded via the Loader and stay in the Loader cache. `LdtkMap.destroy()`
destroys the owned runtime `TileMap`s but does **not** unload textures (Loader-owned) or remove any
scene nodes — the application owns those.

## Core compatibility

| `@codexo/exojs-ldtk` | `@codexo/exojs` |
|---|---|
| 0.14.x | 0.14.x |

## Links

- [API reference](https://exojs.dev/api/exojs-ldtk)
- [LDtk level editor](https://ldtk.io)

## License

MIT © Codexo
