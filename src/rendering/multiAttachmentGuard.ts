import { Mesh } from '#rendering/mesh/Mesh';
import { Sprite } from '#rendering/sprite/Sprite';

import type { Drawable } from './Drawable';
import type { RenderBackendType } from './RenderBackendType';
import { RenderError } from './RenderError';

/**
 * Refuse a drawable that cannot write every colour attachment of the active
 * multi-attachment target.
 *
 * Only a mesh or a sprite with a custom material qualifies: every other
 * renderer, and both default materials, declares a single fragment output. On
 * WebGPU a pipeline must declare one target per attachment of the pass it runs
 * in, so those paths could not satisfy such a pass without pipeline variants
 * that write nothing to the extra slots. WebGL2 would silently accept them and
 * leave the other attachments at their cleared contents - a difference in
 * behaviour between the backends is worse than a refusal on both.
 *
 * Only reached while a multi-attachment target is bound; the backends keep that
 * as a cached flag so an ordinary frame never pays for the check.
 * @internal
 */
export const assertDrawsAllAttachments = (drawable: Drawable, attachmentCount: number, backendType: RenderBackendType): void => {
  if ((drawable instanceof Mesh || drawable instanceof Sprite) && drawable.material !== null) {
    return;
  }

  throw new RenderError({
    code: 'unsupported-format',
    backendType,
    message:
      `The active render target has ${attachmentCount} colour attachments, which only a Mesh or Sprite with a material can write. ` +
      `Give the drawable a material whose fragment shader declares one output per attachment, or render it into a single-attachment RenderTexture.`,
  });
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
