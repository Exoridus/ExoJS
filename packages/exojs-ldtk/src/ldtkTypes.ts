import type { AssetFactory } from '@codexo/exojs';
import { AssetType } from '@codexo/exojs';

import { LdtkMap } from './LdtkMap';
import { LdtkProject } from './LdtkProject';
import { loadLdtkMap } from './loadLdtkMap';
import { loadLdtkProject } from './loadLdtkProject';

/**
 * A fully assembled LDtk world: every referenced tileset image loaded, every
 * externalized `.ldtkl` level resolved, and one runtime
 * {@link import('@codexo/exojs-tilemap').TileMap} per level.
 *
 * It claims the `.ldtk` suffix, so a bare `.ldtk` path on a loader that has
 * this type installed resolves here rather than to {@link LdtkProjectAssetType}.
 */
export class LdtkMapAssetType extends AssetType<void, LdtkMap> {
  public readonly id = 'ldtkMap';
  public override readonly extensions = ['ldtk'];
  public override readonly _token = LdtkMap;

  /**
   * The document is acquired as an ordinary JSON asset by the factory, so one
   * `.ldtk` file is downloaded and cached once however many LDtk types read it.
   */
  public override unacquiredSource(): { source: void } {
    return { source: undefined };
  }

  public createFactory(): AssetFactory<void, LdtkMap> {
    return { create: (_source, context) => loadLdtkMap(context) };
  }
}

/**
 * The streaming entry point: an LDtk world's layout and tileset atlases, with
 * no level payload loaded.
 *
 * It claims no suffix, so a bare `.ldtk` path keeps resolving to the eager
 * {@link LdtkMapAssetType} it always did. Both read the same URL, and loading
 * one does not make the other resident. Levels are loaded and unloaded
 * individually through {@link LdtkProject.createRuntime}.
 */
export class LdtkProjectAssetType extends AssetType<void, LdtkProject> {
  public readonly id = 'ldtkProject';
  public override readonly _token = LdtkProject;

  public override unacquiredSource(): { source: void } {
    return { source: undefined };
  }

  public createFactory(): AssetFactory<void, LdtkProject> {
    return { create: (_source, context) => loadLdtkProject(context) };
  }
}

/** The eager LDtk world asset type. Install it through `ldtkExtension`. */
export const ldtkMapType = new LdtkMapAssetType();
/** The streaming LDtk project asset type. Install it through `ldtkExtension`. */
export const ldtkProjectType = new LdtkProjectAssetType();
