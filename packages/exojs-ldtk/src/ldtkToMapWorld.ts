import type { MapLevel, MapLevelNeighbour } from '@codexo/exojs-tilemap';
import { MapLevelSide, MapWorld } from '@codexo/exojs-tilemap';

import type { LdtkData, LdtkLevel } from './LdtkData';
import { getLdtkLevelEntries } from './ldtkLevelEntries';
import { buildLdtkLevelProperties } from './ldtkToTileMap';

/**
 * LDtk direction codes, as emitted in `__neighbours[].dir`. The cardinal four
 * have always existed; the depth relations arrived with LDtk 1.x.
 */
const SIDE_BY_DIR: Readonly<Record<string, MapLevelSide>> = Object.freeze({
  n: MapLevelSide.North,
  s: MapLevelSide.South,
  e: MapLevelSide.East,
  w: MapLevelSide.West,
  o: MapLevelSide.Overlap,
  '<': MapLevelSide.Below,
  '>': MapLevelSide.Above,
});

const convertNeighbours = (level: LdtkLevel): readonly MapLevelNeighbour[] => {
  const raw = level.__neighbours;
  if (raw === undefined || raw === null || raw.length === 0) return [];

  return raw.map(neighbour => ({
    id: neighbour.levelIid,
    // An unrecognised code still means the levels are adjacent, so the edge is
    // kept and only its side degrades - dropping it would lose real data if a
    // future LDtk adds a direction.
    side: SIDE_BY_DIR[neighbour.dir] ?? MapLevelSide.Unknown,
  }));
};

const convertLevel = (level: LdtkLevel, worldIid: string | undefined, index: number): MapLevel => ({
  id: level.iid,
  name: level.identifier,
  index,
  bounds: { x: level.worldX, y: level.worldY, width: level.pxWid, height: level.pxHei },
  external: Boolean(level.externalRelPath),
  neighbours: convertNeighbours(level),
  properties: buildLdtkLevelProperties(level, worldIid),
});

/**
 * Build the format-neutral world model for an LDtk document: one
 * {@link MapWorld} per LDtk world, in document order.
 *
 * A single-world project - the overwhelmingly common shape - yields exactly one
 * unnamed world. A multi-world project yields one per entry of `worlds[]`, each
 * named by its identifier, and they stay separate on purpose: LDtk worlds have independent coordinate spaces, so merging them
 * would make {@link MapWorld.bounds} and {@link MapWorld.getLevelsInBounds}
 * report overlaps that do not exist.
 *
 * {@link MapLevel.index} counts across the whole document, matching the
 * flattened order {@link import('./LdtkMap').LdtkMap.levels} uses.
 *
 * Level metadata only: no layer payload is read, so this is safe to call on a
 * document whose external levels have not been fetched.
 */
export const ldtkToMapWorld = (data: LdtkData): readonly MapWorld[] => {
  const entries = getLdtkLevelEntries(data);

  if (data.worlds && data.worlds.length > 0) {
    const worlds: MapWorld[] = [];
    let index = 0;

    for (const world of data.worlds) {
      const levels = world.levels.map(level => convertLevel(level, world.iid, index++));
      worlds.push(new MapWorld({ name: world.identifier, levels }));
    }

    return Object.freeze(worlds);
  }

  return Object.freeze([new MapWorld({ levels: entries.map((entry, index) => convertLevel(entry.level, entry.worldIid, index)) })]);
};
