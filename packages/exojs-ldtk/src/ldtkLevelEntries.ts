import type { LdtkData, LdtkLevel } from './LdtkData';

/**
 * One level from a (possibly multi-world) {@link LdtkData} document, paired
 * with the {@link import('./LdtkData').LdtkWorldData.iid} of the world it
 * belongs to. `worldIid` is `undefined` when the document uses the legacy
 * single-world shape (`data.levels`, no `worlds[]`) — the overwhelmingly
 * common case.
 */
export interface LdtkLevelEntry {
  readonly level: LdtkLevel;
  readonly worldIid: string | undefined;
}

/**
 * Flatten a {@link LdtkData} document's levels into one ordered list,
 * abstracting over LDtk's two root shapes: single-world (levels live in the
 * root {@link LdtkData.levels}) and multi-world (levels live in
 * `data.worlds[].levels`, each tagged here with its owning world's `iid`;
 * per the LDtk spec the root `levels` array is kept but EMPTY in this shape).
 *
 * This is the single place that decides which shape a document uses — every
 * consumer that needs "all levels, in document order" ({@link import('./loadLdtkMap').loadLdtkMap}'s
 * external `.ldtkl` resolution, {@link import('./ldtkToTileMap').ldtkToTileMap}'s
 * conversion, and {@link import('./LdtkMap').LdtkMap.getLevelByName}'s lookup)
 * goes through this function rather than re-deriving the single/multi-world
 * detection independently.
 */
export function getLdtkLevelEntries(data: LdtkData): readonly LdtkLevelEntry[] {
  if (data.worlds && data.worlds.length > 0) {
    const entries: LdtkLevelEntry[] = [];
    for (const world of data.worlds) {
      for (const level of world.levels) {
        entries.push({ level, worldIid: world.iid });
      }
    }
    return entries;
  }

  return data.levels.map(level => ({ level, worldIid: undefined }));
}
