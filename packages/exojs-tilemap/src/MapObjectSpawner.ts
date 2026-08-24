import type { Destroyable, SceneNode } from '@codexo/exojs';
import { logger } from '@codexo/exojs';

import type { MapObjectDescriptor } from './MapObject';
import { mapObjectDescriptors } from './MapObject';
import { MapSpawnSession } from './MapSpawnSession';
import type { TileMap } from './TileMap';

/** Why a {@link MapSpawnError} was raised. */
export type MapSpawnErrorReason =
  /** No factory is registered for the object's dispatch key and `unknown` is `'error'`. */
  | 'unknown-kind'
  /** Two objects of the same map resolved to the same stable id. */
  | 'duplicate-id'
  /** A factory threw or rejected. The original error is the `cause`. */
  | 'factory-failed';

/**
 * A spawn failed. The whole spawn is rolled back before this is thrown - no
 * partial session exists.
 *
 * For `'factory-failed'` the error a factory raised is preserved as `cause`.
 */
export class MapSpawnError extends Error {

  public override readonly name = 'MapSpawnError';
  public readonly reason: MapSpawnErrorReason;
  /** {@link MapObjectDescriptor.id} of the object that failed. */
  public readonly objectId: string;
  /** {@link MapObjectDescriptor.kind} of the object that failed. */
  public readonly kind: string | null;

  public constructor(reason: MapSpawnErrorReason, objectId: string, kind: string | null, message: string, options?: ErrorOptions) {
    super(message, options);
    this.reason = reason;
    this.objectId = objectId;
    this.kind = kind;
  }
}

/**
 * Creates one runtime object from one map object, or `null` to deliberately
 * create nothing for it.
 *
 * `signal` aborts with the spawn it belongs to; a factory that loads assets or
 * awaits anything else should pass it on, so a level unloaded mid-load stops
 * its own work too.
 */
export type MapObjectFactory<Context, Result extends Destroyable> = (
  object: MapObjectDescriptor,
  context: Context,
  signal: AbortSignal,
) => Result | null | Promise<Result | null>;

/** Dispatch key to factory. Keys are matched against the spawner's `identify` result. */
export type MapObjectFactories<Context, Result extends Destroyable> = Readonly<
  Record<string, MapObjectFactory<Context, Result>>
>;

/** What to do with an object no factory is registered for. */
export type UnknownMapObjectPolicy = 'ignore' | 'error';

/** Options for {@link MapObjectSpawner}. */
export interface MapObjectSpawnerOptions<Context> {
  /**
   * Picks the factory key for an object, or returns `null` to treat it as
   * unknown. Defaults to {@link MapObjectDescriptor.kind}.
   *
   * This is where project-specific dispatch policy lives - keying on a
   * property, a name prefix, or a compound key:
   *
   * ```ts
   * identify: object => `${object.kind}:${object.properties.variant}`
   * ```
   */
  readonly identify?: (object: MapObjectDescriptor, context: Context) => string | null;
  /**
   * What to do with an object no factory matched. Defaults to `'ignore'`,
   * because maps legitimately carry editor markers, decoration and metadata
   * objects that no game entity corresponds to. Use `'error'` for a map format
   * the project fully controls and wants validated.
   */
  readonly unknown?: UnknownMapObjectPolicy;
}

/** Options for {@link MapObjectSpawner.spawn}. */
export interface MapSpawnOptions {
  /**
   * Cancels the spawn. An in-flight factory is still awaited - abandoning it
   * would leak whatever it eventually produced - but its result is destroyed
   * along with the rest of the rollback.
   */
  readonly signal?: AbortSignal;
}

/**
 * Turns the objects authored in a map into game objects.
 *
 * A spawner owns its own dispatch table, so several games, tests, editor
 * previews or mods can run in one process without seeing each other's
 * factories. There is no global registry to register into and nothing to reset
 * between tests.
 *
 * ExoJS owns the mechanism: identity, ordering, cancellation, rollback and
 * lifetime. The game owns the policy: which object becomes what, and what those
 * objects need - dependencies travel through `Context`, not through any
 * service locator in the engine.
 *
 * A spawn is **atomic**: if any factory fails, everything already created is
 * destroyed in reverse order and no session is produced.
 *
 * @typeParam Context - the per-spawn value handed to every factory.
 * @typeParam Result - what the factories produce. Defaults to `SceneNode`.
 *
 * @example
 * ```ts
 * interface GameContext {
 *   services: GameServices;
 *   save: SaveGame;
 * }
 *
 * const spawner = new MapObjectSpawner<GameContext>({
 *   Enemy: (object, ctx) => new Enemy({ x: object.x, y: object.y, services: ctx.services }),
 *   Chest: (object, ctx) => new Chest({ id: object.id, save: ctx.save }),
 * });
 *
 * const session = await spawner.spawn(map, { services, save });
 * session.get('chest-in-the-cellar')?.open();
 * session.destroy();
 * ```
 */
export class MapObjectSpawner<Context = void, Result extends Destroyable = SceneNode> {

  /** What to do with an object no factory matched. */
  public readonly unknown: UnknownMapObjectPolicy;

  private readonly _factories: MapObjectFactories<Context, Result>;
  private readonly _identify: (object: MapObjectDescriptor, context: Context) => string | null;

  public constructor(
    factories: MapObjectFactories<Context, Result>,
    options?: MapObjectSpawnerOptions<Context>,
  ) {
    this._factories = factories;
    this._identify = options?.identify ?? defaultIdentify;
    this.unknown = options?.unknown ?? 'ignore';
  }

  /** Whether a factory is registered under `key`. */
  public handles(key: string): boolean {
    return Object.prototype.hasOwnProperty.call(this._factories, key);
  }

  /**
   * Create a game object for every object of `map` a factory matches, and
   * return the {@link MapSpawnSession} that owns them.
   *
   * Objects are visited in object-layer order, then object order within each
   * layer, and asynchronous factories are awaited in that same order - a
   * factory that resolves early can never overtake one before it.
   *
   * @throws {MapSpawnError} when a factory fails, two objects share a stable id,
   * or an unmatched object is found while `unknown` is `'error'`. In every case
   * the objects already created are destroyed first. A factory that fails while
   * the spawn is also being aborted reports the factory failure, not the abort -
   * the more specific of the two.
   * @throws {DOMException} named `AbortError` when `options.signal` aborts.
   */
  public async spawn(map: TileMap, context: Context, options?: MapSpawnOptions): Promise<MapSpawnSession<Result>> {
    const signal = options?.signal ?? neverAborts();
    const entries: Array<readonly [id: string, result: Result]> = [];
    const seen = new Set<string>();

    try {
      throwIfAborted(signal);

      for (const object of mapObjectDescriptors(map)) {
        if (seen.has(object.id)) {
          throw new MapSpawnError(
            'duplicate-id',
            object.id,
            object.kind,
            `MapObjectSpawner: two objects of this map resolve to the stable id "${object.id}"; ` +
              'ids must be unique within a map for session lookup and savegame restoration to work.',
          );
        }

        seen.add(object.id);

        const key = this._identify(object, context);
        // Own-property check before indexing: a map is free to name an object
        // class "toString" or "constructor", and a bare index would resolve
        // those against Object.prototype and call a function that is not a
        // factory at all.
        const factory = key !== null && this.handles(key) ? this._factories[key] : undefined;

        if (factory === undefined) {
          if (this.unknown === 'error') {
            throw new MapSpawnError(
              'unknown-kind',
              object.id,
              object.kind,
              `MapObjectSpawner: no factory registered for "${key ?? '<no kind>'}" (object "${object.id}" ` +
                `on layer "${object.layer.name}"). Register one, or set unknown: 'ignore'.`,
            );
          }

          continue;
        }

        const result = await runFactory(factory, object, context, signal);

        // Push before the abort check so a result that arrived after the abort
        // is rolled back with the rest instead of being left unowned.
        if (result !== null) entries.push([object.id, result]);

        throwIfAborted(signal);
      }
    } catch (error) {
      for (let i = entries.length - 1; i >= 0; i--) {
        const entry = entries[i];
        if (entry === undefined) continue;

        // A failing rollback step must neither replace the error that caused
        // the rollback nor strand the objects before it.
        try {
          entry[1].destroy();
        } catch (rollbackError) {
          logger.error(`MapObjectSpawner: rolling back object "${entry[0]}" failed; continuing rollback.`, {
            source: 'tilemap',
            ...(rollbackError instanceof Error && { error: rollbackError }),
          });
        }
      }

      throw error;
    }

    return new MapSpawnSession(entries);
  }
}

function defaultIdentify(object: MapObjectDescriptor): string | null {
  return object.kind;
}

async function runFactory<Context, Result extends Destroyable>(
  factory: MapObjectFactory<Context, Result>,
  object: MapObjectDescriptor,
  context: Context,
  signal: AbortSignal,
): Promise<Result | null> {
  try {
    return await factory(object, context, signal);
  } catch (error) {
    throw new MapSpawnError(
      'factory-failed',
      object.id,
      object.kind,
      `MapObjectSpawner: the factory for "${object.kind ?? '<no kind>'}" failed on object "${object.id}" ` +
        `of layer "${object.layer.name}".`,
      { cause: error },
    );
  }
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new DOMException('Map object spawn was cancelled.', 'AbortError');
  }
}

// One shared never-aborting signal: `spawn` without a signal is the common
// case, and a fresh AbortController per spawn would allocate for nothing.
let sharedNeverAborts: AbortSignal | undefined;

function neverAborts(): AbortSignal {
  sharedNeverAborts ??= new AbortController().signal;
  return sharedNeverAborts;
}
