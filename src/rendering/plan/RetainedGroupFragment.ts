import type { Drawable } from '#rendering/Drawable';
import type { RenderBackend } from '#rendering/RenderBackend';
import type { RenderNode } from '#rendering/RenderNode';
import { BlendModes } from '#rendering/types';

import { copyMaterialKeyInto, type MaterialKey, RenderEntryKind } from './RenderCommand';
import type { ScopeEntry } from './RenderScope';
import { isRetainedFragmentRecordable, RetainedInstructionSet } from './RetainedInstructionSet';

/**
 * A captured draw: replayed verbatim with a fresh frame-local nodeIndex.
 * Fields are mutable so the fragment's grow-only record pool
 * can rewrite a record in place on recapture; structurally it still satisfies
 * the readonly {@link RetainedDrawData} contract consumers replay from.
 * @internal
 */
export interface RetainedFragmentDraw {
  readonly kind: RenderEntryKind.Draw;
  drawable: Drawable;
  /**
   * The shared frame-buffer transform row this draw was captured on.
   * A group-local row is `nodeIndex - bundle.transformRowBase`; the fast patch
   * maps a moved direct child back to its group-owned store row through it. The
   * capture frame and the record frame are the same unchanged subtree, so the
   * captured index equals the recorded one.
   */
  nodeIndex: number;
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
  /**
   * The inner group's instruction set when it SPLICED during the capture
   * frame: its scope had no entries, so the outer fragment
   * must carry the set reference to reproduce the splice at replay. The set
   * object is per-fragment stable; validity is re-checked per replay, and a
   * stale set falls back to re-dispatching `transformNode._collect`. `null`
   * for scopes that collected entries normally.
   */
  retainedInstructions: RetainedInstructionSet | null;
  /** Pooled entry list owned by this record, reset and refilled on recapture. */
  readonly entries: RetainedFragmentEntry[];
}

/**
 * A barrier-effect node inside the fragment. NOT captured — re-dispatched
 * through a normal `_collect` on every replay (semantics-neutral by
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
 * Process-wide monotonic epoch for the dirty-transform-row dedup
 * (see {@link RetainedGroupFragment}). Each fragment reset claims a fresh value,
 * so a node's dedup stamp from any earlier cycle — this fragment's or another's
 * — can never equal a fragment's current epoch, making a false dedup (a dropped
 * move → stale render) impossible.
 */
let nextDirtyRowEpoch = 1;

/**
 * Whole-command-range fragment cache for one {@link RetainedContainer}.
 * Keyed on the subtree's aggregate
 * content/structure revision and the backend identity — deliberately NOT on
 * `View.updateId` (group-level culling makes the fragment view-independent;
 * this is the camera-pan win) and NOT on the container's own transform
 * (a group move only changes the group matrix).
 *
 * Snapshot records live in fragment-owned grow-only pools:
 * a steady-state recapture of a same-shaped subtree rewrites the previous
 * records in place and allocates zero objects.
 */
export class RetainedGroupFragment {
  private readonly _entries: RetainedFragmentEntry[] = [];
  private _contentRevision = -1;
  private _structureRevision = -1;
  private _backend: RenderBackend | null = null;
  private _hasCapture = false;

  // Grow-only record pools. Cursors reset per capture; the backing
  // records survive and are mutated in place. Each pooled group record owns
  // its own entries array, reused the same way.
  private readonly _drawPool: RetainedFragmentDraw[] = [];
  private _drawCursor = 0;
  private readonly _groupPool: RetainedFragmentGroup[] = [];
  private _groupCursor = 0;
  private readonly _barrierPool: RetainedFragmentBarrier[] = [];
  private _barrierCursor = 0;

  // Thrash suppression: a capture that is invalidated without
  // ever having been replayed was pure waste. One wasted capture is tolerated
  // (a lone mutation between replays keeps the recapture-immediately
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

  // Instruction-set tier. `_instructions` is a stable
  // per-fragment singleton (lazily created on first record arming) so
  // captured references to it — e.g. inside an OUTER group's fragment —
  // survive re-records; validity is re-checked per collect. Recordability
  // is computed lazily per capture and cached.
  private _instructions: RetainedInstructionSet | null = null;
  private _recordable = false;
  private _recordableFor: RenderBackend | null = null;

  // Lazy drawable -> captured shared-row map over EVERY draw record in the
  // fragment, nested groups included. Built on first lookup after a capture,
  // dropped on the next capture. Which of those rows a given consumer may
  // actually patch is the consumer's own eligibility question — a
  // {@link RetainedContainer} restricts itself to direct children, the
  // render-root representation does not.
  private _rowMap: Map<Drawable, RetainedFragmentDraw> | null = null;
  // The smallest nodeIndex among ALL draw records — the fragment's own
  // shared-buffer base at CAPTURE time. Local row = nodeIndex minus this.
  // Computed with the row map; -1 when there are no draws.
  private _rowMinIndex = -1;

  // Nodes whose OWN transform moved since the last collect, pushed by
  // the SceneNode seam through the enclosing group. A plain array (not a Set):
  // `length = 0` on reset retains capacity, so the add-k/reset-per-frame churn
  // cycle allocates nothing in steady state (unlike Set.clear). Dedup is O(1)
  // via a per-node epoch stamp keyed on `_dirtyRowEpoch` — a globally unique
  // value bumped on every reset, so a stale stamp never falsely dedups.
  private readonly _dirtyTransformRows: RenderNode[] = [];
  private _dirtyRowEpoch = nextDirtyRowEpoch++;

  /** Snapshot policy for nested transform groups — see {@link _snapshotInto}. */
  private _deferTransformGroups = false;

  public get hasCapture(): boolean {
    return this._hasCapture;
  }

  /**
   * The shared transform-buffer row `drawable` was captured on, or `undefined`
   * when it is not a captured draw of this fragment. Lazily builds a
   * drawable→row map over every draw record, rebuilt after each capture.
   */
  public recordedRowIndex(drawable: Drawable): number | undefined {
    return this.recordedDraw(drawable)?.nodeIndex;
  }

  /**
   * The captured draw record for `drawable`, or `undefined` when it is not a
   * captured draw of this fragment. Handed out so a transform-only reconcile can
   * refresh the record's snapshotted screen AABB in place: those bounds feed the
   * optimizer's reorder-safety overlap test on the entry-replay tier, and a moved
   * node whose record still carries its old extent could let a batch run be
   * reordered past a draw it really overlaps.
   */
  public recordedDraw(drawable: Drawable): RetainedFragmentDraw | undefined {
    this._ensureRowMap();

    return this._rowMap!.get(drawable);
  }

  /**
   * The fragment's own shared-transform-buffer base at CAPTURE time: the
   * smallest nodeIndex among ALL its draw records. A patched node's local store
   * row is `recordedRowIndex(node) - recordedRowBase()`.
   *
   * Two properties this has to get right, and both have bitten:
   *
   * - It is the CAPTURE-frame min, NOT the bundle's record-frame rebase base
   *   (`transformRowBase`). The two frames can start the fragment at different
   *   absolute rows (a sibling before it changing its row count between capture
   *   and record), and each node's local position is a property of the
   *   unchanged subtree — captured here — not of the absolute base. Using the
   *   record-frame base offsets every patch by the delta.
   * - It spans NESTED draws, not just top-level ones. The backend rebases by
   *   the minimum node index over every recorded batch, and entries carry
   *   monotonically increasing indices in collect order, so a fragment whose
   *   first child is a plain container holding a drawable starts lower than its
   *   first top-level draw. A top-level-only minimum then shifts every patch by
   *   that difference — the nested node takes the moved node's transform and
   *   the moved node freezes.
   */
  public recordedRowBase(): number {
    this._ensureRowMap();

    return this._rowMinIndex;
  }

  private _ensureRowMap(): void {
    if (this._rowMap !== null) {
      return;
    }

    const map = new Map<Drawable, RetainedFragmentDraw>();

    this._rowMinIndex = this._collectRowsInto(map, this._entries, -1);
    this._rowMap = map;
  }

  /** Fold every draw record (nested groups included) into `map`; returns the running minimum. */
  private _collectRowsInto(map: Map<Drawable, RetainedFragmentDraw>, entries: readonly RetainedFragmentEntry[], min: number): number {
    let currentMin = min;

    for (const entry of entries) {
      if (entry.kind === RenderEntryKind.Draw) {
        map.set(entry.drawable, entry);

        if (currentMin === -1 || entry.nodeIndex < currentMin) {
          currentMin = entry.nodeIndex;
        }
      } else if (entry.kind === RenderEntryKind.Group) {
        currentMin = this._collectRowsInto(map, entry.entries, currentMin);
      }
    }

    return currentMin;
  }

  /** Record that `node`'s own transform moved (from the SceneNode seam). */
  public enqueueDirtyTransformRow(node: RenderNode): void {
    // O(1) dedup: skip a repeat push in the same cycle without scanning.
    if (node._dirtyRowStamp === this._dirtyRowEpoch) {
      return;
    }

    node._dirtyRowStamp = this._dirtyRowEpoch;
    this._dirtyTransformRows.push(node);
  }

  /** `true` when at least one transform-only move is queued for this frame. */
  public hasDirtyTransformRows(): boolean {
    return this._dirtyTransformRows.length > 0;
  }

  /** The queued moved nodes (insertion order, deduped). */
  public get dirtyTransformRows(): readonly RenderNode[] {
    return this._dirtyTransformRows;
  }

  /** Drop the queue — after patching them, or after a full re-collect subsumed them. */
  public clearDirtyTransformRows(): void {
    // length = 0 retains the backing store (no realloc next frame); a fresh
    // epoch invalidates every prior dedup stamp in O(1).
    this._dirtyTransformRows.length = 0;
    this._dirtyRowEpoch = nextDirtyRowEpoch++;
  }

  /** The group's instruction set, or `null` if recording was never armed. */
  public get instructions(): RetainedInstructionSet | null {
    return this._instructions;
  }

  /** The group's instruction set, created on first record arming. */
  public instructionsForRecording(): RetainedInstructionSet {
    return (this._instructions ??= new RetainedInstructionSet());
  }

  /**
   * Whether the active capture satisfies the v1 recordability predicate
   * against `backend`'s renderer registry. Computed lazily on first
   * ask per capture (so backends without record hooks never pay the O(N)
   * walk) and cached until the next capture.
   */
  public isRecordable(backend: RenderBackend): boolean {
    if (!this._hasCapture) {
      return false;
    }

    if (this._recordableFor !== backend) {
      this._recordable = isRetainedFragmentRecordable(this._entries, backend);
      this._recordableFor = backend;
    }

    return this._recordable;
  }

  /** `true` while capture is thrash-suppressed. */
  public get captureSuppressed(): boolean {
    return this._suppressed;
  }

  /** The active capture was replayed (spliced) at least once — it earned its keep. */
  public markReplayed(): void {
    this._replayedSinceCapture = true;
  }

  /**
   * Decide, on a DIRTY build (the isClean gate already failed), whether this
   * frame's snapshot should be skipped. Mutates the suppression state
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
        // Grace: a single wasted capture recaptures immediately
        // (the expected behavior for one-shot mutations).
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
   * (deep copy in place, pooled) and key the capture. Draws copy their
   * placement/material/bounds verbatim; nested groups recurse; barrier nodes
   * are recorded as re-dispatch references only (semantics-neutral by
   * construction). Called by {@link RetainedContainer}
   * right after a full collect of its scope.
   */
  public capture(
    contentRevision: number,
    structureRevision: number,
    backend: RenderBackend,
    entries: readonly ScopeEntry[],
    deferTransformGroups = false,
  ): void {
    this._deferTransformGroups = deferTransformGroups;
    // Not clean while the snapshot is being (re)written: an exception
    // mid-snapshot must not leave a half-updated capture looking valid.
    this._hasCapture = false;
    this._drawCursor = 0;
    this._groupCursor = 0;
    this._barrierCursor = 0;
    this._entries.length = 0;
    this._rowMap = null;
    // A full (re)capture reads every child's current transform: any queued
    // transform-only moves are subsumed and must not double-patch afterwards.
    this.clearDirtyTransformRows();

    this._snapshotInto(this._entries, entries);

    this._contentRevision = contentRevision;
    this._structureRevision = structureRevision;
    this._backend = backend;
    this._hasCapture = true;
    this._replayedSinceCapture = false;
    // The subtree changed: any recorded batches and the cached recordability
    // verdict are stale. The instruction set keeps its GPU bundle (grow-only)
    // and re-records from the next clean playback.
    this._recordableFor = null;
    this._instructions?.invalidate();
  }

  public invalidate(): void {
    this._releaseDrawableRefs();
    this._hasCapture = false;
    this._entries.length = 0;
    this._rowMap = null;
    this.clearDirtyTransformRows();
    this._replayedSinceCapture = false;
    this._suppressed = false;
    this._wastedCaptures = 0;
    this._recordableFor = null;
    this._instructions?.invalidate();
  }

  /**
   * Drop the grow-only draw pool's strong references to their drawables so an
   * evicted/destroyed drawable can be garbage-collected. The pooled
   * record objects survive and their `drawable` is rewritten in place on the
   * next capture, so pool reuse is unaffected.
   */
  private _releaseDrawableRefs(): void {
    for (let index = 0; index < this._drawCursor; index++) {
      this._drawPool[index]!.drawable = undefined as unknown as Drawable;
    }
  }

  /**
   * Release the fragment's retained GPU resources along with the capture
   * (container destroy, deep-barrier branch escape).
   */
  public dispose(): void {
    this.invalidate();
    this._instructions?.dispose();
  }

  private _snapshotInto(target: RetainedFragmentEntry[], entries: readonly ScopeEntry[]): void {
    for (const entry of entries) {
      if (entry.kind === RenderEntryKind.Draw) {
        const command = entry.command;
        const record = this._acquireDraw();

        record.drawable = command.drawable;
        record.nodeIndex = command.nodeIndex;
        record.seq = command.seq;
        record.zIndex = command.zIndex;
        copyMaterialKeyInto(record.material, command.material);
        record.minX = command.minX;
        record.minY = command.minY;
        record.maxX = command.maxX;
        record.maxY = command.maxY;
        target.push(record);
      } else if (entry.kind === RenderEntryKind.Group) {
        // A snapshot that DEFERS transform groups (the automatic render-root
        // representation) records a nested boundary as a live re-dispatch
        // instead of copying its scope: the boundary owns its own retention
        // tier — capture key, recorded set, in-place transform-row patching —
        // and swallowing its entries into an outer snapshot would stop its
        // `_collectContent` from ever running again, silently disabling all of
        // it. Re-dispatch keeps `RetainedContainer` semantics byte-identical
        // and costs the outer fragment only its recordability (a re-dispatch
        // record is a barrier, and barriers cannot interleave with cached batch
        // runs) — it stays on the entry-replay tier, which is what an outer
        // scope full of nested groups would replay anyway.
        if (this._deferTransformGroups && entry.scope.transformNode !== null) {
          const deferred = this._acquireBarrier();

          deferred.seq = entry.seq;
          deferred.node = entry.scope.transformNode;
          target.push(deferred);

          continue;
        }

        const record = this._acquireGroup();

        record.seq = entry.seq;
        record.zIndex = entry.zIndex;
        record.preserveDrawOrder = entry.scope.preserveDrawOrder;
        record.transformNode = entry.scope.transformNode;
        // ?? null: hand-built test scopes may omit this field.
        record.retainedInstructions = entry.scope.retainedInstructions ?? null;
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
      nodeIndex: 0,
      seq: 0,
      zIndex: 0,
      material: { rendererId: 0, blendMode: BlendModes.Normal, textureId: -1, shaderId: -1, pipelineKey: 0, bindKey: 0, ownMaterial: false },
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
      retainedInstructions: null,
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
