import type { Drawable } from '#rendering/Drawable';
import type { RenderNode } from '#rendering/RenderNode';

import type { RenderEntryKind } from './RenderCommand';

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
 * One persistent, replayable draw in a {@link RenderRootSource}.
 *
 * Deliberately NOT a `RetainedFragmentDraw`. That type carries `material` (a
 * backend-bound {@link MaterialKey}) and `nodeIndex` (a frame-local transform
 * row), and neither survives the source's contract: the source outlives frames
 * and must not assume a backend. Both are re-derived when a selection is emitted
 * — the material because a backend switch invalidates it anyway, the row because
 * it is assigned per frame.
 *
 * `minX`..`maxY` are the drawable's WORLD bounds as of discovery. They feed the
 * visibility test and, later, a spatial index; they are ancestry-dependent, so
 * an ancestry-stamp change invalidates them (see the source's contract).
 */
export interface PersistentDrawItem {
  readonly kind: RenderEntryKind.Draw;
  /**
   * Identity within this source, stable until the next content/structure
   * rebuild. A producer maps to 0..n items — a container contributes none, a
   * sprite one, a composite drawable several — so this is the handle the free
   * list, the visibility index and the delta key on, not the drawable.
   */
  handle: number;
  drawable: Drawable;
  seq: number;
  zIndex: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * @internal
 *
 * A producer the source refuses to persist: re-dispatched through a normal
 * `_collect` at its recorded placement on every selection.
 *
 * Kept as local as the semantics allow, which is what contract 10 of the
 * architecture freeze asks for — the optimisation object is a segment, not the
 * whole renderer. One view-dependent parallax layer must therefore cost one
 * live entry, not the persistence of the other 999,999 sprites around it.
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
}

/** A nested scope inside the source, mirroring the collected group structure. @internal */
export interface SourceGroup {
  readonly kind: RenderEntryKind.Group;
  seq: number;
  zIndex: number;
  preserveDrawOrder: boolean;
  transformNode: RenderNode | null;
  readonly entries: SourceEntry[];
}

/** @internal */
export type SourceEntry = PersistentDrawItem | SourceGroup | LiveEntry;
