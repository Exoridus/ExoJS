import type { Texture } from '@codexo/exojs';

import type { LightingDebugView } from '../Lighting';

/**
 * Drops the batches keyed by a destroyed texture. A destroyed cookie can no
 * longer be asked for, so its batch would otherwise pin a material for the
 * backend's life.
 * @internal
 */
export const releaseDestroyedBatches = <B extends { readonly material?: { destroy(): void } | null; destroy(): void }>(
  batches: Map<Texture, B>,
): void => {
  for (const [texture, batch] of batches) {
    if (texture.destroyed) {
      batch.material?.destroy();
      batch.destroy();
      batches.delete(texture);
    }
  }
};

/**
 * The intermediate a debug view multiplies the white frame by. `normals` is the
 * 1x1 placeholder target while nothing describes a surface, which would smear
 * one texel over the frame, so the caller passes whichever is valid.
 * @internal
 */
export const pickDebugTexture = <T>(view: LightingDebugView, normals: T, mask: T, light: T): T => {
  if (view === 'normals') {
    return normals;
  }

  return view === 'mask' ? mask : light;
};
