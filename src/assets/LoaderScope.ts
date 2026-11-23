import type { ManifestPack } from '#assets/container/AssetManifest';
import { Signal } from '#core/Signal';
import type { Destroyable } from '#core/types';

import type { CatalogEntry, KindByPath, LeafForPath } from './AssetDefinitions';
import type { AssetDescriptorLeaf, LocatorAssetDescriptor, ValidatedLeafDescriptor } from './AssetDescriptor';
import type { AssetLoadInput, LoadedAssets, ValidatedAssetLoadInput } from './assetLoadGroup';
import type { CatalogResourceLeaf, CatalogValueLeaf } from './assetMeta';
import type { Assets, InferAssetsProperties } from './Assets';
import { LoadBatch } from './LoadBatch';
import type { InferLoadedMap, LoadContainerOptions, Loader, LoadOptions } from './Loader';
import type { LoadingQueue } from './LoadingQueue';

/**
 * What a claim scope represents, for diagnostics only. Ownership never varies
 * by kind: every scope holds and releases claims identically.
 *
 * `'app'` is the loader's own application-lifetime scope, `'scene'` a scene's
 * automatic scope, `'scope'` one created explicitly via
 * {@link Loader.createScope} or {@link LoaderScope.createScope}, `'container'`
 * the entries an asset container unpacked, and `'dependency'` the sub-assets a
 * single asset's own load pulled in.
 */
export type LoaderScopeKind = 'app' | 'scene' | 'scope' | 'container' | 'dependency';

/** Options for {@link Loader.createScope} and {@link LoaderScope.createScope}. */
export interface LoaderScopeOptions {
  /**
   * Human-readable label for this scope, surfaced by {@link Loader.inspect}.
   *
   * Diagnostics only: it takes no part in asset identity, claim identity or
   * scope lookup, and two scopes created under the same name are two
   * independent owners.
   */
  readonly name?: string;
}

let nextScopeId = 1;

/**
 * An owner of asset claims with an explicit lifetime.
 *
 * Assets acquired through a scope stay resident for as long as that scope holds
 * them, and are freed when it releases them - but only if no other scope still
 * holds the same asset. Several scopes can own one asset independently: they
 * share a single fetch and a single resident payload, and one scope releasing
 * never invalidates another.
 *
 * Use the scene's scope for scene assets, and a child scope from
 * {@link createScope} for anything shorter-lived - a level, a streamed chunk, a
 * preview, a prefetch. Assets acquired directly on the {@link Loader} are held
 * for the application's lifetime instead and are freed only when the loader is
 * destroyed.
 *
 * A scope describes a lifetime, never a set of assets: what to acquire comes
 * from an {@link Assets} catalog or an {@link AssetDescriptor} passed to
 * {@link get} / {@link load}, and typed access stays on that catalog.
 *
 * @example
 * ```ts
 * const chunk = app.loader.createScope({ name: 'chunk:12,8' });
 *
 * await chunk.load(chunkAssets);
 * // ... later, when the chunk streams out:
 * chunk.destroy();
 * ```
 */
export class LoaderScope implements Destroyable {
  /** Stable, unique per loader run. Diagnostic only; two scopes are never equal by name or kind. */
  public readonly id: number = nextScopeId++;
  /**
   * Optional human-readable label, surfaced by {@link Loader.inspect}.
   *
   * Purely descriptive: two scopes created under the same name are two
   * independent owners, never the same scope. Naming a scope can therefore
   * never make one consumer release another's claim.
   */
  public readonly name?: string;
  public readonly kind: LoaderScopeKind;

  /** Fired when the first asset of a new batch acquired through THIS scope starts fetching. */
  public readonly onLoadStart = new Signal<[key: string, url: string]>();
  /** Fired after each asset of this scope's batch settles. `loaded` = resolved count, `total` = batch size. */
  public readonly onLoadProgress = new Signal<[loaded: number, total: number, key: string]>();
  /**
   * Fires after every foreground item in this scope's current batch has
   * settled, including failures. It does not imply that every asset succeeded;
   * await the returned loading queue to observe success or failure.
   */
  public readonly onLoadComplete = new Signal();
  /** Fired when an asset acquired through this scope fails to load. Does not prevent {@link onLoadComplete}. */
  public readonly onLoadError = new Signal<[key: string, error: Error]>();

  /** Foreground progress accounting for the work acquired through this scope. @internal */
  public readonly _batch = new LoadBatch(this);

  protected readonly _loader: Loader;

  private readonly _parent?: LoaderScope;
  // Allocated on first child: most scopes never nest, and dependency scopes are
  // created per asset key on the load path.
  private _children?: Set<LoaderScope>;
  private _destroyed = false;

  /** Scopes are created by {@link Loader.createScope} / {@link createScope}, not directly. @internal */
  public constructor(loader: Loader, kind: LoaderScopeKind = 'scope', name?: string, parent?: LoaderScope) {
    this._loader = loader;
    this.kind = kind;

    if (name !== undefined) {
      this.name = name;
    }

    if (parent !== undefined) {
      this._parent = parent;
    }
  }

  /**
   * Creates a child scope: an independent claim owner that cannot outlive this
   * one.
   *
   * The child claims, shares and releases assets exactly like any other scope,
   * and holding the same asset as its parent means two claims, not one.
   * Destroying the child frees only the child's claims; destroying the parent
   * destroys every child it still has first, recursively, so a scene or level
   * teardown reaches the scopes created underneath it.
   *
   * The hierarchy is a lifetime hierarchy only. It never affects asset identity,
   * ownership or what a release frees.
   *
   * @throws If this scope is destroyed: a child created then would never be
   *   reached by its parent's teardown.
   *
   * @example
   * ```ts
   * const world = scene.loader.createScope({ name: 'world' });
   * const chunk = world.createScope({ name: 'chunk:12,8' });
   *
   * chunk.destroy(); // frees only the chunk's claims
   * world.destroy(); // frees the world's claims and any chunk still alive
   * ```
   */
  public createScope(options?: LoaderScopeOptions): LoaderScope {
    this._assertLive('createScope');

    const child = new LoaderScope(this._loader, 'scope', options?.name, this);

    this._children ??= new Set<LoaderScope>();
    this._children.add(child);

    return child;
  }

  // Bare path: a resource suffix yields its heal-in-place handle, a value suffix a stable AssetRef.
  /**
   * Claims an asset for this scope and returns synchronously: a handle that
   * fills in place, a value reference, or a catalog's leaves.
   *
   * Starts loading if the asset is not resident; it is not a passive cache
   * lookup. Await {@link load} when the finished value is required. A bare path
   * reuses its source-keyed handle, while each new descriptor can produce a
   * distinct leaf sharing the same resident payload.
   *
   * @throws If this scope is destroyed, or the input has no synchronous leaf
   *   form.
   */
  public get<S extends string>(path: [KindByPath<S>] extends [never] ? never : S, options?: unknown): LeafForPath<S>;
  public get<const D extends LocatorAssetDescriptor>(descriptor: D & ValidatedLeafDescriptor<D>): AssetDescriptorLeaf<D>;
  public get<T>(leaf: CatalogValueLeaf<T>): CatalogValueLeaf<T>;
  public get<M extends Record<string, CatalogEntry>>(catalog: Assets<M>): InferAssetsProperties<M>;
  // Brand-matched: only a materialized catalog leaf, never a raw resource.
  public get<T extends object>(leaf: CatalogResourceLeaf<T>): CatalogResourceLeaf<T>;
  public get(input: string | object, options?: unknown): unknown {
    this._assertLive('get');

    return this._loader._getClaimed(this, input, options);
  }

  /** Validate a prospective claim without changing the handle or its owner. @internal */
  public _assertLeafOwner(leaf: object): void {
    this._assertLive('get');
    this._loader._assertLeafOwner(leaf);
  }

  /** @internal */
  public get _ownershipRevision(): number {
    return this._loader._ownershipRevision;
  }

  /**
   * Loads into this scope and returns an awaitable queue with progress and
   * cancellation.
   *
   * Accepts a path whose suffix names its type, a handle (`new Texture(path)`,
   * a catalog leaf), an asset descriptor (`{ type: Video, source: 'intro.mp4' }`,
   * `{ type: paletteType, source: 'sunset.json' }`), or an array, tuple or named
   * object of those. A group resolves to the same shape with every entry
   * replaced by its loaded value, and handles heal in place as well. An
   * {@link Assets} catalog resolves to a new map of its finished values.
   *
   * The claims belong to this scope, also when a fetch or decode fails and
   * rejects the queue. Cancelling the queue withdraws only this load's pending
   * stakes. Invalid input throws before any claim is made.
   *
   * With `priority: LoadPriority.Background` the fetches use the background
   * queue and a later foreground request promotes them; types without a
   * placeholder, such as streamed media, cannot load at background priority.
   *
   * @throws If this scope is destroyed, or an entry cannot be resolved to an
   *   installed asset type.
   *
   * @example
   * ```ts
   * const hero = await scope.load('hero.png');
   * const { tiles, music } = await scope.load({ tiles: 'tiles.png', music: { type: Music, source: 'theme.ogg' } });
   * ```
   */
  public load<M extends Record<string, CatalogEntry>>(assets: Assets<M>, options?: LoadOptions): LoadingQueue<InferLoadedMap<M>>;
  public load<const Input extends AssetLoadInput>(
    input: Input & ValidatedAssetLoadInput<Input>,
    options?: LoadOptions,
  ): LoadingQueue<LoadedAssets<Input>>;
  public load(input: unknown, options?: LoadOptions): LoadingQueue<unknown> {
    this._assertLive('load');

    return this._loader._loadClaimed(this, input, options);
  }

  /**
   * Unpacks an asset container (`.exoa`) and claims every entry under THIS
   * scope, so the container's assets share this scope's lifetime rather than
   * getting one of their own.
   *
   * An unpack that fails partway leaves the claims it already registered on
   * this scope: the successful entries stay resident until released, or until
   * the scope is destroyed. {@link Loader.loadContainer} creates and owns its
   * scope instead, so it releases those partial claims itself.
   *
   * See {@link Loader.loadContainer} for the format and identity contract.
   */
  public loadContainer(source: string | ManifestPack, options?: LoadContainerOptions): Promise<void> {
    this._assertLive('loadContainer');

    return this._loader._loadContainerInto(this, source, options);
  }

  /**
   * Drops this scope's claim on one asset. The payload is freed only when no
   * other scope still holds it; a scope can never release another owner's claim.
   *
   * Accepts anything {@link load} accepts - a path, a handle, a descriptor, or a
   * group of those - plus a whole {@link Assets} catalog, and a resource built
   * from a descriptor without a string source. Releasing something this scope
   * never claimed is a no-op, and releasing twice is idempotent. A descriptor
   * without a string source matches only the claim its own object (or its type's
   * resource identity) made, so release such a resource by the resource itself
   * when the descriptor is not kept.
   *
   * Throws only for an object that has no claim identity at all - a resolved
   * resource loaded from a path, or an object this loader has never issued.
   * Release such a resource through its path or descriptor instead.
   */
  public release(input: AssetLoadInput | object): void;
  public release<M extends Record<string, CatalogEntry>>(assets: Assets<M>): void;
  public release(input: unknown): void {
    this._loader._releaseFrom(this, input);
  }

  /**
   * A claim registered after {@link destroy} could never be released: destroy is
   * idempotent by contract, so the second call is a no-op, and nothing else
   * owns the scope. Failing loudly at the acquisition is the only point where
   * the mistake is still attributable to the code that made it.
   */
  private _assertLive(verb: string): void {
    if (this._destroyed) {
      throw new Error(
        `LoaderScope: ${verb}() was called on a destroyed scope${this.name === undefined ? '' : ` "${this.name}"`}. ` +
          'Assets acquired through it could never be released. Acquire them through a live scope, or through the loader itself.',
      );
    }
  }

  /**
   * Releases every claim this scope still holds and destroys any child scope it
   * still has. Assets another scope also holds stay resident, and destroying an
   * already-destroyed scope is a no-op.
   *
   * Acquiring through the scope afterwards - {@link get}, {@link load},
   * {@link loadContainer}, {@link createScope} - throws, because what it would
   * register has no owner left to release it.
   */
  public destroy(): void {
    if (this._destroyed) {
      return;
    }

    this._destroyed = true;

    const failures: unknown[] = [];

    if (this._children !== undefined) {
      // Each child removes itself from this set while destroying, so iterate a copy.
      for (const child of [...this._children]) {
        try {
          child.destroy();
        } catch (error: unknown) {
          failures.push(error);
        }
      }

      this._children.clear();
    }

    this._parent?._children?.delete(this);

    try {
      this._loader._releaseScope(this);
    } catch (error: unknown) {
      failures.push(error);
    }

    if (failures.length === 1) {
      throw failures[0];
    }

    if (failures.length > 1) {
      throw new AggregateError(failures, '[ExoJS] LoaderScope.destroy(): several teardown steps threw.');
    }
  }
}
