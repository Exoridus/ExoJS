import type { LoadStateValue } from '#core/LoadState';

/**
 * Uniform, read-only load-status contract surfaced by every asset handle and
 * ref (asset-system v2 §6). A public projection of the handle's internal
 * `LoadState`: `Texture`, `Sound`, and {@link AssetRef} each expose `state`,
 * `ready`, and `error` directly (plus their own `loaded` promise), so they
 * structurally satisfy this interface. No separate status object is created.
 */
export interface AssetStatus {
  /** Current load lifecycle: `'idle' | 'loading' | 'ready' | 'failed'`. */
  readonly state: LoadStateValue;
  /** `true` exactly when {@link state} is `'ready'`. */
  readonly ready: boolean;
  /** The error the last load failed with, or `null` outside `'failed'`. */
  readonly error: Error | null;
}
