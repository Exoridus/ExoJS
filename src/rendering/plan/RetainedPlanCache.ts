import type { Drawable } from '#rendering/Drawable';
import { createEmptyMaterialKey } from '#rendering/material/MaterialKey';
import type { RenderBackend } from '#rendering/RenderBackend';

import { type DrawCommand } from './renderCommand';
import { copyRetainedDrawData, type MutableRetainedDrawData, releasePooledDrawables, type RetainedDrawData, RetainedRecordPool } from './RetainedRecordPool';

/**
 * @internal
 *
 * A previously-collected, still-valid draw command snapshot for one direct
 * `Drawable` child of a `Container` - everything `RenderPlanBuilder.emitDraw`
 * would have computed for it, captured so it can be replayed without redoing
 * cull/bounds/material-key work.
 */
export interface RetainedDrawSlot extends RetainedDrawData {
  readonly childIndex: number;
}

/**
 * Mutable pooled backing record for a {@link RetainedDrawSlot}: the cache
 * rewrites these in place on recapture so a steady-state
 * recapture of a same-shaped child list allocates zero objects. Structurally
 * satisfies the readonly {@link RetainedDrawSlot} contract consumers read.
 */
interface MutableRetainedDrawSlot extends MutableRetainedDrawData {
  childIndex: number;
}

const createSlot = (): MutableRetainedDrawSlot => ({
  childIndex: 0,
  drawable: undefined as unknown as Drawable,
  seq: 0,
  zIndex: 0,
  material: createEmptyMaterialKey(),
  minX: 0,
  minY: 0,
  maxX: 0,
  maxY: 0,
});

/**
 * Per-`Container` fragment cache for the static-subtree-skip. Lazily
 * allocated by `Container` the first
 * time a direct drawable child produces a capturable slot; containers without
 * such children never own one (`Container._retainedPlan`). Caches the
 * direct-`Drawable`-child draw slots
 * produced by the last full (non-skipped) collect of that container's own
 * scope, keyed on the container's aggregate content/structure revision
 * (`SceneNode._contentRevision`/`_structureRevision`), the active view's
 * `updateId`, and the active `RenderBackend` identity.
 *
 * Direct container/effect-bearing children are never represented here - they
 * are always re-dispatched through a normal `collect` call by the owning
 * `Container`, which recurses into their own independent `RetainedPlanCache`.
 * This keeps every reused scope shape byte-for-byte identical to a full
 * collect (nested containers keep their own material-grouping/z-sort
 * locality), so reuse is provably semantics-neutral.
 *
 * Capture protocol (pooled): `_beginCapture()` once per full
 * collect, `_appendSlot()` per captured direct-drawable draw (writes into a
 * grow-only record pool), `_commitCapture()` to key the capture. Records are
 * rewritten in place, so steady-state recapture allocates zero slot objects.
 */
export class RetainedPlanCache {
  /**
   * Grow-only record pool. It IS the slot list: `_appendSlot` acquires in
   * capture order, so the pool's used prefix is exactly the capture, and a
   * parallel array of the same records would only add a per-capture refill to
   * maintain (`length = 0` plus one push per slot, ~34 bytes per slot per
   * capture on a scene that recaptures every frame).
   */
  private readonly _slotPool = new RetainedRecordPool(createSlot);
  private _contentRevision = -1;
  private _structureRevision = -1;
  private _transformRevision = -1;
  private _viewUpdateId = -1;
  private _backend: RenderBackend | null = null;
  private _hasCapture = false;

  /** How many slots the current capture holds. */
  public get slotCount(): number {
    return this._slotPool.used;
  }

  /** Slot `index` of the current capture; callers hold `index < slotCount`. */
  public slotAt(index: number): RetainedDrawSlot {
    return this._slotPool.at(index);
  }

  /**
   * Keyed on transform-revision too: the cached slots hold each
   * child's screen-space AABB (`minX..maxY`), so a plain-container child move
   * must re-collect. Own-transform mutations no longer stamp the content channel,
   * so without this the skip would replay a
   * stale extent. Unlike a {@link RetainedContainer} - which patches its rows in
   * place - the plain-container skip has no per-slot patch path and simply
   * re-collects, exactly as it did when transform still content-dirtied.
   */
  public isClean(contentRevision: number, structureRevision: number, transformRevision: number, viewUpdateId: number, backend: RenderBackend): boolean {
    return (
      this._hasCapture &&
      this._contentRevision === contentRevision &&
      this._structureRevision === structureRevision &&
      this._transformRevision === transformRevision &&
      this._viewUpdateId === viewUpdateId &&
      this._backend === backend
    );
  }

  /**
   * Start a new capture: drops the previous one (it is being replaced) and
   * rewinds the record pool. A freshly constructed cache is already "begun".
   * @internal
   */
  public _beginCapture(): void {
    this._hasCapture = false;
    this._slotPool.rewind();
  }

  /**
   * Record one direct-drawable draw into the capture, copying the command's
   * placement/material/bounds into a pooled record (no allocation once the
   * pool has grown to the child count).
   * @internal
   */
  public _appendSlot(childIndex: number, command: DrawCommand): void {
    const slot = this._slotPool.acquire();

    slot.childIndex = childIndex;
    copyRetainedDrawData(slot, command);
  }

  /** @internal - key the capture; only after this does {@link isClean} consider it. */
  public _commitCapture(contentRevision: number, structureRevision: number, transformRevision: number, viewUpdateId: number, backend: RenderBackend): void {
    this._contentRevision = contentRevision;
    this._structureRevision = structureRevision;
    this._transformRevision = transformRevision;
    this._viewUpdateId = viewUpdateId;
    this._backend = backend;
    this._hasCapture = true;
  }

  public invalidate(): void {
    releasePooledDrawables(this._slotPool);
    this._hasCapture = false;
    this._slotPool.rewind();
  }
}
