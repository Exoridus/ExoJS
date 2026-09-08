import { DirtyChannel } from '#core/nodeDirtyIndex';
import type { RenderNode } from '#rendering/RenderNode';

/**
 * Whether a marked change is the business of a live entry rather than of the
 * product asking - so the product can keep what it holds.
 *
 * A retained product (a root's persistent source, a group's captured fragment)
 * records nothing about a node it holds as a live entry: a barrier, a
 * transform-group boundary. Such a node is re-dispatched through its own
 * collect on every replay and reads its state as it is then, and everything
 * below it belongs to that dispatch or to the node's own product. A change
 * marked on or under one therefore leaves the asking product's records
 * intact. Three shapes qualify:
 *
 * - the marked node is a live entry of the product and still qualifies as one
 *   (an effect it carries changed, a boundary's own content changed);
 * - the marked node lies below a live entry of the product, whatever changed;
 * - the marked node is the product's own root and only its effect changed -
 *   the root's effect is played by whatever holds the root as a live entry,
 *   never by the root's own product.
 *
 * A live entry that stopped being one - a mask removed, a boundary disengaged
 * - fails the first shape on purpose: the product holds it as a re-dispatch
 * where the scene now has ordinary content, and has to rebuild. A node that
 * became a live entry never reaches here as one, because the product does not
 * hold it that way yet.
 * @internal
 */
export const changeBelongsToLiveEntry = (node: RenderNode, root: RenderNode, marked: number, isLiveEntry: (node: RenderNode) => boolean): boolean => {
  if (node === root) {
    return (marked & DirtyChannel.Effect) !== 0 && (marked & ~DirtyChannel.Effect) === 0;
  }

  for (let current: RenderNode | null = node; current !== null && current !== root; current = current.parent) {
    if (isLiveEntry(current)) {
      return current !== node || current._renderPlanHasBarrierEffects() || current._isTransformGroupBoundary;
    }
  }

  return false;
};
