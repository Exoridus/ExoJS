import type { CacheReadResult } from './CacheReadResult';
import type { SourceKey } from './canonicalKey';

/**
 * The operations a {@link CachePolicy} may perform on one acquisition.
 *
 * Deliberately narrow. A policy decides ORDERING - read before fetch, fetch
 * before read, never one of them - and nothing else. It is given no asset
 * type, no factory, no codec and no store handle, so it cannot reach into how
 * a representation is produced, laid out or persisted.
 *
 * ## Failure contract
 *
 * - {@link read} resolves to a miss when no configured store held the record,
 *   and rejects when a store could not answer and no later store supplied the
 *   value. Every individual store failure is also reported to the loader's
 *   cache diagnostics before it is raised here, so a policy that chooses to
 *   degrade does not make the failure invisible.
 * - {@link write} rejects when any configured store refused the write, after
 *   attempting all of them.
 * - {@link fetch} rejects with an `AssetNetworkError` for a transport or HTTP
 *   failure, with the platform `AbortError` for a cancelled load, and with
 *   whatever the codec threw for a representation it could not read. A policy
 *   that falls back on network failure must narrow on the first of those - an
 *   unreadable response and a cancelled load are not reasons to serve stale
 *   data.
 * @advanced
 */
export interface CacheContext<T = unknown> {
  /** The storage namespace of the acquisition, which is the asset type's `id`. */
  readonly namespace: string;
  /** The source identity being acquired. */
  readonly sourceKey: SourceKey;
  /** Cancellation signal of the load, when the caller started one with a cancellation channel. */
  readonly signal?: AbortSignal | undefined;

  /** Read the representation from the route's read stores, in their configured order. */
  read(): Promise<CacheReadResult<T>>;
  /** Acquire the representation from the network. */
  fetch(): Promise<T>;
  /** Write the representation to the route's write stores. */
  write(value: T): Promise<void>;
}

/**
 * Decides in which order a cache and the network are consulted for one
 * acquisition.
 *
 * This is the extension point for custom caching behaviour. Implementations
 * are stateless policy objects, free to be shared between routes and loaders:
 * everything one call needs arrives in its {@link CacheContext}, and
 * diagnostics travel with that context rather than with the policy.
 *
 * ExoJS ships {@link CacheFirstPolicy} (the default), {@link NetworkFirstPolicy},
 * {@link NetworkOnlyPolicy} and {@link CacheOnlyPolicy}.
 *
 * @example
 * ```ts
 * class MyCacheFirstPolicy implements CachePolicy {
 *   public async resolve<T>(context: CacheContext<T>): Promise<T> {
 *     const cached = await context.read();
 *
 *     if (cached.hit) {
 *       return cached.value;
 *     }
 *
 *     const value = await context.fetch();
 *     await context.write(value);
 *
 *     return value;
 *   }
 * }
 * ```
 * @advanced
 */
export interface CachePolicy {
  /** Resolve one acquisition to its stored representation. */
  resolve<T>(context: CacheContext<T>): Promise<T>;
}
