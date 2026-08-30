import type { RenderNode } from '#rendering/RenderNode';

import type { EntryPlacementState } from './entryPlacement';
import { PackedSourceItems } from './PackedSourceItems';
import { RenderEntryKind } from './renderCommand';
import { SourceVisibilityIndex } from './SourceVisibilityIndex';

/**
 * Why an entry must be re-dispatched live on every selection instead of being
 * replayed from the source.
 * @internal
 */
export const enum LiveEntryReason {
  /** A barrier effect: already live re-dispatch in the retained fragment. */
  Barrier,
  /** A transform-group boundary, kept live so it owns its own retention tier. */
  Boundary,
  /**
   * The producer read the view during collect, so its output is a function of
   * the camera (`ImageLayerNode` and `TileLayerNode` size repeat coverage from
   * `view.center`). Attributed to the producer that read it, never to the root.
   */
  ViewDependent,
}

/**
 * @internal
 *
 * A producer the source refuses to persist: re-dispatched through a normal
 * `_collect` at its recorded placement on every selection.
 *
 * Kept as local as the semantics allow, which is what contract 10 of the
 * architecture freeze asks for - the optimisation object is a segment, not the
 * whole renderer. One view-dependent parallax layer must therefore cost one
 * live entry, not the persistence of the other 999,999 sprites around it.
 *
 * No `zIndex`: the re-dispatch goes through `RenderNode._collect`, which reads
 * the node's live `zIndex` exactly as a full collect would. Only the placement
 * the source cannot re-derive - the child index the producer was collected at -
 * has to be stored.
 */
export interface LiveEntry {
  /**
   * Reuses the barrier discriminant on purpose: in the retained fragment
   * `RetainedFragmentBarrier` already means "not captured, re-dispatched through
   * a normal `_collect` on every replay", which is exactly this entry's
   * playback. {@link LiveEntryReason} carries why, so the two are still
   * distinguishable where it matters.
   */
  readonly kind: RenderEntryKind.Barrier;
  seq: number;
  node: RenderNode;
  reason: LiveEntryReason;
  /**
   * How many of the owning scope's items had been recorded when this entry was
   * pushed - i.e. where it sits in the scope's recorded order.
   *
   * Recorded order, not `seq`, is what the emit walk has to reproduce: `seq` is
   * the caller's explicit placement and an emitter is free to hand out a lower
   * one after a higher one, whereas the order entries were pushed in IS the
   * order a full collect produced. The optimizer re-sorts by `(zIndex, seq)`
   * afterwards exactly as it does for a live collect.
   */
  itemMark: number;
}

/**
 * @internal
 *
 * One entry container inside the source: its items, its non-item entries, and
 * the placement bookkeeping that decides their draw order.
 *
 * Items live in a {@link PackedSourceItems} rather than in the entry list, which
 * is the shape the delta needs: a scope's items are contiguous and in recorded
 * order, so membership is a bit range that can be scanned in draw order without
 * an indirection table, and the store costs 44 bytes an item instead of the 235
 * an object per item measured at a million.
 *
 * Shared placement shape with a frame-local `GroupScope` through
 * {@link EntryPlacementState}, which is what keeps the `(zIndex, seq)` rule
 * single-sourced across the two.
 */
export interface SourceScope extends EntryPlacementState {
  readonly items: PackedSourceItems;
  /** Nested groups and live entries, in recorded order (see {@link LiveEntry.itemMark}). */
  readonly others: SourceOther[];
  /** Spatial index over {@link items}, built once when the source is finalized. */
  readonly index: SourceVisibilityIndex;
  /**
   * Depth-first position of this scope among the source's scopes, assigned when
   * the source is finalized. The derived product keys its per-scope state on it.
   */
  ordinal: number;
  /**
   * First global item handle of this scope. Scope-local index `i` is global
   * handle `handleBase + i`; scopes are laid out in depth-first order so the
   * handle space is a partition, which is what lets one free list and one slot
   * table serve the whole root.
   */
  handleBase: number;
}

/**
 * A nested scope inside the source, mirroring the collected group structure.
 *
 * Carries `node` because a selection has to apply the SAME subtree-level cull
 * `SceneNode._collect` applies: a container whose aggregate bounds miss the rect
 * holds no child that meets it, so the whole group is skipped rather than
 * scanned item by item. Without it the selection would emit an empty group where
 * a full collect emits nothing.
 *
 * Never a transform-group boundary - those are {@link LiveEntry}s, so this scope
 * has no `transformNode` field to go stale.
 * @internal
 */
export interface SourceGroup extends SourceScope {
  readonly kind: RenderEntryKind.Group;
  seq: number;
  zIndex: number;
  preserveDrawOrder: boolean;
  node: RenderNode;
  /** See {@link LiveEntry.itemMark}. */
  itemMark: number;
}

/** A scope's non-item entries: nested groups and live re-dispatches. @internal */
export type SourceOther = SourceGroup | LiveEntry;

/** A fresh, empty source scope with its placement state at the start. @internal */
export const createSourceScope = (): SourceScope => ({
  items: new PackedSourceItems(),
  others: [],
  index: new SourceVisibilityIndex(),
  ordinal: -1,
  handleBase: 0,
  _nextSeq: 0,
  firstZ: null,
  hasMixedZ: false,
});

/**
 * Walk `scope` and every scope below it in depth-first order, assigning
 * ordinals and global handle bases and building each scope's spatial index.
 *
 * Runs once per source build. Returns the total item count, which is the size of
 * the root's handle space.
 * @internal
 */
export const finalizeSourceScopes = (scope: SourceScope, out: SourceScope[], nextHandle: number): number => {
  scope.ordinal = out.length;
  scope.handleBase = nextHandle;
  out.push(scope);
  scope.index.build(scope.items);

  let handle = nextHandle + scope.items.count;

  for (const other of scope.others) {
    if (other.kind === RenderEntryKind.Group) {
      handle = finalizeSourceScopes(other, out, handle);
    }
  }

  return handle;
};
