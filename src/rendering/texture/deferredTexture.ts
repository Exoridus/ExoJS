import type { RenderNode } from '#rendering/RenderNode';

import type { Texture } from './Texture';

/**
 * Invalidate `node` once `texture` finishes loading.
 *
 * For a drawable whose geometry is derived from the texture's dimensions - a
 * nine-slice's insets, a repeat's tile grid - a loader handle that reports 0x0
 * at construction produces geometry that is correct for nothing. Rebuilding it
 * when the dimensions arrive is not enough on its own: a retained product
 * decides whether to replay from the node's revisions alone and never visits a
 * node it skipped, so a subtree recorded around the empty geometry would go on
 * replaying it. The invalidation is what makes the rebuild reachable.
 *
 * A texture that is already loaded, or one that fails, does nothing here.
 */
export const invalidateOnTextureLoad = (node: RenderNode, texture: Texture): void => {
  if (texture.ready) {
    return;
  }

  // A texture that carries no readiness promise has no load to wait for - a
  // caller-supplied stand-in with fixed dimensions, say. Reading `.then` off it
  // unconditionally would turn that into a construction-time crash.
  const loaded = texture.loaded as Promise<unknown> | undefined;

  if (typeof loaded?.then !== 'function') {
    return;
  }

  void loaded.then(
    () => {
      // The node may have been destroyed while the payload was in flight, and a
      // destroyed node must not be marked - the mark would outlive the subtree
      // it describes.
      if (!node.destroyed) {
        node.invalidateCache();
      }
    },
    () => {
      // A failed load shows the missing texture, which is already what the node
      // draws - there is nothing to rebuild for.
    },
  );
};
