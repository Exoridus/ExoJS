import type { TileMap } from '@codexo/exojs-tilemap';

import type { LdtkData } from './LdtkData';
import { getLdtkLevelEntries } from './ldtkLevelEntries';

/**
 * A parsed LDtk world document: holds the raw JSON data and the converted
 * runtime {@link TileMap} for each level.
 *
 * `LdtkMap` is the parsed source model. Each LDtk level is independently
 * convertible to a format-independent `TileMap`; access them via
 * {@link levels} (by document order) or by name via {@link getLevelByName}.
 *
 * Construction is cheap — the runtime `TileMap[]` is supplied externally
 * (built by {@link import('./ldtkToTileMap').ldtkToTileMap}). The map does
 * **not** own tileset textures; those remain in the Loader cache.
 */
export class LdtkMap {
  /** Resolved URL this map was loaded from. */
  public readonly source: string;
  /** The raw parsed LDtk document. */
  public readonly data: LdtkData;
  /**
   * Runtime TileMaps — one per LDtk level, in document order.
   *
   * The index here corresponds to
   * {@link import('./ldtkLevelEntries').getLdtkLevelEntries}`(data)[i]`, not
   * `data.levels[i]` — the latter is empty for multi-world documents, where
   * levels live under `data.worlds[].levels` instead. `loadLdtkMap` fully
   * resolves external `.ldtkl` levels before conversion, so every entry here
   * is always a fully converted `TileMap`.
   */
  public readonly levels: readonly TileMap[];

  public constructor(source: string, data: LdtkData, levels: readonly TileMap[]) {
    this.source = source;
    this.data = data;
    this.levels = levels;
  }

  /**
   * Find a level's runtime {@link TileMap} by the LDtk level `identifier`,
   * or `undefined` when no level with that name exists.
   *
   * Searches across {@link import('./ldtkLevelEntries').getLdtkLevelEntries}'s
   * flattened level set rather than `data.levels` directly, so this works for
   * both single-world and multi-world documents — `data.levels` alone is
   * empty for the latter.
   *
   * The lookup is O(n) in the number of levels.
   */
  public getLevelByName(identifier: string): TileMap | undefined {
    const index = getLdtkLevelEntries(this.data).findIndex(
      entry => entry.level.identifier === identifier,
    );
    if (index === -1) return undefined;
    return this.levels[index];
  }

  /**
   * Destroy all owned runtime TileMaps.
   *
   * Is idempotent. Does NOT destroy tileset textures (Loader-owned) or any
   * SceneNodes — the application is responsible for those.
   */
  public destroy(): void {
    for (const level of this.levels) {
      level.destroy();
    }
  }
}
