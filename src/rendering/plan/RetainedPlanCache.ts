import type { Drawable } from '#rendering/Drawable';
import type { RenderBackend } from '#rendering/RenderBackend';

import type { MaterialKey } from './RenderCommand';

/**
 * The replayable payload of one previously-collected draw: everything
 * `RenderPlanBuilder.emitDraw` computed for it (material key, bounds in the
 * capture's space convention, seq/zIndex placement). Base shape shared by the
 * Slice-1 per-child {@link RetainedDrawSlot} and the Slice-2 whole-fragment
 * {@link RetainedFragmentDraw}.
 * @internal
 */
export interface RetainedDrawData {
  readonly drawable: Drawable;
  readonly seq: number;
  readonly zIndex: number;
  readonly material: MaterialKey;
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/**
 * @internal
 *
 * A previously-collected, still-valid draw command snapshot for one direct
 * `Drawable` child of a `Container` — everything `RenderPlanBuilder.emitDraw`
 * would have computed for it, captured so it can be replayed without redoing
 * cull/bounds/material-key work.
 */
export interface RetainedDrawSlot extends RetainedDrawData {
  readonly childIndex: number;
}

/**
 * Per-`Container` fragment cache for the Wave 3 static-subtree-skip (Track B,
 * Slice 1 — design spec §5.2/§5.4). One instance is owned by each `Container`
 * (`Container._retainedPlan`). Caches the direct-`Drawable`-child draw slots
 * produced by the last full (non-skipped) collect of that container's own
 * scope, keyed on the container's aggregate content/structure revision
 * (`SceneNode._contentRevision`/`_structureRevision`), the active view's
 * `updateId`, and the active `RenderBackend` identity.
 *
 * Direct container/effect-bearing children are never represented here — they
 * are always re-dispatched through a normal `_collect` call by the owning
 * `Container`, which recurses into their own independent `RetainedPlanCache`.
 * This keeps every reused scope shape byte-for-byte identical to a full
 * collect (nested containers keep their own material-grouping/z-sort
 * locality), so reuse is provably semantics-neutral.
 */
export class RetainedPlanCache {
  private _slots: readonly RetainedDrawSlot[] = [];
  private _contentRevision = -1;
  private _structureRevision = -1;
  private _viewUpdateId = -1;
  private _backend: RenderBackend | null = null;
  private _hasCapture = false;

  public get slots(): readonly RetainedDrawSlot[] {
    return this._slots;
  }

  public isClean(contentRevision: number, structureRevision: number, viewUpdateId: number, backend: RenderBackend): boolean {
    return (
      this._hasCapture &&
      this._contentRevision === contentRevision &&
      this._structureRevision === structureRevision &&
      this._viewUpdateId === viewUpdateId &&
      this._backend === backend
    );
  }

  public capture(contentRevision: number, structureRevision: number, viewUpdateId: number, backend: RenderBackend, slots: readonly RetainedDrawSlot[]): void {
    this._slots = slots;
    this._contentRevision = contentRevision;
    this._structureRevision = structureRevision;
    this._viewUpdateId = viewUpdateId;
    this._backend = backend;
    this._hasCapture = true;
  }

  public invalidate(): void {
    this._hasCapture = false;
    this._slots = [];
  }
}
