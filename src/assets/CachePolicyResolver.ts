import type { NetworkSnapshot } from '#core/Connectivity';

import type { CachePolicy } from './CachePolicy';
import type { SourceKey } from './canonicalKey';

/** What a {@link CachePolicyResolver} is told about the acquisition it is choosing a policy for. */
export interface CachePolicyResolutionContext {
  /** The storage namespace of the acquisition, which is the asset type's `id`. */
  readonly namespace: string;
  /** The source identity being acquired. */
  readonly sourceKey: SourceKey;
  /**
   * The connectivity facts this acquisition starts under, as the loader knew
   * them at that moment.
   *
   * A snapshot rather than the service itself. A resolver therefore cannot
   * subscribe to connectivity, cannot outlive the decision, and cannot be
   * bound to one application - which is what lets one `AssetCache` be shared
   * between applications that disagree about whether they may use the network.
   */
  readonly network: NetworkSnapshot;
}

/**
 * Chooses the {@link CachePolicy} for one acquisition, at the moment it starts.
 *
 * A route is configured with a policy or with a resolver. A resolver is for a
 * decision that depends on something outside the route - connectivity, an
 * application mode, a per-type rule - and is asked once per acquisition, never
 * per record.
 *
 * Resolution happens at the START of an acquisition and never again: a request
 * that was allowed to reach the network keeps that contract to completion. Only
 * the NEXT acquisition sees a changed answer, which is what keeps a load from
 * being re-routed mid-transfer by an event it never observed.
 *
 * @example
 * ```ts
 * const resolver: CachePolicyResolver = {
 *   policyFor: context => (context.network.allowsNetwork ? cacheFirst : cacheOnly),
 * };
 *
 * new CacheRoute({ types: ['texture'], policy: resolver, stores: persistent });
 * ```
 * @advanced
 */
export interface CachePolicyResolver {
  /**
   * The policy this acquisition runs under.
   *
   * Named apart from {@link CachePolicy.resolve} on purpose: the two are
   * accepted in the same position, and one method name meaning "run the
   * acquisition" on one and "pick who runs it" on the other would make the
   * union undiscriminable and the mistake silent.
   */
  policyFor(context: CachePolicyResolutionContext): CachePolicy;
}

/** Either shape a route accepts for its policy. @advanced */
export type CachePolicySource = CachePolicy | CachePolicyResolver;

/** Whether `source` chooses per acquisition rather than being one fixed policy. @internal */
export function isPolicyResolver(source: CachePolicySource): source is CachePolicyResolver {
  return typeof (source as CachePolicyResolver).policyFor === 'function';
}
