import type { LoadState, LoadStateValue } from '#core/LoadState';

/**
 * Uniform, read-only load-status projection shared by every asset handle and
 * ref (asset-system v2 §6). A public view of the handle's internal
 * {@link LoadState} — no new status object is created.
 */
export interface AssetStatus {
  /** Current load lifecycle: `'loading' | 'ready' | 'failed'`. */
  readonly state: LoadStateValue;
  /** `true` exactly when {@link state} is `'ready'`. */
  readonly ready: boolean;
  /** The error the last load failed with, or `null` outside `'failed'`. */
  readonly error: Error | null;
}

/**
 * Compute the {@link AssetStatus} fields from a {@link LoadState}. Generic
 * over the state's owner type — `LoadState<Owner>` is invariant in `Owner`
 * (it appears contravariantly in the internal settle/fail resolvers), so a
 * fixed `LoadState<unknown>` parameter would reject every concrete
 * `LoadState<T>` call site.
 * @internal
 */
export function _statusFields<Owner>(ls: LoadState<Owner>): AssetStatus {
  const state = ls.value;
  return { state, ready: state === 'ready', error: ls.error };
}
