import type { AssetFactoryContext } from '@codexo/exojs';
import { Asset } from '@codexo/exojs';
import type { TileSet } from '@codexo/exojs-tilemap';

import { LdtkProject } from './LdtkProject';
import { loadLdtkTileset } from './loadLdtkMap';
import { validateLdtkData } from './validate';

/**
 * Read and validate a `.ldtk` document and load every tileset atlas it
 * references, without touching any level payload.
 *
 * External `.ldtkl` levels are deliberately left unfetched - that is the whole
 * point of {@link LdtkProject}: the world layout arrives, the levels arrive
 * when a level runtime asks for them.
 *
 * @throws {import('./validate').LdtkFormatError} for a structurally invalid
 * document, or a tileset whose declared atlas cannot hold a single tile. An
 * embed-atlas tileset (`relPath = null`) is skipped with a warning instead.
 * @internal
 */
export const loadLdtkProject = async (context: AssetFactoryContext): Promise<LdtkProject> => {
  const source = context.source;
  const data = validateLdtkData(await context.dependencies.load(Asset.type('json', source)), source);

  const tilesetEntries = await Promise.all(data.defs.tilesets.map(async def => [def.uid, await loadLdtkTileset(def, source, context)] as const));

  const tilesets = new Map<number, TileSet>();

  for (const [uid, tileset] of tilesetEntries) {
    if (tileset !== null) tilesets.set(uid, tileset);
  }

  return new LdtkProject(source, data, tilesets);
};
