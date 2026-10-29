import type { Extension, RendererBinding } from '@codexo/exojs/extensions';
import type { RenderBackend } from '@codexo/exojs/renderer-sdk';
import { RenderBackendType } from '@codexo/exojs/renderer-sdk';

import { WebGl2ParticleRenderer } from '#renderers/WebGl2ParticleRenderer';
import { WebGpuParticleRenderer } from '#renderers/WebGpuParticleRenderer';

import { ParticleSystem } from './ParticleSystem';

/** Options for {@link createParticlesExtension}. */
export interface ParticlesExtensionOptions {
  /**
   * Particles the WebGL2 renderer's instance buffer is pre-sized for.
   * Defaults to 8192. Must be a positive integer: a negative, fractional or
   * non-finite value throws when the extension is created.
   *
   * This is a starting allocation, not a limit: a system with more live
   * particles grows the buffer instead of dropping the surplus, so raise it
   * only to avoid the initial growth steps for a known-large system.
   */
  readonly batchSize?: number;
}

const buildParticlesRendererBinding = (batchSize: number): RendererBinding => ({
  targets: [ParticleSystem],
  create(backend: RenderBackend) {
    if (backend.backendType === RenderBackendType.WebGl2) {
      return new WebGl2ParticleRenderer(batchSize);
    }

    if (backend.backendType === RenderBackendType.WebGpu) {
      return new WebGpuParticleRenderer();
    }

    throw new Error(`Unsupported render backend: ${String(backend.backendType satisfies never)}`);
  },
});

/**
 * Default immutable Particles extension descriptor.
 * Pass it to the application that should have it via
 * `ApplicationOptions.extensions`.
 */
export const particlesExtension: Extension = Object.freeze({
  id: '@codexo/exojs-particles',
  renderers: [buildParticlesRendererBinding(8192)],
});

/**
 * Create a Particles extension with custom configuration.
 * Returns an application-local descriptor - safe to pass to one
 * `Application` only. For shared use, prefer {@link particlesExtension}.
 *
 * @example
 * ```ts
 * const ext = createParticlesExtension({ batchSize: 4096 });
 * const app = new Application({ extensions: [ext] });
 * ```
 */
export const createParticlesExtension = (options: ParticlesExtensionOptions = {}): Extension => {
  const batchSize = options.batchSize ?? 8192;

  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new Error('createParticlesExtension: batchSize must be a positive integer.');
  }

  return {
    id: '@codexo/exojs-particles',
    renderers: [buildParticlesRendererBinding(batchSize)],
  };
};
