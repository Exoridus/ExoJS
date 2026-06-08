import type { Extension, RendererBinding } from '@codexo/exojs/extensions';
import type { RenderBackend } from '@codexo/exojs/rendering';
import { RenderBackendType } from '@codexo/exojs/rendering';

import { ParticleSystem } from './ParticleSystem';
import { WebGl2ParticleRenderer } from './renderers/WebGl2ParticleRenderer';
import { WebGpuParticleRenderer } from './renderers/WebGpuParticleRenderer';

/** Options for {@link createParticlesExtension}. */
export interface ParticlesExtensionOptions {
  /** WebGL2 particle renderer batch size. Default: 8192. */
  readonly batchSize?: number;
}

function buildParticlesRendererBinding(batchSize: number): RendererBinding {
  return {
    targets: [ParticleSystem],
    create(backend: RenderBackend) {
      if (backend.backendType === RenderBackendType.WebGl2) {
        return new WebGl2ParticleRenderer(batchSize);
      }

      if (backend.backendType === RenderBackendType.WebGpu) {
        return new WebGpuParticleRenderer();
      }

      return undefined;
    },
  };
}

/**
 * Default immutable Particles extension descriptor.
 * Use with `ApplicationOptions.extensions` or call
 * `import '@codexo/exojs-particles/register'` for global auto-registration.
 */
export const particlesExtension: Extension = Object.freeze({
  id: '@codexo/exojs-particles',
  renderers: [buildParticlesRendererBinding(8192)],
});

/**
 * Create a Particles extension with custom configuration.
 * Returns an application-local descriptor — safe to pass to one
 * `Application` only. For shared use, prefer {@link particlesExtension}.
 *
 * @example
 * ```ts
 * const ext = createParticlesExtension({ batchSize: 4096 });
 * const app = new Application({ extensions: [ext] });
 * ```
 */
export function createParticlesExtension(options: ParticlesExtensionOptions = {}): Extension {
  const batchSize = options.batchSize ?? 8192;

  return {
    id: '@codexo/exojs-particles',
    renderers: [buildParticlesRendererBinding(batchSize)],
  };
}
