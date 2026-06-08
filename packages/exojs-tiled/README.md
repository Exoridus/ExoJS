# @codexo/exojs-tiled

Official ExoJS extension for loading [Tiled](https://mapeditor.org) maps (`.tmj` JSON format).

## Installation

```sh
npm install @codexo/exojs @codexo/exojs-tiled
```

This package requires `@codexo/exojs` as a peer dependency. Both must be the same version.

## Core compatibility

| `@codexo/exojs-tiled` | `@codexo/exojs` |
|---|---|
| 0.12.x | 0.12.x |

## Supported Tiled scope

- Tiled JSON map format (`.tmj`)
- Orthogonal tile layers
- Object layers (basic)
- External tilesets (`.tsj`) referenced from `.tmj`
- Multiple tile layers per map

## Not supported in 0.12.x

- TMX (XML) format — use `.tmj` export from Tiled
- Isometric and hexagonal maps
- Image layers
- Wangsets
- Custom class / enum properties

## Usage — side-effect-free root entry

```ts
import { Application } from '@codexo/exojs';
import { TiledMap, tiledExtension } from '@codexo/exojs-tiled';

const app = new Application({
    extensions: [tiledExtension],
});
```

Importing from the root entry does **not** register the extension globally.

## Extension descriptor

`tiledExtension` is the default descriptor. It registers the `TiledMap` asset type with the following bindings:

- Constructor load: `loader.load(TiledMap, url)`
- Extension routing: `.tmj` files auto-route to `TiledMap`
- Type-name load: `loader.load('tiledMap', url)`

## Loading a Tiled map

```ts
import { TiledMap } from '@codexo/exojs-tiled';

// Inside a Scene:
override async load(loader) {
    // By constructor (explicit)
    await loader.load(TiledMap, { myMap: '/maps/level1.tmj' });

    // By file extension (auto-routed)
    await loader.load('/maps/level1.tmj');

    // By type name
    await loader.load('tiledMap', { myMap: '/maps/level1.tmj' });
}

override create(loader) {
    const map = loader.get(TiledMap, 'myMap');
    this.addChild(map);
}
```

## `/register` convenience entry

Importing `/register` registers the default `tiledExtension` descriptor in the global `ExtensionRegistry`. Subsequently created Applications that use global defaults will automatically receive the Tiled extension.

```ts
// Side effect: registers tiledExtension in the global ExtensionRegistry.
import '@codexo/exojs-tiled/register';

// All named exports are re-exported from /register:
import { TiledMap, tiledExtension } from '@codexo/exojs-tiled/register';
```

**Note:** `/register` does not use automatic discovery. It explicitly calls `ExtensionRegistry.register(tiledExtension)` at module evaluation time.

## Texture and sub-asset ownership

Tilesets referenced from a Tiled map are loaded as sub-assets and stored in the Loader cache. The `TiledMap` does **not** own or destroy tileset textures — the Loader cache owns them. Do not call `tileset.destroy()` from your code; let the Loader handle cleanup when the scene is destroyed.

## Minimal working example

```ts
import { Application, Scene } from '@codexo/exojs';
import { TiledMap, tiledExtension } from '@codexo/exojs-tiled';

const app = new Application({ extensions: [tiledExtension] });
document.body.append(app.canvas);

class GameScene extends Scene {
    map!: TiledMap;

    override async load(loader) {
        await loader.load(TiledMap, { level1: '/maps/level1.tmj' });
    }

    override create(loader) {
        this.map = loader.get(TiledMap, 'level1');
        this.addChild(this.map);
    }
}

app.scenes.start(GameScene);
```

## Links

- [Official ExoJS Tiled guide](https://exojs.dev/guides/extensions/tiled)
- [API reference](https://exojs.dev/api/exojs-tiled)
- [Tiled map editor](https://mapeditor.org)

## License

MIT
