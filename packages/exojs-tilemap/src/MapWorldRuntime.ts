import type { Destroyable, LoaderScope } from '@codexo/exojs';

import type { MapObjectSpawner } from './MapObjectSpawner';
import type { MapSpawnSession } from './MapSpawnSession';
import type { MapLevel, MapWorld } from './MapWorld';
import type { TileMap } from './TileMap';

/** What a {@link MapLevelProvider} is given for one level load. */
export interface MapLevelLoadContext {
  /** Metadata of the level being loaded. */
  readonly level: MapLevel;
  /**
   * The level's own {@link LoaderScope}. Assets claimed through it are released
   * when the level unloads, and claiming an asset another level also holds
   * never takes it away from that level.
   */
  readonly scope: LoaderScope;
  /** Aborts when the level is unloaded or the load is cancelled. */
  readonly signal: AbortSignal;
}

/**
 * Produces the runtime {@link TileMap} for one level - the single seam where a
 * source format meets the format-neutral world runtime.
 *
 * Anything awaitable is accepted, so a provider can hand back a
 * {@link LoaderScope.load} queue directly.
 *
 * The returned map becomes **owned by that level runtime**, which destroys it
 * on unload. Return a map built for this load; handing back a shared map (an
 * entry of an eagerly converted document, say) makes the runtime destroy an
 * object other code still holds.
 */
export type MapLevelProvider = (context: MapLevelLoadContext) => TileMap | PromiseLike<TileMap>;

/** Options for {@link MapWorldRuntime}. */
export interface MapWorldRuntimeOptions {
  /** The world metadata to stream levels out of. */
  readonly world: MapWorld;
  /** Builds a level's runtime map. See {@link MapLevelProvider} for its ownership rule. */
  readonly load: MapLevelProvider;
  /**
   * Parent scope for everything the runtime loads - typically `scene.loader`.
   *
   * The runtime creates its own child scope under it and never destroys the
   * scope it was given: the caller keeps owning that lifetime.
   */
  readonly scope: LoaderScope;
  /** Diagnostic name for the runtime's own scope. Defaults to the world's name. */
  readonly name?: string;
}

/** Options for {@link MapWorldRuntime.loadLevel}. */
export interface MapLevelLoadOptions<Context, Result extends Destroyable> {
  /** Spawns the level's map objects as part of the load. */
  readonly spawner?: MapObjectSpawner<Context, Result>;
  /** Value handed to every factory of `spawner`. */
  readonly context: Context;
  /** Cancels this load. Unloading the level cancels it too. */
  readonly signal?: AbortSignal;
}

/**
 * One loaded level and everything that load produced.
 *
 * Created by {@link MapWorldRuntime.loadLevel}; destroying it unloads the
 * level. There is nothing else to release afterwards - the map, the spawned
 * objects and the level's asset claims all end here.
 *
 * @typeParam Result - what the level's spawner produced, if it had one.
 */
export class MapLevelRuntime<Result extends Destroyable = Destroyable> implements Destroyable {

  /** {@link MapLevel.id} of the loaded level. */
  public readonly id: string;
  /** Metadata of the loaded level. */
  public readonly level: MapLevel;
  /** The level's asset scope. Released last, after everything that could hold an asset is gone. */
  public readonly scope: LoaderScope;
  /** The level's runtime map, owned by this runtime. */
  public readonly map: TileMap;
  /** What the level's spawner produced, or `null` when the load ran without one. */
  public readonly spawns: MapSpawnSession<Result> | null;

  private readonly _onDestroy: (runtime: MapLevelRuntime) => void;
  private _destroyed = false;

  /** Level runtimes are produced by {@link MapWorldRuntime.loadLevel}. @internal */
  public constructor(
    level: MapLevel,
    scope: LoaderScope,
    map: TileMap,
    spawns: MapSpawnSession<Result> | null,
    onDestroy: (runtime: MapLevelRuntime) => void,
  ) {
    this.id = level.id;
    this.level = level;
    this.scope = scope;
    this.map = map;
    this.spawns = spawns;
    this._onDestroy = onDestroy;
  }

  /** Whether this level has been unloaded. */
  public get destroyed(): boolean {
    return this._destroyed;
  }

  /**
   * Unload the level: destroy the spawned objects (reverse spawn order), then
   * the map, then release the level's asset claims. Idempotent.
   *
   * The scope goes last because everything before it may still be reading a
   * texture the scope keeps resident.
   */
  public destroy(): void {
    if (this._destroyed) return;

    this._destroyed = true;
    this._onDestroy(this);
    this.spawns?.destroy();
    this.map.destroy();
    this.scope.destroy();
  }
}

interface InFlightLoad {
  readonly promise: Promise<MapLevelRuntime>;
  readonly controller: AbortController;
}

/**
 * The live side of a {@link MapWorld}: loads and unloads levels on demand, each
 * with its own asset scope and its own lifetime.
 *
 * ExoJS provides the mechanism, not the streaming policy. Nothing here watches
 * a camera or guesses a radius: game code reads
 * {@link MapWorld.getNeighbours} / {@link MapWorld.getLevelsInBounds} and calls
 * {@link loadLevel} and {@link unloadLevel} when it decides to.
 *
 * Scope layout - the runtime owns everything below its own scope and nothing
 * above it:
 *
 * ```text
 * scene.loader          (given to the runtime, never destroyed by it)
 *  └─ world             (the runtime's own scope)
 *      ├─ level:forest
 *      └─ level:cave
 * ```
 *
 * @example
 * ```ts
 * const runtime = new MapWorldRuntime({
 *   world,
 *   scope: scene.loader,
 *   load: ({ level, scope, signal }) => buildLevelMap(level, scope, signal),
 * });
 *
 * const forest = await runtime.loadLevel('forest', { spawner, context });
 * scene.addChild(forest.map.createView().root);
 *
 * runtime.unloadLevel('forest');
 * ```
 */
export class MapWorldRuntime implements Destroyable {

  /** The world this runtime streams levels out of. */
  public readonly world: MapWorld;
  /** The runtime's own scope: parent of every level scope, child of the injected one. */
  public readonly scope: LoaderScope;

  private readonly _load: MapLevelProvider;
  private readonly _live = new Map<string, MapLevelRuntime>();
  private readonly _inFlight = new Map<string, InFlightLoad>();
  private _destroyed = false;

  public constructor(options: MapWorldRuntimeOptions) {
    this.world = options.world;
    this._load = options.load;
    this.scope = options.scope.createScope({ name: options.name ?? (this.world.name || 'world') });
  }

  /** Whether {@link destroy} has run. */
  public get destroyed(): boolean {
    return this._destroyed;
  }

  /** Every currently loaded level, in load order. */
  public get levels(): readonly MapLevelRuntime[] {
    return [...this._live.values()];
  }

  /** The loaded level with this id, or `undefined` when it is not loaded. */
  public getLevel(id: string): MapLevelRuntime | undefined {
    return this._live.get(id);
  }

  /** Whether the level is loaded. A load still in flight does not count as loaded. */
  public isLoaded(id: string): boolean {
    return this._live.has(id);
  }

  /** Whether a load for this level is currently running. */
  public isLoading(id: string): boolean {
    return this._inFlight.has(id);
  }

  /**
   * Load a level, or return the one already loaded.
   *
   * At most one runtime exists per level id. Calling this while the level is
   * loaded resolves to that runtime, and calling it while a load is in flight
   * joins that load rather than starting a second one. **Options belong to the
   * call that actually starts the load** - a joining call's `spawner`,
   * `context` and `signal` are not applied, because the level being produced is
   * the one the first call asked for.
   *
   * A failed or aborted load leaves nothing behind: the map, anything the
   * spawner created, and the level's asset claims are all released before the
   * rejection surfaces, and the level can be loaded again.
   *
   * @throws {Error} when the world has no level with this id, or the runtime is destroyed.
   * @throws {DOMException} named `AbortError` when the load is cancelled.
   */
  public loadLevel<Context = void, Result extends Destroyable = Destroyable>(
    id: string,
    options?: MapLevelLoadOptions<Context, Result>,
  ): Promise<MapLevelRuntime<Result>> {
    // The live map erases Result - one runtime holds levels loaded with
    // different spawners - while every call site keeps its own through the
    // signature above.
    const typed = (promise: Promise<MapLevelRuntime>): Promise<MapLevelRuntime<Result>> =>
      promise as Promise<MapLevelRuntime<Result>>;

    if (this._destroyed) {
      return Promise.reject(new Error(`MapWorldRuntime: cannot load level "${id}" - the runtime is destroyed.`));
    }

    const live = this._live.get(id);
    if (live !== undefined) return typed(Promise.resolve(live));

    const pending = this._inFlight.get(id);
    if (pending !== undefined) return typed(pending.promise);

    const level = this.world.getLevel(id);
    if (level === undefined) {
      return Promise.reject(
        new Error(`MapWorldRuntime: world "${this.world.name}" has no level with id "${id}".`),
      );
    }

    const controller = new AbortController();
    const signal = options?.signal;
    const forward = (): void => controller.abort();

    if (signal !== undefined) {
      if (signal.aborted) {
        return Promise.reject(new DOMException(`Level "${id}" load was cancelled.`, 'AbortError'));
      }

      signal.addEventListener('abort', forward, { once: true });
    }

    const promise = this._runLoad(level, controller.signal, options).finally(() => {
      // The caller's signal can outlive the load by a lot - a scene-lifetime
      // signal would otherwise accumulate one listener per level loaded.
      signal?.removeEventListener('abort', forward);

      // Only clear the entry this call installed: an unload during the load
      // may already have started a fresh one under the same id.
      if (this._inFlight.get(id)?.controller === controller) this._inFlight.delete(id);
    });

    this._inFlight.set(id, { promise, controller });

    return typed(promise);
  }

  /**
   * Unload a level, or cancel its load when one is in flight. Returns whether
   * there was anything to unload.
   *
   * A cancelled load rejects with an `AbortError` for whoever started it.
   */
  public unloadLevel(id: string): boolean {
    const pending = this._inFlight.get(id);

    if (pending !== undefined) {
      pending.controller.abort();
      return true;
    }

    const live = this._live.get(id);

    if (live !== undefined) {
      live.destroy();
      return true;
    }

    return false;
  }

  /**
   * Cancel every load in flight, unload every loaded level in reverse load
   * order, and release the runtime's own scope. Idempotent.
   *
   * The scope the runtime was constructed with is left alone - it belongs to
   * whoever passed it in.
   */
  public destroy(): void {
    if (this._destroyed) return;

    this._destroyed = true;

    for (const pending of [...this._inFlight.values()]) {
      pending.controller.abort();
    }

    for (const runtime of [...this._live.values()].reverse()) {
      runtime.destroy();
    }

    this.scope.destroy();
  }

  private async _runLoad<Context, Result extends Destroyable>(
    level: MapLevel,
    signal: AbortSignal,
    options: MapLevelLoadOptions<Context, Result> | undefined,
  ): Promise<MapLevelRuntime> {
    const scope = this.scope.createScope({ name: `level:${level.id}` });
    let map: TileMap | undefined;
    let spawns: MapSpawnSession<Result> | null = null;

    try {
      throwIfAborted(level.id, signal);

      map = await this._load({ level, scope, signal });

      throwIfAborted(level.id, signal);

      if (options?.spawner !== undefined) {
        spawns = await options.spawner.spawn(map, options.context, { signal });
        throwIfAborted(level.id, signal);
      }
    } catch (error) {
      spawns?.destroy();
      map?.destroy();
      scope.destroy();
      throw error;
    }

    const runtime = new MapLevelRuntime<Result>(level, scope, map, spawns, (destroyed) => {
      if (this._live.get(destroyed.id) === destroyed) this._live.delete(destroyed.id);
    });

    this._live.set(level.id, runtime);

    return runtime;
  }
}

function throwIfAborted(id: string, signal: AbortSignal): void {
  if (signal.aborted) {
    throw new DOMException(`Level "${id}" load was cancelled.`, 'AbortError');
  }
}
