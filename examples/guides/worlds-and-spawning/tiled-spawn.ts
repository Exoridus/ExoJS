import { type Container, type LoaderScope } from '@codexo/exojs';
import type { MapObjectSpawner } from '@codexo/exojs/tilemap';

// #region guide:tiled-spawn
export const spawnTiledLevel = async (scope: LoaderScope, spawner: MapObjectSpawner<void, Container>): Promise<void> => {
  const map = await scope.load({ type: 'tileMap', source: 'https://example.com/level.tmj' });
  const session = await spawner.spawn(map, undefined);

  session.destroy();
};
// #endregion guide:tiled-spawn
