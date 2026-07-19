import type { WebGpuBackend } from './WebGpuBackend';

/**
 * Pack the backend's active device-pixel snap viewport rect (`x, y, width,
 * height`) into `out` at float `offset`. The core WGSL vertex stages read these
 * four floats (as their projection UBO's `viewport: vec4<f32>`) to project a
 * drawable's clip-space origin into device pixels for render-only position
 * snapping (spec D3-D5). Shared by every ProjectionUniforms-style renderer so
 * the staged rect matches {@link WebGpuBackend._snapViewport} in exactly one
 * place.
 *
 * Returns whether the staged floats CHANGED — the projection-UBO writes are
 * skip-gated on (view, updateId, group) state, which does not cover a snap-rect
 * change (e.g. an attachment resize with an unchanged view), so callers fold
 * this flag into their dirty condition. Staging is idempotent: when the rect is
 * unchanged the write is an identity and skipping the upload stays sound.
 * @internal
 */
export const packSnapViewport = (backend: WebGpuBackend, out: Float32Array, offset: number): boolean => {
  const vp = backend._snapViewport;
  const changed = out[offset + 0] !== vp.x || out[offset + 1] !== vp.y || out[offset + 2] !== vp.width || out[offset + 3] !== vp.height;

  out[offset + 0] = vp.x;
  out[offset + 1] = vp.y;
  out[offset + 2] = vp.width;
  out[offset + 3] = vp.height;

  return changed;
};
