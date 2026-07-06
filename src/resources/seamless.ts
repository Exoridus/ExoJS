import type { LoadStateValue } from '#core/LoadState';
import { logger } from '#core/logging';
import { Texture } from '#rendering/texture/Texture';

/** Pre-sizing options for deferred texture handles (spec §4.1 — the layout-jump fix). */
export interface PreSizeOptions {
  /** Width to reserve on the placeholder until the payload arrives. */
  width?: number;
  /** Height to reserve on the placeholder until the payload arrives. */
  height?: number;
}

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
  createPlaceholder(options?: unknown): T;
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
// Pre-size reservations per handle; consumed on the first fill or fail so a
// later heal is never misreported as a mismatch.
const presizes = new WeakMap<Texture, { width: number; height: number }>();

export const textureSeamlessAdapter: SeamlessAdapter<Texture> = {
  createPlaceholder(options?: unknown): Texture {
    const handle = new Texture(null);
    const { width, height } = (options ?? {}) as PreSizeOptions;

    if (typeof width === 'number' && typeof height === 'number') {
      handle.setSize(width, height);
      presizes.set(handle, { width, height });
    }

    handle._loadState.begin();

    return handle;
  },

  begin(handle: Texture): void {
    handle._loadState.begin();
  },

  fill(handle: Texture, donor: Texture): void {
    const expected = presizes.get(handle);

    presizes.delete(handle);
    handle.setScaleMode(donor.scaleMode).setWrapMode(donor.wrapMode).setPremultiplyAlpha(donor.premultiplyAlpha);
    handle.generateMipMap = donor.generateMipMap;
    handle.flipY = donor.flipY;
    handle.setSource(donor.source);

    if (expected !== undefined && (handle.width !== expected.width || handle.height !== expected.height)) {
      logger.warn(`Texture pre-size (${expected.width}×${expected.height}) does not match the loaded payload (${handle.width}×${handle.height}).`, { source: 'Loader' });
    }

    handle._loadState.settle(handle);
  },

  fail(handle: Texture, error: Error): void {
    presizes.delete(handle);
    handle.setSource(Texture.missing.source);
    handle._loadState.fail(error);
  },

  stateOf(handle: Texture): LoadStateValue {
    return handle.loadState;
  },
};
