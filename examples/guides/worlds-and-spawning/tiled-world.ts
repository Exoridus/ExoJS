import { Asset, type LoaderScope } from '@codexo/exojs';
import { MapWorld, MapWorldRuntime } from '@codexo/exojs-tilemap';

// #region guide:tiled-world
export function createTiledWorld(scope: LoaderScope): MapWorldRuntime {
  const world = new MapWorld({
    name: 'overworld',
    levels: [
      {
        id: 'town',
        name: 'Town',
        index: 0,
        external: true,
        neighbours: [],
        bounds: { x: 0, y: 0, width: 640, height: 480 },
        properties: {},
      },
    ],
  });

  return new MapWorldRuntime({
    world,
    scope,
    load: context => context.scope.load(Asset.type('tileMap', `${context.level.id}.tmj`)),
  });
}
// #endregion guide:tiled-world
