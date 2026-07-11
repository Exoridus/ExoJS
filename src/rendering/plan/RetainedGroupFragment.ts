import type { Drawable } from '#rendering/Drawable';
import type { RenderBackend } from '#rendering/RenderBackend';
import type { RenderNode } from '#rendering/RenderNode';
import { BlendModes } from '#rendering/types';

import { copyMaterialKeyInto, type MaterialKey, RenderEntryKind } from './RenderCommand';
import type { ScopeEntry } from './RenderScope';

/**
 * A captured draw: replayed verbatim with a fresh frame-local nodeIndex.
 * Fields are mutable so the fragment's grow-only record pool (Slice 3, F11a)
 * can rewrite a record in place on recapture; structurally it still satisfies
 * the readonly {@link RetainedDrawData} contract consumers replay from.
 * @internal
 */
export interface RetainedFragmentDraw {
  readonly kind: RenderEntryKind.Draw;
  drawable: Drawable;
  seq: number;
  zIndex: number;
  /** Pooled key object, rewritten in place on recapture — never replaced. */
  readonly material: MaterialKey;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** A captured nested group scope (a plain or retained Container below the group). @internal */
export interface RetainedFragmentGroup {
  readonly kind: RenderEntryKind.Group;
  seq: number;
  zIndex: number;
  preserveDrawOrder: boolean;
  transformNode: RenderNode | null;
  /** Pooled entry list owned by this record, reset and refilled on recapture. */
  readonly entries: RetainedFragmentEntry[];
}

/**
 * A barrier-effect node inside the fragment. NOT captured — re-dispatched
 * through a normal `_collect` on every replay (spec §8: semantics-neutral by
 * construction; the node reference stays valid because any change below it
 * content-dirties the owning RetainedContainer and drops the fragment).
 * @internal
 */
export interface RetainedFragmentBarrier {
  readonly kind: RenderEntryKind.Barrier;
  seq: number;
  node: RenderNode;
}

/** @internal */
export type RetainedFragmentEntry = RetainedFragmentDraw | RetainedFragmentGroup | RetainedFragmentBarrier;

/**
 * Whole-command-range fragment cache for one {@link RetainedContainer}
 * (Track B Slice 2, spec §4.2). Keyed on the subtree's aggregate
 * content/structure revision and the backend identity — deliberately NOT on
 * `View.updateId` (group-level culling makes the fragment view-independent;
 * this is the camera-pan win) and NOT on the container's own transform
 * (a group move only changes the group matrix, §4.3).
 *
 * Snapshot records live in fragment-owned grow-only pools (Slice 3, F11a):
 * a steady-state recapture of a same-shaped subtree rewrites the previous
 * records in place and allocates zero objects.
 */
export class RetainedGroupFragment {
  private readonly _entries: RetainedFragmentEntry[] = [];
  private _contentRevision = -1;
  private _structureRevision = -1;
  private _backend: RenderBackend | null = null;
  private _hasCapture = false;

  // Grow-only record pools (F11a). Cursors reset per capture; the backing
  // records survive and are mutated in place. Each pooled group record owns
  // its own entries array, reused the same way.
  private readonly _drawPool: RetainedFragmentDraw[] = [];
  private _drawCursor = 0;
  private readonly _groupPool: RetainedFragmentGroup[] = [];
  private _groupCursor = 0;
  private readonly _barrierPool: RetainedFragmentBarrier[] = [];
  private _barrierCursor = 0;

  // Thrash suppression (Slice 3, F11b): a capture that is invalidated without
  // ever having been replayed was pure waste. One wasted capture is tolerated
  // (a lone mutation between replays keeps the Slice-2 recapture-immediately
  // behavior); the SECOND consecutive wasted capture is evidence of
  // per-frame thrash — from then on dirty frames skip the snapshot entirely
  // (plain collect, cheapest possible dirty frame) until the revisions
  // observed on consecutive dirty frames stop moving, at which point one full
  // collect + capture recovers the retained tier (one frame late,
  // self-correcting, no tunables).
  private _replayedSinceCapture = false;
  private _suppressed = false;
  private _wastedCaptures = 0;
  private _observedContent = -1;
  private _observedStructure = -1;

  public get hasCapture(): boolean {
    return this._hasCapture;
  }

  /** `true` while capture is thrash-suppressed (F11b). */
  public get captureSuppressed(): boolean {
    return this._suppressed;
  }

  /** The active capture was replayed (spliced) at least once — it earned its keep. */
  public markReplayed(): void {
    this._replayedSinceCapture = true;
  }

  /**
   * Decide, on a DIRTY build (the isClean gate already failed), whether this
   * frame's snapshot should be skipped (F11b). Mutates the suppression state
   * machine; call exactly once per dirty build, before collecting. Returns
   * `true` to skip the capture.
   */
  public shouldSuppressCapture(contentRevision: number, structureRevision: number): boolean {
    if (this._hasCapture) {
      if (this._replayedSinceCapture) {
        this._wastedCaptures = 0;

        return false;
      }

      this._wastedCaptures++;

      if (this._wastedCaptures < 2) {
        // Grace: a single wasted capture recaptures immediately (Slice-2
        // behavior for one-shot mutations).
        return false;
      }

      // Two consecutive captures invalidated without a single replay: thrash.
      this.invalidate();
      this._suppressed = true;
      this._observedContent = contentRevision;
      this._observedStructure = structureRevision;

      return true;
    }

    if (this._suppressed) {
      if (this._observedContent === contentRevision && this._observedStructure === structureRevision) {
        // The revisions stopped moving: this frame would have been clean if a
        // capture existed. Recover the retained tier now.
        this._suppressed = false;

        return false;
      }

      this._observedContent = contentRevision;
      this._observedStructure = structureRevision;

      return true;
    }

    return false;
  }

  public get entries(): readonly RetainedFragmentEntry[] {
    return this._entries;
  }

  public isClean(contentRevision: number, structureRevision: number, backend: RenderBackend): boolean {
    return this._hasCapture && this._contentRevision === contentRevision && this._structureRevision === structureRevision && this._backend === backend;
  }

  /**
   * Snapshot the given scope entries into this fragment's pooled records
   * (deep copy in place — Track B Slice 2 plan decision D-P3, pooled per
   * Slice 3 F11a) and key the capture. Draws copy their placement/material/
   * bounds verbatim; nested groups recurse; barrier nodes are recorded as
   * re-dispatch references only (spec §8). Called by {@link RetainedContainer}
   * right after a full collect of its scope.
   */
  public capture(contentRevision: number, structureRevision: number, backend: RenderBackend, entries: readonly ScopeEntry[]): void {
    // Not clean while the snapshot is being (re)written: an exception
    // mid-snapshot must not leave a half-updated capture looking valid.
    this._hasCapture = false;
    this._drawCursor = 0;
    this._groupCursor = 0;
    this._barrierCursor = 0;
    this._entries.length = 0;

    this._snapshotInto(this._entries, entries);

    this._contentRevision = contentRevision;
    this._structureRevision = structureRevision;
    this._backend = backend;
    this._hasCapture = true;
    this._replayedSinceCapture = false;
  }

  public invalidate(): void {
    this._hasCapture = false;
    this._entries.length = 0;
    this._replayedSinceCapture = false;
    this._suppressed = false;
    this._wastedCaptures = 0;
  }

  private _snapshotInto(target: RetainedFragmentEntry[], entries: readonly ScopeEntry[]): void {
    for (const entry of entries) {
      if (entry.kind === RenderEntryKind.Draw) {
        const command = entry.command;
        const record = this._acquireDraw();

        record.drawable = command.drawable;
        record.seq = command.seq;
        record.zIndex = command.zIndex;
        copyMaterialKeyInto(record.material, command.material);
        record.minX = command.minX;
        record.minY = command.minY;
        record.maxX = command.maxX;
        record.maxY = command.maxY;
        target.push(record);
      } else if (entry.kind === RenderEntryKind.Group) {
        const record = this._acquireGroup();

        record.seq = entry.seq;
        record.zIndex = entry.zIndex;
        record.preserveDrawOrder = entry.scope.preserveDrawOrder;
        record.transformNode = entry.scope.transformNode;
        record.entries.length = 0;
        this._snapshotInto(record.entries, entry.scope.entries);
        target.push(record);
      } else {
        const record = this._acquireBarrier();

        record.seq = entry.seq;
        record.node = entry.scope.node;
        target.push(record);
      }
    }
  }

  private _acquireDraw(): RetainedFragmentDraw {
    const pooled = this._drawPool[this._drawCursor];

    if (pooled !== undefined) {
      this._drawCursor++;

      return pooled;
    }

    const record: RetainedFragmentDraw = {
      kind: RenderEntryKind.Draw,
      drawable: undefined as unknown as Drawable,
      seq: 0,
      zIndex: 0,
      material: { rendererId: 0, blendMode: BlendModes.Normal, textureId: -1, shaderId: -1, pipelineKey: 0, bindKey: 0 },
      minX: 0,
      minY: 0,
      maxX: 0,
      maxY: 0,
    };

    this._drawPool[this._drawCursor] = record;
    this._drawCursor++;

    return record;
  }

  private _acquireGroup(): RetainedFragmentGroup {
    const pooled = this._groupPool[this._groupCursor];

    if (pooled !== undefined) {
      this._groupCursor++;

      return pooled;
    }

    const record: RetainedFragmentGroup = {
      kind: RenderEntryKind.Group,
      seq: 0,
      zIndex: 0,
      preserveDrawOrder: false,
      transformNode: null,
      entries: [],
    };

    this._groupPool[this._groupCursor] = record;
    this._groupCursor++;

    return record;
  }

  private _acquireBarrier(): RetainedFragmentBarrier {
    const pooled = this._barrierPool[this._barrierCursor];

    if (pooled !== undefined) {
      this._barrierCursor++;

      return pooled;
    }

    const record: RetainedFragmentBarrier = {
      kind: RenderEntryKind.Barrier,
      seq: 0,
      node: undefined as unknown as RenderNode,
    };

    this._barrierPool[this._barrierCursor] = record;
    this._barrierCursor++;

    return record;
  }
}
