import { CacheFirstPolicy, CacheOnlyPolicy } from './cachePolicies';
import type { CachePolicy } from './CachePolicy';
import type { CachePolicyResolutionContext, CachePolicyResolver } from './CachePolicyResolver';

/** Construction options for a {@link ConnectivityPolicyResolver}. */
export interface ConnectivityPolicyResolverOptions {
  /**
   * The policy used while the network is allowed. Defaults to
   * {@link CacheFirstPolicy}, which is also the loader's default.
   */
  readonly online?: CachePolicy;
  /**
   * The policy used while it is not. Defaults to {@link CacheOnlyPolicy}, whose
   * whole point here is that a missing record fails immediately with an
   * {@link AssetCacheMissError} instead of waiting out a fetch that cannot
   * succeed.
   */
  readonly offline?: CachePolicy;
}

/**
 * Routes acquisitions through the cache alone whenever the application is not
 * allowed to reach the network, and through the configured online policy
 * whenever it is.
 *
 * It holds no connectivity of its own. The decision is made from the
 * {@link CachePolicyResolutionContext.network} snapshot the loader hands it per
 * acquisition, which is what lets one resolver - and one `AssetCache` - be
 * shared between applications that disagree about whether they may use the
 * network.
 *
 * `allowsNetwork` already folds both halves of the question together - the
 * environment's hint and the application's own mode - so this never has to know
 * which one said no. `'unknown'` counts as allowed: the host is not claiming the
 * network is gone, and refusing on no evidence would break every environment
 * that reports nothing.
 *
 * @example
 * ```ts
 * const app = new Application({
 *   loader: {
 *     cache: new AssetCache({
 *       stores: new IndexedDbStore('my-game'),
 *       policy: new ConnectivityPolicyResolver(),
 *     }),
 *   },
 * });
 *
 * app.connectivity.mode = 'offline';
 * ```
 */
export class ConnectivityPolicyResolver implements CachePolicyResolver {
  private readonly _online: CachePolicy;
  private readonly _offline: CachePolicy;

  public constructor(options: ConnectivityPolicyResolverOptions = {}) {
    this._online = options.online ?? new CacheFirstPolicy();
    this._offline = options.offline ?? new CacheOnlyPolicy();
  }

  public policyFor(context: CachePolicyResolutionContext): CachePolicy {
    return context.network.allowsNetwork ? this._online : this._offline;
  }
}
