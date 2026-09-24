# @codexo/exojs-ldtk

Load LDtk projects into ExoJS's format-neutral tilemap and world runtime. Use an eager map for a small project or a project runtime for independently owned levels.

## Install and activate

```sh
npm install --save-exact @codexo/exojs @codexo/exojs-tilemap @codexo/exojs-ldtk
```

Core and the tilemap runtime are peer dependencies. `ldtkExtension` depends on `tilemapExtension`, so selecting the adapter installs both its loading capability and the generic tile renderer.

```ts
import { Application, type RenderingContext, Scene } from '@codexo/exojs';
import { ldtkExtension, TileMapNode } from '@codexo/exojs-ldtk';

class LevelScene extends Scene {
  override async load(): Promise<void> {
    const world = await this.loader.load('levels/world.ldtk');
    const level = world.getLevelByName('Level_0') ?? world.levels[0];

    if (level === undefined) {
      throw new Error('The LDtk project contains no loadable level.');
    }
    this.root.addChild(new TileMapNode(level));
  }

  override draw(context: RenderingContext): void {
    context.render(this.root);
  }
}

const app = new Application({
  scenes: { LevelScene },
  extensions: [ldtkExtension],
  canvas: { width: 800, height: 600, mount: 'body' },
  loader: { basePath: new URL('assets/', document.baseURI).href },
});

await app.start(LevelScene);
```

Serve the project and its referenced files beneath the asset base. Each LDtk level becomes its own `TileMap`; loading a project does not automatically select or display every level.

## Eager or streamed?

`ldtkMap` converts all levels up front. `Asset.type('ldtkProject', path)` exposes a world layout and a runtime that can acquire levels individually. External `.ldtkl` payloads are fetched when required; an embedded level's JSON is already part of the project document. Deferred conversion does not remove bytes that the initial document contains.

The project runtime supplies level ownership, not the game's streaming policy. Choose which levels to load, bound concurrency, and release their runtime handles when they are no longer needed. Use the Guide's failure and cancellation workflow rather than retaining non-null assertions against authored level names.

## Authored data and ownership

Tile rendering, entity spawning, IntGrid collision, and pathfinding are separate uses of authored data. A visible layer does not create a physics body automatically. `createLdtkIntGridCellSource` exposes cell data for the tilemap-physics bridge when that is the intended collision source.

A loader-acquired map and its texture dependencies remain claim-owned. `LdtkMap.destroy()` releases its owned runtime maps, not arbitrary scene nodes or shared loader textures. Remove displaying nodes at their owner boundary and release asset claims through their scope. Runtime classes re-exported by the adapter are the same bindings as in `@codexo/exojs-tilemap`.

## Documentation

[LDtk guide](https://exoridus.github.io/ExoJS/en/guide/assets/ldtk/) · [Worlds and level streaming](https://exoridus.github.io/ExoJS/en/guide/assets/worlds-and-spawning/) · [LdtkMap API](https://exoridus.github.io/ExoJS/en/api/ldtk-map/)

## License

MIT © Codexo
