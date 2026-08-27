import { DirtyChannel, nodeDirtyIndex } from '#core/NodeDirtyIndex';
import type { Drawable } from '#rendering/Drawable';
import type { RenderBackend } from '#rendering/RenderBackend';
import type { RenderNode } from '#rendering/RenderNode';
import { packTransformRow, TRANSFORM_FLOATS_PER_ROW } from '#rendering/TransformBuffer';

import type { RetainedGroupFragment } from './RetainedGroupFragment';
import type { RetainedGroupBundle } from './RetainedInstructionSet';

/**
 * A {@link RetainedGroupBundle} with its optional `_patchTransformRow` capability
 * confirmed present. Established once by {@link reconcileRetainedTransformRows}
 * so the narrowing carries into the patch call instead of a blind non-null
 * assertion at the call site.
 * @internal
 */
export type PatchableRetainedGroupBundle = RetainedGroupBundle & {
  _patchTransformRow: NonNullable<RetainedGroupBundle['_patchTransformRow']>;
};

/**
 * A backend exposing a renderer registry, structurally - the same narrow shape
 * `drawCommandUsesSharedTransform` (`plan/RenderCommand.ts`) resolves through,
 * so every call site agrees on what "the renderer for this drawable" means
 * without a hard dependency between the modules.
 */
interface BackendWithRendererRegistry {
  readonly rendererRegistry?: {
    resolve(drawable: Drawable): unknown;
  };
}

/**
 * Optional per-renderer escape hatch from the generic shared-`TransformBuffer`
 * row patch: a renderer that packs its own private per-node data
 * (`_consumesSharedTransform === false`, e.g. Text - its row format and storage
 * differ from the shared buffer's) implements this instead, patching whatever it
 * owns directly. `base` is the same capture-frame row base the generic path
 * uses; a renderer whose own indexing scheme does not need it may ignore the
 * parameter. Returns `false` when the node is not fast-patch-eligible, which
 * drops the recording and falls back to a full re-record - never wrong pixels,
 * only a missed optimization.
 *
 * Renderer-agnostic by design: a WebGL2 implementation of the same renderer
 * (CPU-side vertex re-bake instead of a GPU buffer write) satisfies this exact
 * interface unchanged.
 * @internal
 */
export interface OwnTransformRowPatcher {
  _patchOwnTransformRow(node: RenderNode, bundle: RetainedGroupBundle, base: number): boolean;
}

const hasOwnTransformRowPatch = (renderer: unknown): renderer is OwnTransformRowPatcher =>
  typeof (renderer as { _patchOwnTransformRow?: unknown } | null)?._patchOwnTransformRow === 'function';

/**
 * Reused scratch for one patched transform row (3 rgba32f texels, the
 * {@link TransformBuffer} layout). Filled and consumed synchronously inside a
 * single patch call, so one module-level buffer is safe and allocation-free
 * under churn.
 */
const patchRowScratch = new Float32Array(TRANSFORM_FLOATS_PER_ROW);

/**
 * Patch one moved node's recorded transform row, or return `false` when it is
 * not fast-patch-eligible (not present in the recorded row map). The matrix is
 * `getGlobalTransform()` - relative to the nearest enclosing transform-group
 * boundary, or world-space without one - which is exactly the value the recorder
 * wrote.
 *
 * A renderer that opts out of the shared `TransformBuffer` (its resolved renderer
 * exposes {@link OwnTransformRowPatcher}, e.g. Text) is dispatched to its OWN
 * patch method: its row lives in a private, renderer-owned store the generic path
 * never reads, so calling the generic patch there would silently no-op against
 * bytes nobody consumes - stale pixels, not a caught failure.
 * @internal
 */
export const tryPatchRetainedTransformRow = (
  node: RenderNode,
  fragment: RetainedGroupFragment,
  bundle: PatchableRetainedGroupBundle,
  backend: RenderBackend,
  base: number,
): boolean => {
  const drawable = node as unknown as Drawable;
  const registry = (backend as BackendWithRendererRegistry).rendererRegistry;

  if (registry && typeof registry.resolve === 'function') {
    try {
      const renderer = registry.resolve(drawable);

      if (hasOwnTransformRowPatch(renderer)) {
        return renderer._patchOwnTransformRow(node, bundle, base);
      }
    } catch {
      // No renderer registered for this drawable (custom drawable type) - fall
      // through to the generic shared-transform patch below.
    }
  }

  const nodeIndex = fragment.recordedRowIndex(drawable);

  // A recorded draw may be pixel-snapped in either mode: its patched row carries
  // the raw transform plus the snap flag (packTransformRow) and the shader rounds
  // the device origin (and, in geometry mode, the quad edges), so the row stays
  // view-independent and fully recordable.
  if (nodeIndex === undefined) {
    return false;
  }

  // Transform-only patch: tint is not part of this row (it lives in the bundle's
  // separate tint texture) and a moved node's tint does not change.
  packTransformRow(patchRowScratch, 0, node.getGlobalTransform(), drawable.pixelSnapMode);
  bundle._patchTransformRow(nodeIndex - base, patchRowScratch);

  return true;
};

/**
 * Visit every node whose transform moved since `fragment` last accounted for
 * one and that `owns` claims. `false` means the index no longer covers the
 * fragment's cursor, or `visit` abandoned the walk - either way the caller
 * cannot treat the channel as settled.
 *
 * The ownership test is the caller's, because the two consumers draw the
 * boundary differently: a {@link RetainedContainer} owns the moves whose
 * NEAREST enclosing boundary it is (a move below a nested group belongs to that
 * group's rows, not to its own), while a render root owns every move in its
 * subtree. Marks outside the caller's subtree belong to another consumer and
 * are skipped without being looked at twice.
 * @internal
 */
export const forEachMovedNode = (fragment: RetainedGroupFragment, owns: (node: RenderNode) => boolean, visit: (node: RenderNode) => boolean): boolean =>
  nodeDirtyIndex.readSince(fragment.transformCursor, DirtyChannel.Transform, node => {
    const moved = node as unknown as RenderNode;

    return !owns(moved) || visit(moved);
  });

/** Whether `node` lies anywhere below `ancestor`. */
export const isUnder = (node: RenderNode, ancestor: RenderNode): boolean => {
  let parent = node.parent;

  while (parent !== null) {
    if ((parent as unknown as RenderNode) === ancestor) {
      return true;
    }

    parent = parent.parent;
  }

  return false;
};

/**
 * Rewrite a moved node's snapshotted screen AABB in its captured draw record.
 * A record whose extent is one move out of date is not a rendering error by
 * itself - the replay re-derives nothing from it - but the optimizer reads it to
 * decide whether a batch run may be reordered past an intervening draw, and a
 * stale extent can hide a real overlap.
 */
const refreshRetainedDrawBounds = (fragment: RetainedGroupFragment, node: RenderNode): void => {
  const record = fragment.recordedDraw(node as unknown as Drawable);

  if (record === undefined) {
    return;
  }

  const bounds = node.getBounds();

  record.minX = bounds.left;
  record.minY = bounds.top;
  record.maxX = bounds.right;
  record.maxY = bounds.bottom;
};

/**
 * Reconcile the fragment's queued transform-only moves against its recorded
 * instruction set. On the recorded tier the transforms are baked into the
 * fragment-owned store, so each eligible moved node's row is patched in place
 * (O(k) rows + one sub-range upload). Any ineligible move drops the recording, so
 * the frame falls back to entry replay with live transforms and re-records -
 * correct, O(entries), the rare path. Without a patchable recording there is
 * nothing to reconcile and the queue is simply drained.
 *
 * Two caller rules, and they are not the same question. `owns` says which
 * marked moves are this fragment's business at all - one below a nested
 * transform group belongs to that group's rows, one outside the subtree to
 * another consumer entirely, and both are skipped. `isEligible` says which of
 * the moves it does own may be patched: a {@link RetainedContainer} admits only
 * its DIRECT children, because a deeper node's row is recorded but its group-
 * local basis runs through an intermediate container the patch does not
 * re-derive; the render-root representation admits every recorded node. An
 * owned move that is not eligible drops the recording rather than being
 * skipped - it is a real change to a product that cannot express it.
 *
 * Returns `false` when the recording was dropped - the caller must then treat its
 * product as stale for this frame.
 * @internal
 */
export const reconcileRetainedTransformRows = (
  fragment: RetainedGroupFragment,
  backend: RenderBackend,
  owns: (node: RenderNode) => boolean,
  isEligible: (node: RenderNode) => boolean,
): boolean => {
  const set = fragment.instructions;

  if (!set?.hasRecording) {
    // Nothing is baked: either no recording was ever armed (the bootstrap frame
    // - a fragment only gets an instruction set once it reaches the record-arming
    // tier) or the fragment sits on entry replay. Both re-read each node's live
    // transform, so there is no row to patch. Only the RECORD's snapshotted
    // screen AABB is stale, and the optimizer's reorder-safety test reads it -
    // refresh those and report the moves as accounted for.
    const complete = forEachMovedNode(fragment, owns, node => {
      refreshRetainedDrawBounds(fragment, node);

      return true;
    });

    fragment.markTransformsSeen();

    return complete;
  }

  const bundle = set.ownedBundle;

  if (bundle === null || typeof bundle._patchTransformRow !== 'function' || bundle.transformRowBase === undefined) {
    // The set holds a recording whose baked rows we cannot patch (a backend
    // without row-patch support), yet a transform-only move must still take
    // effect. Drop the recording so validation fails and the caller falls back to
    // live transforms; without this the stale rows would keep being spliced and
    // the moved node would render frozen.
    set.invalidate();
    fragment.markTransformsSeen();

    return false;
  }

  // The row origin is the fragment's CAPTURE-frame minimum draw index - NOT
  // `bundle.transformRowBase` (the record-frame rebase base). The two frames can
  // start the fragment at different absolute rows, and the store rows are
  // fragment-local, so only the capture-frame base maps a captured index to its
  // store row (see RetainedGroupFragment.recordedRowBase).
  const base = fragment.recordedRowBase();
  const patchableBundle = bundle as PatchableRetainedGroupBundle;

  const patched = forEachMovedNode(fragment, owns, node => {
    refreshRetainedDrawBounds(fragment, node);

    return isEligible(node) && tryPatchRetainedTransformRow(node, fragment, patchableBundle, backend, base);
  });

  if (!patched) {
    // A move this fragment owns but cannot patch - not a recorded draw, or the
    // index no longer covers the cursor. Drop the baked recording: validation
    // now fails, so the caller falls back to entry replay (live transforms) and
    // re-records this frame.
    set.invalidate();
  }

  fragment.markTransformsSeen();

  return patched;
};
