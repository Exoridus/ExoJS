import { logger } from '#core/Logger';
import { Mesh } from '#rendering/mesh/Mesh';
import { Sprite } from '#rendering/sprite/Sprite';

import type { Drawable } from './Drawable';
import { RenderBackendType } from './RenderBackendType';
import { RenderError } from './RenderError';

const remedy = 'Give the drawable a material whose fragment shader declares one output per attachment, or render it into a single-attachment RenderTexture.';

/**
 * Note the one case the reflection cannot decide, in dev builds only.
 *
 * Reaching this means the language for the active backend is supplied but its
 * declared output count did not resolve, so the draw proceeds unchecked: a
 * refusal here would reject correct shaders over a parser limitation.
 */
const warnUnresolvedOutputs = (shaderId: number, attachmentCount: number): void => {
  logger.warn(
    `Could not determine how many outputs a material's fragment shader declares, so the draw into a render target with ${attachmentCount} colour attachments was not verified. ` +
      `If it declares fewer, the attachments beyond them keep their previous contents (WebGL2) or the pipeline is rejected at creation (WebGPU).`,
    { source: 'multiAttachmentGuard', once: `multi-attachment-unresolved:${shaderId}:${attachmentCount}` },
  );
};

/**
 * Refuse a drawable that cannot write every colour attachment of the active
 * multi-attachment target.
 *
 * Two conditions are refused, both because WebGPU already fails on them and a
 * difference in behaviour between the backends is worse than a refusal on both:
 *
 * - No material. Every other renderer, and both default materials, declare a
 *   single fragment output; on WebGPU a pipeline must declare one target per
 *   attachment of the pass it runs in, so those paths could not satisfy such a
 *   pass without pipeline variants that write nothing to the extra slots.
 * - A material whose fragment shader declares fewer outputs than the target has
 *   attachments, per {@link Shader.fragmentOutputs} for the active backend's
 *   language. WebGPU rejects the pipeline at creation; WebGL2 would accept the
 *   draw and write only the attachments the shader declares, leaving the rest
 *   at their previous contents.
 *
 * A count of `null` means the reflection could not resolve the source, never
 * that it declares none, so it proceeds with a dev-build warning rather than a
 * refusal.
 *
 * Only reached while a multi-attachment target is bound; the backends keep that
 * as a cached flag so an ordinary frame never pays for the check.
 * @internal
 */
export const assertDrawsAllAttachments = (drawable: Drawable, attachmentCount: number, backendType: RenderBackendType): void => {
  const material = drawable instanceof Mesh || drawable instanceof Sprite ? drawable.material : null;

  if (material === null) {
    throw new RenderError({
      code: 'unsupported-format',
      backendType,
      message: `The active render target has ${attachmentCount} colour attachments, which only a Mesh or Sprite with a material can write. ${remedy}`,
    });
  }

  const shader = material.shader;
  const forWebGpu = backendType === RenderBackendType.WebGpu;
  const declared = forWebGpu ? shader.fragmentOutputs.wgsl : shader.fragmentOutputs.glsl;

  if (declared === null) {
    // A shader that does not carry the active backend's language at all fails
    // later with the backend's own, more specific error; warning here would
    // only mislabel it as a reflection limitation.
    if (__DEV__ && (forWebGpu ? shader.wgsl : shader.glsl) !== null) {
      warnUnresolvedOutputs(shader.id, attachmentCount);
    }

    return;
  }

  if (declared < attachmentCount) {
    throw new RenderError({
      code: 'unsupported-format',
      backendType,
      message:
        `A material's fragment shader declares ${declared} output(s) but the active render target has ${attachmentCount} colour attachments. ` +
        `Attachments beyond the declared outputs would keep their previous contents (WebGL2) or be rejected at pipeline creation (WebGPU). ${remedy}`,
    });
  }
};

/**
 * Refuse alpha-mask or backdrop-blend compositing into a multi-attachment target.
 *
 * Both composite through their own single-output shader, so they can no more
 * satisfy such a pass than an ordinary sprite can. Refused rather than silently
 * writing slot 0 only, which is what WebGL2 would do while WebGPU rejects the
 * draw outright.
 * @internal
 */
export const assertSingleAttachmentCompose = (operation: string, attachmentCount: number, backendType: RenderBackendType): void => {
  throw new RenderError({
    code: 'unsupported-format',
    backendType,
    message:
      `${operation} cannot run into a render target with ${attachmentCount} colour attachments - it composites through a single-output shader. ` +
      `Compose into a single-attachment RenderTexture and draw the result into the multi-attachment target with a material of your own.`,
  });
};
