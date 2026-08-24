import type { LoaderScope } from '@codexo/exojs';
import { Asset } from '@codexo/exojs';
import type { MapLevelLoadContext, MapWorld, TileMap, TileSet } from '@codexo/exojs-tilemap';
import { MapWorldRuntime } from '@codexo/exojs-tilemap';

import type { LdtkData, LdtkLevel } from './LdtkData';
import type { LdtkLevelEntry } from './ldtkLevelEntries';
import { getLdtkLevelEntries } from './ldtkLevelEntries';
import { ldtkToMapWorld } from './ldtkToMapWorld';
import { ldtkLevelToTileMap } from './ldtkToTileMap';
import { resolveLdtkUrl } from './url';
import { validateLdtkLevelData } from './validate';

/** Options for {@link LdtkProject.createRuntime}. */
export interface LdtkRuntimeOptions {
  /**
   * Parent scope for everything the runtime loads. The runtime creates its own
   * child scope under it and never destroys this one.
   */
  readonly scope: LoaderScope;
  /**
   * Which world of a multi-world project to stream, by identifier. Defaults to
   * the first world in document order, which is the only one a single-world
   * project has.
   */
  readonly world?: string;
}

/**
 * A loaded LDtk project, prepared for streaming: world layout and tileset
 * atlases are resident, level payloads are not.
 *
 * This is the entry point for a game that loads levels as it needs them. Read
 * {@link worlds} to decide what to load, then drive a
 * {@link MapWorldRuntime} from {@link createRuntime} to load and unload
 * individual levels, each with its own asset scope.
 *
 * What is eager, and why:
 *
 * - the `.ldtk` document itself, because the world layout is what the game
 *   navigates by;
 * - every tileset atlas, because they are shared between levels and a level
 *   load that had to wait for an image fetch would stutter at exactly the
 *   wrong moment.
 *
 * What is lazy:
 *
 * - external `.ldtkl` level payloads - fetched when the level loads, claimed
 *   by that level's scope, released when it unloads;
 * - the conversion of a level into a runtime `TileMap`;
 * - anything the level's {@link import('@codexo/exojs-tilemap').MapObjectSpawner} creates.
 *
 * Load the whole project at once with the `ldtkMap` asset type instead
 * ({@link import('./LdtkMap').LdtkMap}) when a game is small enough not to
 * need any of this.
 *
 * @example
 * ```ts
 * const project = await scene.loader.load(Asset.type('ldtkProject', 'world.ldtk'));
 * const runtime = project.createRuntime({ scope: scene.loader });
 *
 * const forest = await runtime.loadLevel(project.world.getLevelByName('Forest')!.id, {
 *   spawner,
 *   context: { services, save },
 * });
 *
 * scene.addChild(forest.map.createView().root);
 * runtime.unloadLevel(forest.id);
 * ```
 */
export class LdtkProject {

  /** Resolved URL this project was loaded from. */
  public readonly source: string;
  /** The raw parsed LDtk document. Externalized levels still carry `layerInstances: null`. */
  public readonly data: LdtkData;
  /** Runtime tilesets keyed by LDtk tileset uid, shared by every level of the project. */
  public readonly tilesets: ReadonlyMap<number, TileSet>;
  /** World layout, one entry per LDtk world. See {@link import('./ldtkToMapWorld').ldtkToMapWorld}. */
  public readonly worlds: readonly MapWorld[];

  private readonly _entries: readonly LdtkLevelEntry[];

  /** Projects are produced by the `ldtkProject` asset binding. @internal */
  public constructor(source: string, data: LdtkData, tilesets: ReadonlyMap<number, TileSet>) {
    this.source = source;
    this.data = data;
    this.tilesets = tilesets;
    this.worlds = ldtkToMapWorld(data);
    this._entries = getLdtkLevelEntries(data);
  }

  /**
   * The project's only world. For a multi-world project this is the first in
   * document order; read {@link worlds} to reach the others.
   */
  public get world(): MapWorld {
    const [first] = this.worlds;

    if (first === undefined) {
      throw new Error(`LdtkProject: "${this.source}" declares no world.`);
    }

    return first;
  }

  /** The world with this identifier, or `undefined`. */
  public getWorld(name: string): MapWorld | undefined {
    return this.worlds.find(world => world.name === name);
  }

  /**
   * Create the live runtime that loads and unloads this project's levels.
   *
   * The runtime is a separate lifetime from the project: destroying it unloads
   * every level it holds and leaves the project - document, world layout and
   * tilesets - intact, ready for a new runtime.
   *
   * @throws {Error} when `options.world` names no world of this project.
   */
  public createRuntime(options: LdtkRuntimeOptions): MapWorldRuntime {
    const world = options.world === undefined ? this.world : this.getWorld(options.world);

    if (world === undefined) {
      throw new Error(`LdtkProject: "${this.source}" has no world named "${options.world ?? ''}".`);
    }

    return new MapWorldRuntime({
      world,
      scope: options.scope,
      load: context => this._loadLevel(context),
    });
  }

  private async _loadLevel(context: MapLevelLoadContext): Promise<TileMap> {
    const entry = this._entries[context.level.index];

    if (entry === undefined) {
      throw new Error(
        `LdtkProject: level "${context.level.id}" has index ${context.level.index}, which is outside "${this.source}".`,
      );
    }

    const level = await this._resolveLevel(entry.level, context.scope);

    return ldtkLevelToTileMap(level, entry.worldIid, context.level.index, this.data, this.tilesets);
  }

  /**
   * Fetch an externalized level's `.ldtkl` payload and merge it into the level
   * record. The fetch is claimed by the level's own scope, so it is released
   * when the level unloads and re-fetched (or served from the loader's cache)
   * on a later load.
   */
  private async _resolveLevel(level: LdtkLevel, scope: LoaderScope): Promise<LdtkLevel> {
    if (level.layerInstances !== null || level.externalRelPath === undefined || level.externalRelPath === null || level.externalRelPath === '') {
      return level;
    }

    const url = resolveLdtkUrl(level.externalRelPath, this.source);
    // Validated as strictly as an inlined level, with the `.ldtkl` file as the
    // error source - a malformed external payload must fail as loudly.
    const external = validateLdtkLevelData(await scope.load(Asset.type('json', url)), url);
    const fieldInstances = external.fieldInstances ?? level.fieldInstances;

    return {
      ...level,
      layerInstances: external.layerInstances,
      ...(fieldInstances !== undefined && { fieldInstances }),
    };
  }
}
