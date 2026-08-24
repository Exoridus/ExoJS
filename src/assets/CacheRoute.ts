import { CacheFirstPolicy } from './cachePolicies';
import type { CachePolicy } from './CachePolicy';
import { type CachePolicyResolutionContext, type CachePolicySource, isPolicyResolver } from './CachePolicyResolver';
import type { CacheStore } from './CacheStore';

/** Normalize the single-or-many store shorthand every route option accepts. */
function toStoreList(stores: CacheStore | readonly CacheStore[] | undefined): readonly CacheStore[] {
  if (stores === undefined) {
    return [];
  }

  return Array.isArray(stores) ? (stores as readonly CacheStore[]) : [stores as CacheStore];
}

/** Construction options for a {@link CacheRoute}. */
export interface CacheRouteOptions {
  /**
   * Asset type ids this route applies to. Omit it for a route that applies to
   * every type that no earlier route claimed.
   */
  readonly types?: readonly string[];
  /**
   * How the cache and the network are ordered. Defaults to
   * {@link CacheFirstPolicy}.
   *
   * A {@link CachePolicyResolver} chooses per acquisition instead of once, for
   * a decision that depends on something outside the route.
   */
  readonly policy?: CachePolicySource;
  /** Stores this route both reads and writes. Shorthand for passing the same list as `read` and `write`. */
  readonly stores?: CacheStore | readonly CacheStore[];
  /** Stores consulted on a read, in order. The first hit wins; later stores are not consulted. */
  readonly read?: CacheStore | readonly CacheStore[];
  /** Stores a write goes to. All of them are attempted. */
  readonly write?: CacheStore | readonly CacheStore[];
  /**
   * Whether a hit in a later read store is copied into the earlier read stores
   * that are also write stores. Off by default: it is a cheap win for a memory
   * tier in front of a persistent one, and pointless everywhere else.
   */
  readonly promote?: boolean;
}

/**
 * One caching rule: which asset types it covers, which stores it uses, and in
 * what order the cache and the network are consulted.
 *
 * Read order is the order the stores were given and is never raced. A race
 * would make which store answered - and therefore which failures surfaced,
 * what was promoted, and what a test observes - depend on timing.
 *
 * Read and write stores are separate lists so a route can read from a tier it
 * never writes (a cache shipped with the application) or write to one it does
 * not read back (an archival mirror).
 *
 * @example
 * ```ts
 * new CacheRoute({
 *   types: ['com.example.world'],
 *   policy: new NetworkFirstPolicy(),
 *   stores: new IndexedDbStore('worlds'),
 * });
 * ```
 */
export class CacheRoute {
  /** The asset type ids this route claims, or `null` when it claims every type. */
  public readonly types: readonly string[] | null;
  /** The policy, or the resolver that picks one per acquisition. */
  public readonly policy: CachePolicySource;
  /** Stores consulted on a read, in order. */
  public readonly readStores: readonly CacheStore[];
  /** Stores a write goes to. */
  public readonly writeStores: readonly CacheStore[];
  public readonly promote: boolean;

  public constructor(options: CacheRouteOptions = {}) {
    const shared = toStoreList(options.stores);

    this.types = options.types === undefined ? null : [...options.types];
    this.policy = options.policy ?? new CacheFirstPolicy();
    this.readStores = options.read === undefined ? shared : toStoreList(options.read);
    this.writeStores = options.write === undefined ? shared : toStoreList(options.write);
    this.promote = options.promote ?? false;
  }

  /** Whether this route claims `namespace`. */
  public matches(namespace: string): boolean {
    return this.types === null || this.types.includes(namespace);
  }

  /**
   * The policy one acquisition runs under.
   *
   * Asked once, when the acquisition starts. A request already in flight keeps
   * what it began with - see {@link CachePolicyResolver}.
   * @internal
   */
  public policyFor(context: CachePolicyResolutionContext): CachePolicy {
    return isPolicyResolver(this.policy) ? this.policy.policyFor(context) : this.policy;
  }
}
