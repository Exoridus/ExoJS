import type { AssetLocator, ResourceKey, SourceKey } from './canonicalKey';
import type { LoaderScope } from './LoaderScope';

/**
 * The seam through which a factory acquires the assets its resource depends on.
 *
 * Everything loaded through it is owned by the resource being built and is
 * released with it, unless another owner holds it independently - so a font's
 * page textures survive exactly as long as the font, however many consumers the
 * deduplicated font itself has.
 *
 * It is deliberately narrower than the scope backing it: a factory may acquire
 * dependencies, but not release them, tear the scope down, or unpack a
 * container into it. Those decisions belong to whoever owns the resource.
 * @advanced
 */
export type AssetDependencyScope = Pick<LoaderScope, 'get' | 'load' | 'createScope'>;

/**
 * What a factory is told about the one resource it is building.
 *
 * There is deliberately no network, cache store or cache policy here. A factory
 * receives source data that has already been acquired and decoded, and its only
 * outward reach is {@link dependencies} - which acquires other ASSETS, never raw
 * bytes. Where those bytes came from, and whether they were served from a cache,
 * is not a factory's decision to make or to observe.
 * @advanced
 */
export interface AssetFactoryContext<Options = undefined> {
  /** The options this request carried, as declared by the asset type. */
  readonly options?: Options;
  /**
   * Cancellation signal of this load. It aborts once no claim scope needs the
   * result any more; `undefined` means the caller started the load without a
   * cancellation channel.
   */
  readonly signal?: AbortSignal | undefined;
  /**
   * The source as the request named it, before base-path resolution.
   *
   * A reference the asset itself carries - a font's page image, an atlas's
   * sheet - is relative to this, not to the resolved URL: resolving it here and
   * loading the result would apply the loader's base path to it a second time.
   */
  readonly source: string;
  /** The canonical locator the source data was acquired from. */
  readonly locator: AssetLocator;
  /** The identity of the resource being built. */
  readonly resourceKey: ResourceKey;
  /** The identity of the source data it is built from. */
  readonly sourceKey: SourceKey;
  /** Acquires assets this resource depends on, for as long as this resource lives. */
  readonly dependencies: AssetDependencyScope;
}

/**
 * Builds one kind of runtime resource from normalized source data.
 *
 * A factory owns construction and teardown, and nothing else: it does not fetch,
 * does not decide what a stored representation looks like, and never sees a
 * cache. Acquisition is the loader's, representation is the
 * {@link AssetSourceCodec}'s, and caching is a policy neither of them knows
 * about.
 *
 * One instance exists per {@link Loader}, created by
 * {@link AssetType.createFactory}, so loader-local state - a worker, a compiled
 * module, a parsed lookup shared by every resource of this type - belongs on the
 * instance and is torn down with the loader that owns it.
 * @advanced
 */
export interface AssetFactory<Source, Resource, Options = undefined> {
  /** Builds the runtime resource. Failures here are construction failures, not source failures. */
  create(source: Source, context: AssetFactoryContext<Options>): Promise<Resource>;
  /**
   * Releases ONE resource this factory produced, when the loader evicts it at
   * refcount 0. The factory stays alive and keeps serving every other resource
   * it created.
   *
   * Implement it only when a resource owns something the garbage collector
   * cannot reclaim on its own - a media element, a `FontFace` registered on
   * `document.fonts`, a GPU buffer, a worker. A decoded `AudioBuffer`, a parsed
   * object or a compiled `WebAssembly.Module` needs nothing.
   *
   * Must be synchronous, and must tolerate a resource that was already released.
   */
  dispose?(resource: Resource): void;
  /**
   * Releases what the factory itself owns, once, when its loader is destroyed.
   * Use {@link dispose} for a single evicted resource.
   */
  destroy?(): void;
}
