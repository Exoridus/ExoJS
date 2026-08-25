import type { TileProperties } from './types';

/** An axis-aligned rectangle in world pixel space (+Y down). */
export interface MapBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Where a neighbouring level sits relative to the level that names it.
 *
 * `Overlap`, `Below` and `Above` describe depth relationships rather than
 * cardinal directions - a source format that stacks levels (LDtk's depth
 * layers) reports those. `Unknown` preserves an adjacency whose direction code
 * this version does not recognise: the levels are neighbours, but the side is
 * not interpretable.
 */
export const MapLevelSide = {
  North: 'north',
  South: 'south',
  West: 'west',
  East: 'east',
  Overlap: 'overlap',
  Below: 'below',
  Above: 'above',
  Unknown: 'unknown',
} as const;

/** Side discriminant for a {@link MapLevelNeighbour}. */
export type MapLevelSide = (typeof MapLevelSide)[keyof typeof MapLevelSide];

/** One adjacency edge from a level to another level in the same {@link MapWorld}. */
export interface MapLevelNeighbour {
  /** {@link MapLevel.id} of the neighbouring level. */
  readonly id: string;
  readonly side: MapLevelSide;
}

/**
 * Immutable metadata for one level of a {@link MapWorld} - everything needed to
 * decide whether to load it, without loading it.
 */
export interface MapLevel {
  /**
   * Stable identity, unique within the world. Carried from the source format
   * (LDtk uses the level `iid`), so it survives re-ordering and re-export and
   * is safe to persist in a savegame.
   */
  readonly id: string;
  /** Human-readable level name. Not guaranteed unique. */
  readonly name: string;
  /** Position in source document order. */
  readonly index: number;
  /** Placement and size in world pixel space. */
  readonly bounds: MapBounds;
  /**
   * Whether the level's layer payload lives outside the root document and has
   * to be fetched separately when the level is loaded.
   */
  readonly external: boolean;
  /** Adjacency edges declared by the source format; empty when it declares none. */
  readonly neighbours: readonly MapLevelNeighbour[];
  /** Level-level custom properties. */
  readonly properties: TileProperties;
}

/** Construction options for a {@link MapWorld}. */
export interface MapWorldOptions {
  /** World name. Defaults to an empty string. */
  readonly name?: string;
  /** The world's levels, in source document order. */
  readonly levels: readonly MapLevel[];
}

const EMPTY_BOUNDS: MapBounds = Object.freeze({ x: 0, y: 0, width: 0, height: 0 });

/**
 * A format-neutral description of how levels are laid out in a world.
 *
 * A `MapWorld` holds metadata only - no tiles, no textures, no runtime maps.
 * It is what a game reads to decide which levels it needs; loading them is
 * {@link import('./MapWorldRuntime').MapWorldRuntime}'s job.
 *
 * Adapters build one from their source document
 * (`@codexo/exojs-ldtk` does so from a `.ldtk` project). A format with no world
 * concept of its own - Tiled, today - can be described by constructing one
 * directly from whatever placement data the game keeps.
 *
 * @example
 * ```ts
 * const world = new MapWorld({
 *   name: 'overworld',
 *   levels: [
 *     { id: 'forest', name: 'Forest', index: 0, external: false,
 *       bounds: { x: 0, y: 0, width: 512, height: 512 },
 *       neighbours: [{ id: 'cave', side: MapLevelSide.East }], properties: {} },
 *   ],
 * });
 * ```
 */
export class MapWorld {
  /** World name; empty when the source format does not name it. */
  public readonly name: string;
  /** The world's levels, in source document order. */
  public readonly levels: readonly MapLevel[];

  private readonly _byId: ReadonlyMap<string, MapLevel>;
  private readonly _byName: ReadonlyMap<string, MapLevel>;
  private _bounds?: MapBounds;

  public constructor(options: MapWorldOptions) {
    this.name = options.name ?? '';
    this.levels = Object.freeze([...options.levels]);

    const byId = new Map<string, MapLevel>();
    const byName = new Map<string, MapLevel>();

    for (const level of this.levels) {
      if (byId.has(level.id)) {
        throw new Error(`MapWorld: duplicate level id "${level.id}" - level ids must be unique within a world.`);
      }

      byId.set(level.id, level);
      // Names are not unique by contract; first in document order wins so the
      // lookup stays deterministic instead of depending on iteration order.
      if (!byName.has(level.name)) byName.set(level.name, level);
    }

    this._byId = byId;
    this._byName = byName;
  }

  /**
   * Union of every level's bounds, or a zero rectangle for an empty world.
   * Computed once and cached - a `MapWorld` is immutable.
   */
  public get bounds(): MapBounds {
    if (this._bounds !== undefined) return this._bounds;

    if (this.levels.length === 0) {
      this._bounds = EMPTY_BOUNDS;
      return this._bounds;
    }

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const level of this.levels) {
      const b = level.bounds;
      if (b.x < minX) minX = b.x;
      if (b.y < minY) minY = b.y;
      if (b.x + b.width > maxX) maxX = b.x + b.width;
      if (b.y + b.height > maxY) maxY = b.y + b.height;
    }

    this._bounds = Object.freeze({ x: minX, y: minY, width: maxX - minX, height: maxY - minY });
    return this._bounds;
  }

  /** The level with this {@link MapLevel.id}, or `undefined`. Constant time. */
  public getLevel(id: string): MapLevel | undefined {
    return this._byId.get(id);
  }

  /**
   * The first level in document order whose {@link MapLevel.name} matches, or
   * `undefined`. Constant time. Names are not unique by contract.
   */
  public getLevelByName(name: string): MapLevel | undefined {
    return this._byName.get(name);
  }

  /**
   * The levels `id` declares as adjacent, resolved to their metadata and in the
   * order the source format declared them.
   *
   * A neighbour naming a level this world does not contain is skipped - LDtk
   * can reference across worlds of a multi-world project, and each of those
   * worlds is its own `MapWorld`. Returns an empty array for an unknown `id`.
   */
  public getNeighbours(id: string): readonly MapLevel[] {
    const level = this._byId.get(id);
    if (level === undefined) return [];

    const out: MapLevel[] = [];

    for (const neighbour of level.neighbours) {
      const resolved = this._byId.get(neighbour.id);
      if (resolved !== undefined) out.push(resolved);
    }

    return out;
  }

  /**
   * Every level whose bounds intersect `bounds`, in document order. Edge
   * contact alone does not count as an intersection, so two levels laid out
   * side by side are not reported for a query that only touches the seam.
   *
   * Linear in the number of levels - intended for a per-camera-move query over
   * a world of hundreds of levels, not for a per-frame query over thousands.
   */
  public getLevelsInBounds(bounds: MapBounds): MapLevel[] {
    const out: MapLevel[] = [];

    for (const level of this.levels) {
      const b = level.bounds;
      if (b.x < bounds.x + bounds.width && bounds.x < b.x + b.width && b.y < bounds.y + bounds.height && bounds.y < b.y + b.height) {
        out.push(level);
      }
    }

    return out;
  }
}
