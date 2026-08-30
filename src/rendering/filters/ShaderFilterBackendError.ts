import { RenderBackendType } from '#rendering/RenderBackendType';

import type { ShaderFilterLanguage } from './ShaderFilter';

/**
 * A {@link ShaderFilter} was applied on a backend it carries no source for.
 *
 * Thrown when the filter first attaches to a backend - before any program,
 * pipeline or buffer is created - so a WGSL-less filter fails the moment a
 * WebGPU backend touches it rather than somewhere inside a draw.
 */
export class ShaderFilterBackendError extends Error {
  /** Backend the filter was attached to. */
  public readonly backendType: RenderBackendType;
  /** Language that backend needs and the filter does not carry. */
  public readonly missingLanguage: ShaderFilterLanguage;

  public constructor(backendType: RenderBackendType, missingLanguage: ShaderFilterLanguage) {
    super(
      `ShaderFilter carries no ${missingLanguage.toUpperCase()} source, which the active ${backendType === RenderBackendType.WebGpu ? 'WebGPU' : 'WebGL2'} backend requires. ` +
        `Pass \`${missingLanguage}\` alongside the source you already supply — with \`backend: 'auto'\` either backend can end up active.`,
    );

    this.name = 'ShaderFilterBackendError';
    this.backendType = backendType;
    this.missingLanguage = missingLanguage;
  }
}
