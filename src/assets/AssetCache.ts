import { AssetCacheError, type AssetCacheOperation } from './AssetCacheError';
import type { CacheLayout, CacheLayoutContext } from './CacheLayout';
import type { CacheContext } from './CachePolicy';
import { cacheMiss, type CacheReadResult } from './CacheReadResult';
import type { CacheRecordKey } from './CacheRecordKey';
import { CacheRoute, type CacheRouteOptions } from './CacheRoute';
import type { CacheStore } from './CacheStore';
import type { SourceKey } from './canonicalKey';

/** Construction options for an {@link AssetCache}. */
export interface AssetCacheOptions extends Omit<CacheRouteOptions, 'types'> {
  /**
   * Rules applied before the default one, in order. The first route that
   * claims an asset type wins; a route without `types` claims everything from
   * its position onwards, so any route after it is unreachable.
   */
  readonly routes?: readonly CacheRoute[];
}

/**
 * One acquisition an {@link AssetCache} is asked to resolve.
 * @internal
 */
export interface CacheAcquisition<T> {
  /** Storage namespace, which is the asset type's stable `id`. */
  readonly namespace: string;
  readonly sourceKey: SourceKey;
  /** How the acquired representation is laid out in storage. */
  readonly layout: CacheLayout<T>;
  readonly signal?: AbortSignal | undefined;
  /** Acquire the representation from the network. */
  fetch(): Promise<T>;
  /** Where a cache failure is reported, whether or not a policy then degrades it. */
  report(error: AssetCacheError): void;
}

/**
 * The application's caching configuration: which stores exist, which asset
 * types use which of them, and in what order the cache and the network are
 * consulted.
 *
 * The common case needs none of this vocabulary - passing a store straight to
 * the loader configures one cache-first route over it:
 *
 * ```ts
 * new Application({ loader: { cache: new IndexedDbStore('my-game') } });
 * ```
 *
 * The full form exists for applications that need more than one tier or more
 * than one policy:
 *
 * ```ts
 * new Application({
 *   loader: {
 *     cache: new AssetCache({
 *       read: [memory, persistent],
 *       write: [persistent],
 *       promote: true,
 *       routes: [new CacheRoute({ types: ['config'], policy: new NetworkFirstPolicy(), stores: persistent })],
 *     }),
 *   },
 * });
 * ```
 *
 * ## What it does not do
 *
 * An `AssetCache` never builds a resource, never reads a `Response` and never
 * decides how a representation is serialized. It selects a route, hands the
 * route's policy a {@link CacheContext}, and turns that context's record reads
 * and writes into store calls. Representation is the asset type's; construction
 * is the factory's.
 */
export class AssetCache {
  private readonly _routes: readonly CacheRoute[];
  private readonly _default: CacheRoute;
  /**
   * Memoized namespace-to-route decisions. Route lists are short, but a route
   * is selected once per acquisition and the same handful of namespaces recur,
   * so the scan is paid once per type rather than once per asset.
   */
  private readonly _resolved = new Map<string, CacheRoute>();

  public constructor(options: AssetCacheOptions = {}) {
    const { routes = [], ...defaults } = options;

    this._routes = [...routes];
    this._default = new CacheRoute(defaults);
  }

  /**
   * Interpret a loader's `cache` option: an existing cache passes through, and
   * one or more stores become a single cache-first route over them.
   * @internal
   */
  public static from(cache: AssetCache | CacheStore | readonly CacheStore[]): AssetCache {
    return cache instanceof AssetCache ? cache : new AssetCache({ stores: cache });
  }

  /** The route that governs `namespace`. */
  public routeFor(namespace: string): CacheRoute {
    let route = this._resolved.get(namespace);

    if (route === undefined) {
      route = this._routes.find(candidate => candidate.matches(namespace)) ?? this._default;
      this._resolved.set(namespace, route);
    }

    return route;
  }

  /**
   * Resolve one acquisition through the route that governs its namespace.
   * @internal
   */
  public resolve<T>(acquisition: CacheAcquisition<T>): Promise<T> {
    const route = this.routeFor(acquisition.namespace);
    // Resolved here and nowhere else: one acquisition, one policy, decided
    // before any of it runs.
    const policy = route.policyFor({ namespace: acquisition.namespace, sourceKey: acquisition.sourceKey });

    return policy.resolve(new RoutedCacheContext(route, acquisition));
  }

  /**
   * Drop cached records: those of one asset type, or every record in every
   * store this cache knows.
   *
   * Rejects with the first failure a store reported, after attempting all of
   * them. Assets are re-fetchable, so a partial clear is not a state that needs
   * unwinding.
   */
  public async clear(namespace?: string): Promise<void> {
    let failure: AssetCacheError | null = null;

    for (const store of this._stores()) {
      try {
        await store.clear(namespace);
      } catch (error: unknown) {
        failure ??= asCacheError(error, 'clear', namespace);
      }
    }

    if (failure !== null) {
      throw failure;
    }
  }

  /** Destroys every store this cache holds, each exactly once. */
  public destroy(): void {
    for (const store of this._stores()) {
      store.destroy();
    }
  }

  /** Every distinct store across every route, read and write alike. */
  private _stores(): Set<CacheStore> {
    const stores = new Set<CacheStore>();

    for (const route of [...this._routes, this._default]) {
      for (const store of route.readStores) {
        stores.add(store);
      }

      for (const store of route.writeStores) {
        stores.add(store);
      }
    }

    return stores;
  }
}

/**
 * The {@link CacheContext} one policy call sees, bound to one route and one
 * acquisition.
 *
 * It is also what turns the layout's named records into store calls, so the
 * layout never composes a record key and the policy never names a record.
 */
class RoutedCacheContext<T> implements CacheContext<T> {
  public readonly namespace: string;
  public readonly sourceKey: SourceKey;
  public readonly signal?: AbortSignal | undefined;

  private readonly _route: CacheRoute;
  private readonly _acquisition: CacheAcquisition<T>;
  private readonly _layoutContext: CacheLayoutContext;

  public constructor(route: CacheRoute, acquisition: CacheAcquisition<T>) {
    this.namespace = acquisition.namespace;
    this.sourceKey = acquisition.sourceKey;
    this.signal = acquisition.signal;

    this._route = route;
    this._acquisition = acquisition;
    this._layoutContext = {
      read: record => this._readRecord(record),
      write: (record, value) => this._writeRecord(record, value),
    };
  }

  public read(): Promise<CacheReadResult<T>> {
    if (this._route.readStores.length === 0) {
      return Promise.resolve(cacheMiss);
    }

    return this._acquisition.layout.read(this._layoutContext);
  }

  public fetch(): Promise<T> {
    return this._acquisition.fetch();
  }

  public write(value: T): Promise<void> {
    if (this._route.writeStores.length === 0) {
      return Promise.resolve();
    }

    return this._acquisition.layout.write(value, this._layoutContext);
  }

  private _key(record: string): CacheRecordKey {
    return { namespace: this.namespace, source: this.sourceKey, version: this._acquisition.layout.version, record };
  }

  /**
   * Read one record from the route's stores in order, stopping at the first
   * hit.
   *
   * A store that could not answer does not end the read - a broken memory tier
   * must not hide a healthy persistent one - but it is reported immediately,
   * and raised once every store has been tried without a hit. That keeps the
   * two outcomes a policy has to tell apart distinct: a clean miss resolves,
   * anything else rejects.
   */
  private async _readRecord(record: string): Promise<CacheReadResult> {
    const key = this._key(record);
    let failure: AssetCacheError | null = null;

    for (const [index, store] of this._route.readStores.entries()) {
      let result: CacheReadResult;

      try {
        result = await store.get(key);
      } catch (error: unknown) {
        failure ??= this._report(error, 'read', key);

        continue;
      }

      if (result.hit) {
        await this._promote(index, key, result.value);

        return result;
      }
    }

    if (failure !== null) {
      throw failure;
    }

    return cacheMiss;
  }

  /** Write one record to every write store, reporting each failure and raising the first. */
  private async _writeRecord(record: string, value: unknown): Promise<void> {
    // A load that was cancelled has no business filling a cache: the
    // representation may be incomplete, and nothing is waiting for it.
    if (this.signal?.aborted === true) {
      return;
    }

    const key = this._key(record);
    let failure: AssetCacheError | null = null;

    for (const store of this._route.writeStores) {
      try {
        await store.set(key, value);
      } catch (error: unknown) {
        failure ??= this._report(error, 'write', key);
      }
    }

    if (failure !== null) {
      throw failure;
    }
  }

  /**
   * Copy a hit into the read stores ahead of the one that answered, so the next
   * read finds it in the cheaper tier.
   *
   * Only stores this route also writes are promoted into, and a failed
   * promotion never fails the read it came from: it is an optimisation, and the
   * value is already in hand.
   */
  private async _promote(hitIndex: number, key: CacheRecordKey, value: unknown): Promise<void> {
    if (!this._route.promote || hitIndex === 0) {
      return;
    }

    for (const store of this._route.readStores.slice(0, hitIndex)) {
      if (!this._route.writeStores.includes(store)) {
        continue;
      }

      try {
        await store.set(key, value);
      } catch (error: unknown) {
        this._report(error, 'write', key);
      }
    }
  }

  /** Hand one store failure to the acquisition's diagnostics, and give back the typed error to raise. */
  private _report(error: unknown, operation: 'read' | 'write', key: CacheRecordKey): AssetCacheError {
    const reported = asCacheError(error, operation, key.namespace, key.record);

    this._acquisition.report(reported);

    return reported;
  }
}

/** Type an arbitrary store rejection, leaving one the store already typed alone. */
function asCacheError(error: unknown, operation: AssetCacheOperation, store?: string, key?: string): AssetCacheError {
  if (error instanceof AssetCacheError) {
    return error;
  }

  return new AssetCacheError({ operation, message: 'A cache store failed.', store, key, cause: error });
}
