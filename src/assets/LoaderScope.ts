import { Signal } from '#core/Signal';
import type { Destroyable } from '#core/types';

import type { Asset, ValueAsset } from './Asset';
import type { AssetConstructor } from './AssetConstructor';
import type { CatalogEntry, KindByPath, LeafForPath, ResourceForKind } from './AssetDefinitions';
import type { CatalogResourceLeaf, CatalogValueLeaf } from './assetMeta';
import type { Assets, InferAssetsProperties } from './Assets';
import { LoadBatch } from './LoadBatch';
import type { InferLoadedMap, Loader, LoadOptions } from './Loader';
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
 * Create a scope with {@link Loader.createScope} whenever an asset's lifetime is
 * shorter than the application's - a level, a streamed chunk, a UI panel, a
 * prefetch. Assets acquired directly on the {@link Loader} are held for the
 * application's lifetime instead and are freed only when the loader is
 * destroyed.
 *
 * A scope describes a lifetime, never a set of assets: what to acquire comes
 * from an {@link Assets} catalog or an {@link Asset} descriptor passed to
 * {@link get} / {@link load}, and typed access stays on that catalog.
 *
 * Scopes nest: {@link createScope} makes a child whose claims are independent
 * but whose lifetime cannot outlive its parent's.
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
  /** Fired once every asset in this scope's batch has settled. */
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
   * The child claims, shares and releases assets exactly like any other scope -
   * one fetch, one resident payload, one claim per owner - and holding the same
   * asset as its parent means two claims, not one. Destroying the child frees
   * only the child's claims; destroying the parent destroys every child it still
   * has first, recursively, so a scene or level teardown reaches the scopes
   * created underneath it without extra bookkeeping.
   *
   * The hierarchy is a lifetime hierarchy only. It never affects asset identity,
   * ownership or what a release frees.
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
    const child = new LoaderScope(this._loader, 'scope', options?.name, this);

    this._children ??= new Set<LoaderScope>();
    this._children.add(child);

    return child;
  }

  // Bare path: a resource suffix yields its heal-in-place handle, a value suffix a stable AssetRef.
  public get<S extends string>(path: [KindByPath<S>] extends [never] ? never : S, options?: unknown): LeafForPath<S>;
  // A value-kind descriptor (or a materialized value leaf) resolves to a value leaf.
  public get<T>(asset: ValueAsset<T> | CatalogValueLeaf<T>): CatalogValueLeaf<T>;
  public get<T>(asset: Asset<T>): CatalogResourceLeaf<T>;
  public get<M extends Record<string, CatalogEntry>>(catalog: Assets<M>): InferAssetsProperties<M>;
  // Brand-matched: only a materialized catalog leaf, never a raw resource.
  public get<T extends object>(leaf: CatalogResourceLeaf<T>): CatalogResourceLeaf<T>;
  public get(input: string | object, options?: unknown): unknown {
    return this._loader._getClaimed(this, input, options);
  }

  public load<T>(asset: Asset<T>): LoadingQueue<T>;
  public load<M extends Record<string, CatalogEntry>>(assets: Assets<M>, options?: LoadOptions): LoadingQueue<InferLoadedMap<M>>;
  public load<T>(leaf: CatalogValueLeaf<T>, options?: LoadOptions): LoadingQueue<T>;
  public load<T extends object>(leaf: CatalogResourceLeaf<T>, options?: LoadOptions): LoadingQueue<T>;
  public load<S extends string>(path: [KindByPath<S>] extends [never] ? never : S): LoadingQueue<ResourceForKind<KindByPath<S>>>;
  public load(arg0: unknown, arg1?: unknown): LoadingQueue<unknown> {
    return this._loader._loadClaimed(this, arg0, arg1);
  }

  /**
   * Unpacks an asset container (`.exoa`) and claims every entry under THIS
   * scope, so the container's assets share this scope's lifetime rather than
   * getting one of their own.
   *
   * See {@link Loader.loadContainer} for the format and identity contract.
   */
  public loadContainer(url: string): Promise<void> {
    return this._loader._loadContainerInto(this, url);
  }

  /**
   * Drops this scope's claim on one asset. The payload is freed only when no
   * other scope still holds it; a scope can never release another owner's claim.
   *
   * Accepts the handle or value-ref returned by {@link get}, an {@link Asset}
   * descriptor, a whole {@link Assets} catalog, a catalog leaf, or a
   * `(type, source)` pair. Releasing something this scope never claimed is a
   * no-op, and releasing twice is idempotent.
   *
   * Throws only for an object that has no claim identity at all - a resolved
   * non-leaf resource, or an object this loader has never issued. Release such a
   * resource through its descriptor or its `(type, source)` pair instead.
   */
  public release(handle: object): void;
  public release<T>(asset: Asset<T>): void;
  public release<M extends Record<string, CatalogEntry>>(assets: Assets<M>): void;
  public release(type: AssetConstructor, source: string): void;
  public release(handleOrType: object | AssetConstructor, source?: string): void {
    this._loader._releaseFrom(this, handleOrType, source);
  }

  /**
   * Releases every claim this scope still holds and destroys any child scope it
   * still has. Assets another scope also holds stay resident, and destroying an
   * already-destroyed scope is a no-op.
   */
  public destroy(): void {
    if (this._destroyed) {
      return;
    }

    this._destroyed = true;

    if (this._children !== undefined) {
      // Each child removes itself from this set while destroying, so iterate a copy.
      for (const child of [...this._children]) {
        child.destroy();
      }

      this._children.clear();
    }

    this._parent?._children?.delete(this);
    this._loader._releaseScope(this);
  }
}
