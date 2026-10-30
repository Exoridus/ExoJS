import { isSoftwareRenderer } from '../shared/provenance';
import type { Backend } from './EngineAdapter';

/** Renderer identity a CPU profile can establish, and whether it is trustworthy. */
export interface ProfileAdapterProvenance {
  /** Adapter or renderer string stamped into provenance. */
  readonly adapter: string;
  /** Whether the adapter is a software rasterizer (its timings are untrusted). */
  readonly software: boolean;
  /** Set when no adapter identity could be read, so the profile is not verified hardware. */
  readonly adapterUnverified?: boolean;
}

/**
 * Renderer identity and trust bits for one profile cell.
 *
 * A WebGPU profile reads the same adapter identity `runBackend` does. When that
 * identity is unavailable the profile is NOT confirmed hardware: it keeps a
 * descriptive adapter string and is marked unverified rather than being stamped
 * `software: false`, which would read as a verified hardware measurement.
 */
export const profileProvenance = (
  backend: Backend,
  identity: { readonly adapter: string; readonly usable: boolean } | null,
  renderer: string | null,
): ProfileAdapterProvenance => {
  if (backend === 'webgpu') {
    return identity !== null && identity.usable
      ? { adapter: identity.adapter, software: isSoftwareRenderer(identity.adapter) }
      : { adapter: 'profiled webgpu session (adapter identity unavailable)', software: false, adapterUnverified: true };
  }

  return renderer === null
    ? { adapter: 'unknown renderer', software: false, adapterUnverified: true }
    : { adapter: renderer, software: isSoftwareRenderer(renderer) };
};
