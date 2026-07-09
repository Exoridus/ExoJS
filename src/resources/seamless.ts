import { Sound } from '#audio/Sound';
import type { LoadStateValue } from '#core/LoadState';
import { logger } from '#core/logging';
import type { SamplerOptions } from '#rendering/texture/Sampler';
import { Texture } from '#rendering/texture/Texture';

/** Pre-sizing options for deferred texture handles (spec §4.1 — the layout-jump fix). */
export interface PreSizeOptions {
  /** Width to reserve on the placeholder until the payload arrives. */
  width?: number;
  /** Height to reserve on the placeholder until the payload arrives. */
  height?: number;
}

/**
 * Options honoured by {@link textureSeamlessAdapter.createPlaceholder}: pre-size
 * reservation plus the handle's OWN sampler state. Sampler options are per-handle
 * — applied to the placeholder here and NOT overwritten by {@link fill} — so two
 * handles for one source can carry independent samplers off a single shared decode.
 * @internal
 */
export interface DeferredTextureOptions extends PreSizeOptions {
  /** Per-handle sampler/upload state for the placeholder; independent of the shared decode. */
  samplerOptions?: Partial<SamplerOptions>;
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
  /** Drop the payload back to a placeholder in place (refcount-0 eviction); identity is kept so a later fill heals every consumer. */
  evict(handle: T): void;
  /** Current load state of the handle. */
  stateOf(handle: T): LoadStateValue;
}

/**
 * Seamless adapter for {@link Texture}: placeholder is an empty (0×0) texture
 * carrying its OWN per-handle sampler state (applied at
 * {@link textureSeamlessAdapter.createPlaceholder} from `samplerOptions`); fill
 * transplants ONLY the decoded source, so two handles for one source share a
 * single decode yet keep independent samplers; fail shows the shared
 * {@link Texture.missing} checker — visible in production too.
 * @internal
 */
// Pre-size reservations per handle; consumed on the first fill or fail so a
// later heal is never misreported as a mismatch.
const presizes = new WeakMap<Texture, { width: number; height: number }>();

export const textureSeamlessAdapter: SeamlessAdapter<Texture> = {
  createPlaceholder(options?: unknown): Texture {
    const { width, height, samplerOptions } = (options ?? {}) as DeferredTextureOptions;
    // Bake the handle's own sampler state in now; fill() transplants only the
    // decoded source, so a shared decode never overwrites it.
    const handle = new Texture(null, samplerOptions);

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
    // Transplant ONLY the decoded source — the handle keeps the per-handle
    // sampler state applied at createPlaceholder (do NOT copy the donor's).
    handle.setSource(donor.source);

    if (expected !== undefined && (handle.width !== expected.width || handle.height !== expected.height)) {
      logger.warn(`Texture pre-size (${expected.width}×${expected.height}) does not match the loaded payload (${handle.width}×${handle.height}).`, {
        source: 'Loader',
      });
    }

    handle._loadState.settle(handle);
  },

  fail(handle: Texture, error: Error): void {
    presizes.delete(handle);
    handle.setSource(Texture.missing.source);
    handle._loadState.fail(error);
  },

  evict(handle: Texture): void {
    presizes.delete(handle);
    handle.setSource(null); // frees the GPU upload via the version bump in updateSource()
    handle._loadState.begin();
  },

  stateOf(handle: Texture): LoadStateValue {
    return handle.loadState;
  },
};

/**
 * Seamless adapter for {@link Sound}: placeholder is a bufferless Sound;
 * fill transplants the decoded {@link AudioBuffer} in place via `_setBuffer`;
 * fail leaves the handle bufferless (play() renders silence + warns);
 * evict drops the buffer back to placeholder for a later heal.
 * @internal
 */
export const soundSeamlessAdapter: SeamlessAdapter<Sound> = {
  createPlaceholder(): Sound {
    const handle = new Sound(null);
    handle._loadState.begin();
    return handle;
  },

  begin(handle: Sound): void {
    handle._loadState.begin();
  },

  fill(handle: Sound, donor: Sound): void {
    if (donor.audioBuffer === null) {
      throw new Error('soundSeamlessAdapter.fill: donor has no decoded buffer.');
    }
    handle._setBuffer(donor.audioBuffer);
    handle._loadState.settle(handle);
  },

  fail(handle: Sound, error: Error): void {
    handle._evictBuffer();
    handle._loadState.fail(error);
  },

  evict(handle: Sound): void {
    handle._evictBuffer();
    handle._loadState.begin();
  },

  stateOf(handle: Sound): LoadStateValue {
    return handle.loadState;
  },
};
