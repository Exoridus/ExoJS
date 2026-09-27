# @codexo/exojs-tiled

Load Tiled JSON maps into ExoJS's format-neutral tilemap runtime. Use this adapter for `.tmj` maps and their tilesets; use `@codexo/exojs-tilemap` alone for maps created directly in code.

## Install

```sh
npm install --save-exact @codexo/exojs @codexo/exojs-tilemap @codexo/exojs-tiled
```

Core and the tilemap runtime are peer dependencies. Install them explicitly and keep them on the adapter's compatible release line.

## Load and render a map

`tiledExtension` installs the map loader and depends on `tilemapExtension`, which supplies rendering. Importing the package alone does not activate it.

```ts
import { Application, Asset, Scene, type RenderingContext } from '@codexo/exojs';
import { TileMapNode, tiledExtension } from '@codexo/exojs-tiled';

class MapScene extends Scene {
  override async load(): Promise<void> {
    const map = await this.loader.load(Asset.type('tileMap', 'maps/world.tmj'));

    this.root.addChild(new TileMapNode(map));
  }

  override draw(context: RenderingContext): void {
    context.render(this.root);
  }
}

const app = new Application({
  scenes: { MapScene },
  extensions: [tiledExtension],
  canvas: { width: 800, height: 600, mount: 'body' },
  loader: { basePath: new URL('assets/', document.baseURI).href },
});

await app.start(MapScene);
```

Serve `maps/world.tmj` and the files it references below the configured asset base URL. The ordinary `tileMap` load produces a generic `TileMap`; `tiledSource` instead produces the parsed `TiledMap` for inspection or explicit `toTileMap()` conversion.

## Before using an authored map

The adapter reads JSON (`.tmj` / `.tsj`), not Tiled's XML export. Loading validates known fields and resolves referenced tilesets and images. A parsed source feature is not automatically a rendered gameplay feature: object layers contain data until your code spawns objects or creates colliders. Infinite maps require a chunk-streaming policy; loading the source document alone does not keep every tile resident.

Tileset resources acquired through the loader have loader-managed claims and dependencies. Do not manually destroy a shared tileset texture to unload one map. Give the map a scene or shorter-lived loader scope, and clean up the scene nodes that display it before releasing their required resources.

`TileMap`, `TileMapNode`, `TileMapView`, and the other runtime re-exports are the same bindings as in `@codexo/exojs-tilemap`, not independent adapter-specific classes.

## Isometric maps

`toTileMap()` converts standard Tiled isometric maps as well as orthogonal maps. It shares a `TileProjection` across the map, tile layers and object layers, with Tiled's horizontal origin (`map.height * tileWidth / 2`). Infinite maps retain signed chunk coordinates and stream through the same public chunk-source API. Staggered and hexagonal maps remain unsupported; LDtk remains orthogonal.

Tiled object positions use logical pixels with `tileHeight` units per cell on both axes. Runtime object geometry stays in that logical space for physics. Use `objectLayer.getDisplayObject(object)` for placement and drawing; it projects shapes and applies group/layer display offsets. Imported object rotations are normalized to preserve Tiled's rotation after projection. Tile objects use Tiled's bottom-centre default alignment on isometric maps, retain their visual size and rotation, expose the image pivot as `rotationOrigin`, and keep the tileset drawing offset separate as on orthogonal maps.

See the **Isometric Landscape** example for Kenney artwork, cell picking, authored object colliders and an explicit physics presentation binding.

## Learn more

- [Tiled maps guide](https://exoridus.github.io/ExoJS/en/guide/assets/tiled-maps/) explains the normal import workflow and format boundaries.
- [Infinite maps](https://exoridus.github.io/ExoJS/en/guide/rendering/infinite-maps/) explains chunk sources and residency.
- [Worlds and spawning](https://exoridus.github.io/ExoJS/en/guide/assets/worlds-and-spawning/) turns authored objects into owned game objects.
- [API reference](https://exoridus.github.io/ExoJS/en/api/tiled-map/) documents the parsed model; [TileMap](https://exoridus.github.io/ExoJS/en/api/tile-map/) documents the runtime model.

## License

MIT
