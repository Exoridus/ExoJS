import type { Drawable } from '#rendering/Drawable';
import type { RenderBackend } from '#rendering/RenderBackend';
import { BlendModes } from '#rendering/types';

import { copyMaterialKeyInto, type DrawCommand, type MaterialKey } from './RenderCommand';

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
 * Mutable pooled backing record for a {@link RetainedDrawSlot} (Slice 3,
 * F11a): the cache rewrites these in place on recapture so a steady-state
 * recapture of a same-shaped child list allocates zero objects. Structurally
 * satisfies the readonly {@link RetainedDrawSlot} contract consumers read.
 */
interface MutableRetainedDrawSlot {
  childIndex: number;
  drawable: Drawable;
  seq: number;
  zIndex: number;
  readonly material: MaterialKey;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Per-`Container` fragment cache for the Wave 3 static-subtree-skip (Track B,
 * Slice 1 — design spec §5.2/§5.4). Lazily allocated by `Container` the first
 * time a direct drawable child produces a capturable slot; containers without
 * such children never own one (`Container._retainedPlan`). Caches the
 * direct-`Drawable`-child draw slots
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
 *
 * Capture protocol (Slice 3, F11a — pooled): `_beginCapture()` once per full
 * collect, `_appendSlot()` per captured direct-drawable draw (writes into a
 * grow-only record pool), `_commitCapture()` to key the capture. Records are
 * rewritten in place, so steady-state recapture allocates zero slot objects.
 */
export class RetainedPlanCache {
  /** Active slot list, reused across captures (pointer pushes only). */
  private readonly _slots: MutableRetainedDrawSlot[] = [];
  /** Grow-only record pool; `_slots` holds a cursor-ordered prefix of it. */
  private readonly _slotPool: MutableRetainedDrawSlot[] = [];
  private _poolCursor = 0;
  private _contentRevision = -1;
  private _structureRevision = -1;
  private _transformRevision = -1;
  private _viewUpdateId = -1;
  private _backend: RenderBackend | null = null;
  private _hasCapture = false;

  public get slots(): readonly RetainedDrawSlot[] {
    return this._slots;
  }

  /**
   * Keyed on transform-revision too (Slice 4b): the cached slots hold each
   * child's screen-space AABB (`minX..maxY`), so a plain-container child move
   * must re-collect. Own-transform mutations no longer stamp the content channel
   * (Slice 4b dropped that co-bump), so without this the skip would replay a
   * stale extent. Unlike a {@link RetainedContainer} — which patches its rows in
   * place — the plain-container skip has no per-slot patch path and simply
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
   */
  public _beginCapture(): void {
    this._hasCapture = false;
    this._slots.length = 0;
    this._poolCursor = 0;
  }

  /**
   * Record one direct-drawable draw into the capture, copying the command's
   * placement/material/bounds into a pooled record (no allocation once the
   * pool has grown to the child count).
   */
  public _appendSlot(childIndex: number, command: DrawCommand): void {
    const slot = this._acquireSlot();

    slot.childIndex = childIndex;
    slot.drawable = command.drawable;
    slot.seq = command.seq;
    slot.zIndex = command.zIndex;
    copyMaterialKeyInto(slot.material, command.material);
    slot.minX = command.minX;
    slot.minY = command.minY;
    slot.maxX = command.maxX;
    slot.maxY = command.maxY;
    this._slots.push(slot);
  }

  /** Key the capture; only after this does {@link isClean} consider it. */
  public _commitCapture(contentRevision: number, structureRevision: number, transformRevision: number, viewUpdateId: number, backend: RenderBackend): void {
    this._contentRevision = contentRevision;
    this._structureRevision = structureRevision;
    this._transformRevision = transformRevision;
    this._viewUpdateId = viewUpdateId;
    this._backend = backend;
    this._hasCapture = true;
  }

  public invalidate(): void {
    this._releaseDrawableRefs();
    this._hasCapture = false;
    this._slots.length = 0;
    this._poolCursor = 0;
  }

  /**
   * @internal — dev-only P3f probe: `true` when any captured slot still
   * references a destroyed {@link Drawable} (a direct drawable child
   * destroy()ed without `removeChild`, so no revision bump dropped the
   * capture). Scans only the active slot list — the same O(slots) the replay
   * already walks — and is stripped from production via the `__DEV__` guard at
   * the call site.
   */
  public _devHasDestroyedDrawable(): boolean {
    for (let index = 0; index < this._slots.length; index++) {
      // `?.`: released pool records (post-invalidate) hold no drawable.
      if (this._slots[index]!.drawable?.destroyed) {
        return true;
      }
    }

    return false;
  }

  /**
   * Drop the grow-only slot pool's strong references to their drawables so an
   * evicted/destroyed drawable can be garbage-collected (P3f). The pooled slot
   * objects survive and their `drawable` is rewritten in place on the next
   * capture, so pool reuse is unaffected.
   */
  private _releaseDrawableRefs(): void {
    for (let index = 0; index < this._poolCursor; index++) {
      this._slotPool[index]!.drawable = undefined as unknown as Drawable;
    }
  }

  private _acquireSlot(): MutableRetainedDrawSlot {
    const pooled = this._slotPool[this._poolCursor];

    if (pooled !== undefined) {
      this._poolCursor++;

      return pooled;
    }

    const slot: MutableRetainedDrawSlot = {
      childIndex: 0,
      drawable: undefined as unknown as Drawable,
      seq: 0,
      zIndex: 0,
      material: { rendererId: 0, blendMode: BlendModes.Normal, textureId: -1, shaderId: -1, pipelineKey: 0, bindKey: 0 },
      minX: 0,
      minY: 0,
      maxX: 0,
      maxY: 0,
    };

    this._slotPool[this._poolCursor] = slot;
    this._poolCursor++;

    return slot;
  }
}
