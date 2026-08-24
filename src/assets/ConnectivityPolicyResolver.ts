import type { Connectivity } from '#core/Connectivity';

import { CacheFirstPolicy, CacheOnlyPolicy } from './cachePolicies';
import type { CachePolicy } from './CachePolicy';
import type { CachePolicyResolver } from './CachePolicyResolver';

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
 * The decision reads {@link Connectivity.allowsNetwork}, so it honours both
 * halves of that question - the environment's hint and the application's own
 * mode - without having to know which one said no. `'unknown'` counts as
 * allowed: the host is not claiming the network is gone, and refusing on no
 * evidence would break every environment that reports nothing.
 *
 * @example
 * ```ts
 * const cache = new AssetCache({
 *   stores: new IndexedDbStore('my-game'),
 *   policy: new ConnectivityPolicyResolver(app.connectivity),
 * });
 * ```
 */
export class ConnectivityPolicyResolver implements CachePolicyResolver {
  private readonly _connectivity: Connectivity;
  private readonly _online: CachePolicy;
  private readonly _offline: CachePolicy;

  public constructor(connectivity: Connectivity, options: ConnectivityPolicyResolverOptions = {}) {
    this._connectivity = connectivity;
    this._online = options.online ?? new CacheFirstPolicy();
    this._offline = options.offline ?? new CacheOnlyPolicy();
  }

  public policyFor(): CachePolicy {
    return this._connectivity.allowsNetwork ? this._online : this._offline;
  }
}
