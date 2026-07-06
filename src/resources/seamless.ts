import type { LoadStateValue } from '#core/LoadState';
import { Texture } from '#rendering/texture/Texture';

/**
 * Per-type strategy for seamless deferred asset handles (asset-system v2).
 *
 * A seamless type hands out a stable placeholder handle synchronously from
 * `loader.get(Type, source)`; when the payload arrives, {@link fill}
 * transplants it into the handle **in place** so every existing consumer
 * "pops up" without re-wiring. {@link fail} swaps in a visible error payload
 * instead. The handle's identity never changes across the whole lifecycle.
 * @advanced
 */
export interface SeamlessAdapter<T> {
  /** Create a fresh deferred handle, already in the `'loading'` state. */
  createPlaceholder(): T;
  /** Re-arm a `'failed'` handle for a retry (`'failed'` → `'loading'`, fresh `.loaded`). */
  begin(handle: T): void;
  /** Transplant the donor's payload into the handle in place and settle `'ready'`. */
  fill(handle: T, donor: T): void;
  /** Show the error payload on the handle and settle `'failed'`. */
  fail(handle: T, error: Error): void;
  /** Current load state of the handle. */
  stateOf(handle: T): LoadStateValue;
}

/**
 * Seamless adapter for {@link Texture}: placeholder is an empty (0×0) texture;
 * fill transplants the decoded source plus sampler state (the donor carries
 * any factory options from the original call); fail shows the shared
 * {@link Texture.missing} checker — visible in production too.
 * @internal
 */
export const textureSeamlessAdapter: SeamlessAdapter<Texture> = {
  createPlaceholder(): Texture {
    const handle = new Texture(null);

    handle._loadState.begin();

    return handle;
  },

  begin(handle: Texture): void {
    handle._loadState.begin();
  },

  fill(handle: Texture, donor: Texture): void {
    handle.setScaleMode(donor.scaleMode).setWrapMode(donor.wrapMode).setPremultiplyAlpha(donor.premultiplyAlpha);
    handle.generateMipMap = donor.generateMipMap;
    handle.flipY = donor.flipY;
    handle.setSource(donor.source);
    handle._loadState.settle(handle);
  },

  fail(handle: Texture, error: Error): void {
    handle.setSource(Texture.missing.source);
    handle._loadState.fail(error);
  },

  stateOf(handle: Texture): LoadStateValue {
    return handle.loadState;
  },
};
