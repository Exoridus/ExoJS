import type { CacheLayout } from '#assets/cache/CacheLayout';
import { SingleEntryLayout } from '#assets/cache/SingleEntryLayout';
import type { NetworkSnapshot } from '#core/Connectivity';

import type { Asset } from './Asset';
import { AssetImpl } from './Asset';
import type { AssetConstructor } from './AssetConstructor';
import type { AnyAssetConfig } from './AssetDefinitions';
import type { AssetFactory } from './AssetFactory';
import type { AssetSourceCodec } from './AssetSourceCodec';
import type { SeamlessAdapter } from './seamless';

/**
 * What an asset type hands out for one of its assets inside a catalog, before
 * the payload has arrived.
 *
 * `'ref'` hands out a deferred {@link AssetRef} that resolves once the load
 * settles - the right shape for a decoded value nobody can render early.
 *
 * A {@link SeamlessAdapter} hands out the resource itself, empty, and
 * transplants the payload into that same object when it arrives, so consumers
 * wired to it need no re-wiring.
 *
 * `'none'` declares that the type has no meaningful placeholder at all. Its
 * assets cannot appear in a catalog by bare path and must be named explicitly
 * with {@link AssetType.asset}.
 * @advanced
 */
export type AssetLeaf<Resource> = 'ref' | 'none' | SeamlessAdapter<Resource>;

/**
 * One request for an asset of a given type, as an identity hook sees it.
 * @advanced
 */
export interface AssetRequest<Options = undefined> {
  /** The source string as the caller wrote it, before base-path resolution. */
  readonly source: string;
  readonly options?: Options;
}

/**
 * A first-class asset type: everything the loader needs to know about one kind
 * of asset, in one value.
 *
 * An instance is an immutable descriptor. Installing it on an
 * {@link Application} - by listing it in an {@link Extension}'s `assets` - is
 * what makes it loadable there, and only there: two applications in one process
 * may have entirely different type sets. Installation calls
 * {@link createFactory} once, so the mutable half of a type lives per
 * application and is destroyed with it.
 *
 * The type owns four separable decisions, and no more:
 *
 * - what it is called ({@link id}) and which file suffixes name it ({@link extensions});
 * - when two requests are the same runtime resource ({@link resourceIdentity});
 * - when two requests acquire the same source data ({@link sourceIdentity});
 * - how a representation is read ({@link codec}), laid out in a cache
 *   ({@link layout}) and turned into a resource ({@link createFactory});
 * - what a catalog hands out before the payload arrives ({@link leaf}).
 *
 * Acquisition, caching and residency are the loader's, and the type is
 * deliberately given no way to reach them.
 *
 * @typeParam Source - the normalized value a factory builds a resource from.
 * @typeParam Resource - the runtime resource callers receive.
 * @typeParam Options - the per-request option bag, `undefined` when the type takes none.
 * @typeParam Stored - the acquired representation, when it differs from `Source`.
 *
 * @example
 * ```ts
 * class WorldAssetType extends AssetType<WorldData, World, { locale?: string }, string> {
 *   public readonly id = 'com.example.world';
 *   public override readonly extensions = ['world'];
 *   public readonly codec = jsonSourceCodec as AssetSourceCodec<WorldData, string>;
 *
 *   public override sourceIdentity({ options }: AssetRequest<{ locale?: string }>): string {
 *     return options?.locale ?? '';
 *   }
 *
 *   public createFactory(): AssetFactory<WorldData, World, { locale?: string }> {
 *     return { create: data => Promise.resolve(new World(data)) };
 *   }
 * }
 *
 * const worldType = new WorldAssetType();
 * const app = new Application({ extensions: [{ id: 'com.example.world', assets: [worldType] }] });
 * const world = await app.loader.load(worldType.asset('level.world', { locale: 'de' }));
 * ```
 * @advanced
 */
export abstract class AssetType<Source, Resource, Options = undefined, Stored = Source> {
  /**
   * The type's stable identity - a non-empty string chosen by whoever defines
   * the type, and never changed afterwards.
   *
   * It names the type wherever a name is needed: in resource identities, in
   * diagnostics, and in the storage namespaces a persistent cache derives from
   * it. Because it survives a reload, it must not be derived from anything that
   * does not: a class name a minifier may rewrite, an installation order, or a
   * value generated at runtime. Reverse-DNS (`'com.example.world'`) keeps
   * independently authored types apart.
   *
   * Two types with the same id cannot be installed on one application.
   */
  public abstract readonly id: string;

  /**
   * File suffixes this type claims, without the leading dot.
   *
   * They are app-local: a suffix claimed here is resolved to this type by the
   * applications that installed it and is unknown to every other application in
   * the process. Leave it empty for a type whose assets are always named
   * explicitly.
   */
  public readonly extensions: readonly string[] = [];

  /**
   * What this type hands out for one of its assets in a catalog, before the
   * payload arrives.
   *
   * The default is a deferred {@link AssetRef}. A type whose resource can be
   * handed out empty and healed in place supplies a {@link SeamlessAdapter}
   * instead; a type with no meaningful placeholder declares `'none'`, which
   * also takes its suffixes out of bare-path catalog resolution.
   */
  public readonly leaf: AssetLeaf<Resource> = 'ref';

  /**
   * The constructor the loader dispatches this type on, for a type whose
   * resource has a public class callers already name.
   *
   * Constructor-addressed loader APIs (`scope.release(Texture, 'hero.png')`,
   * `loader.keyFor`, `onLoaded`) answer with this. A type that supplies none is
   * given a loader-local token, which those APIs then report instead.
   * @internal
   */
  public readonly _token?: AssetConstructor;

  /**
   * How an acquired representation is read back into the source a factory
   * consumes.
   *
   * Required for every type the loader acquires data for, which is nearly all
   * of them. A type whose {@link unacquiredSource} always answers has no
   * representation to read and needs none; a type that reaches acquisition
   * without one fails that load with a message saying so.
   */
  public readonly codec?: AssetSourceCodec<Source, Stored>;

  /**
   * How an acquired representation is laid out when an application caches it.
   *
   * The default keeps the representation in one record, which is what a codec
   * producing a single value needs. Override it to raise the version when the
   * stored representation changes shape - records written under the old version
   * are then no longer found, and the source is acquired again - or to supply a
   * layout that spreads one representation across several records.
   *
   * Whether anything is cached at all, and where, is the application's
   * decision. A type describes only how its representation would be laid out.
   */
  public readonly layout: CacheLayout<Stored> = SingleEntryLayout.version<Stored>(2);

  /**
   * Creates the factory for one application, at install time.
   *
   * Called once per {@link Loader}, never per request and never at module
   * import, so loader-local state a factory needs - a worker, a compiled
   * module, a lookup shared across every resource of this type - can be built
   * here and torn down with the loader.
   */
  public abstract createFactory(): AssetFactory<Source, Resource, Options>;

  /**
   * The source for a request the loader must NOT acquire data for.
   *
   * Returning a source skips acquisition completely: nothing is fetched,
   * decoded or cached for that request, {@link codec} is never consulted, and
   * the factory receives what this returns, built from the resolved `url`
   * alone. Returning `undefined` acquires normally.
   *
   * Two kinds of asset need this. One transports its own data - a media element
   * streaming from a URL, where downloading the whole file up front is exactly
   * what streaming avoids. The other has no source data of its own at all,
   * because it is derived from assets its factory loads as dependencies.
   *
   * A type that transports its own data over the NETWORK must consult
   * `network`: declining to acquire also declines the cache, so a type that
   * streamed regardless would keep reaching for the network after the
   * application forbade it. Returning `undefined` when
   * `network.allowsNetwork` is false is what puts such a request back on the
   * cache path, where it either hits or misses honestly. A type whose source is
   * derived rather than transported ignores it.
   *
   * This governs an ordinary load only. `Loader.cacheSource` asks for the
   * acquisition by name and does not consult this hook, so a type that
   * transports its own data is still explicitly cacheable through its codec.
   *
   * The result is wrapped so that a type whose source is legitimately
   * `undefined` can still say "do not acquire".
   */
  public unacquiredSource?(request: AssetRequest<Options>, url: string, network: NetworkSnapshot): { readonly source: Source } | undefined;

  /**
   * The part of a request's identity the source alone does not capture: what
   * makes two requests for one source two DIFFERENT runtime resources.
   *
   * Include every option baked irreversibly into the produced resource - a
   * colour space, a font descriptor, a decoding mode, a runtime interpretation.
   * Exclude load policy (priority, timeout, cancellation) and per-consumer
   * presentation (sampler state, placeholder size): neither changes the
   * resource, and folding them in would build and hold the same resource twice.
   *
   * Never serialize the whole option bag: property order is unstable, control
   * fields would leak in, and the result is unbounded. Select the fields that
   * matter, explicitly.
   *
   * Omit the hook entirely when the source alone identifies the resource.
   */
  public resourceIdentity?(request: AssetRequest<Options>): string;

  /**
   * The part of a request that changes WHICH SOURCE DATA is acquired - a
   * locale, a content variant, an explicit variant token, a known content
   * identity.
   *
   * This is not {@link resourceIdentity}. An option that changes only how
   * already-acquired data is interpreted belongs there and must not appear
   * here, or one download would be fetched once per interpretation.
   *
   * The value can outlive the session inside a persistent cache namespace, so
   * it must carry no credentials, no tokens and no request headers.
   *
   * Omit the hook entirely when the locator alone identifies the source.
   */
  public sourceIdentity?(request: AssetRequest<Options>): string;

  /**
   * A typed, loadable descriptor for one asset of this type.
   *
   * The resource and option types come from the type instance, so a custom type
   * is fully typed at every call site without declaring anything to the module
   * system:
   *
   * ```ts
   * const world = await loader.load(worldType.asset('level.world'));
   * ```
   */
  public asset(source: string, options?: Options): Asset<Resource> {
    // A dynamic type's id is deliberately not a key of `AssetDefinitions` -
    // lifting that constraint is what this API exists for - but both names are
    // resolved through the same app-local lookup, so the widening is a naming
    // question rather than a dispatch one.
    return new AssetImpl({ type: this.id, source, ...options } as unknown as AnyAssetConfig, this as AnyAssetType);
  }
}

/**
 * Any {@link AssetType}, whatever its source, resource, option and stored types
 * - the element type of an {@link Extension}'s `assets` list.
 *
 * The source and stored types appear on both sides of the codec contract, so no
 * narrower parameterisation accepts every concrete type.
 * @advanced
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the type parameters are invariant, so this existential cannot be written with unknown/never.
export type AnyAssetType = AssetType<any, any, any, any>;
