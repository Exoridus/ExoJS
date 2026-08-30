import { DirtyChannel, nodeDirtyIndex } from '#core/nodeDirtyIndex';
import type { Drawable } from '#rendering/Drawable';
import { createEmptyMaterialKey } from '#rendering/material/MaterialKey';
import type { RenderBackend } from '#rendering/RenderBackend';
import type { RenderNode } from '#rendering/RenderNode';

import { CaptureThrashSuppressor, CaptureVerdict } from './CaptureThrashSuppressor';
import { RenderEntryKind } from './renderCommand';
import type { ScopeEntry } from './RenderScope';
import { isRetainedFragmentRecordable, RetainedInstructionSet } from './RetainedInstructionSet';
import { copyRetainedDrawData, type MutableRetainedDrawData, releasePooledDrawables, RetainedRecordPool } from './RetainedRecordPool';

/**
 * A captured draw: replayed verbatim with a fresh frame-local nodeIndex.
 * Fields are mutable so the fragment's grow-only record pool
 * can rewrite a record in place on recapture; structurally it still satisfies
 * the readonly {@link RetainedDrawData} contract consumers replay from.
 * @internal
 */
export interface RetainedFragmentDraw extends MutableRetainedDrawData {
  readonly kind: RenderEntryKind.Draw;
  /**
   * The shared frame-buffer transform row this draw was captured on.
   * A group-local row is `nodeIndex - bundle.transformRowBase`; the fast patch
   * maps a moved direct child back to its group-owned store row through it. The
   * capture frame and the record frame are the same unchanged subtree, so the
   * captured index equals the recorded one.
   */
  nodeIndex: number;
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
  /**
   * Pooled entry list owned by this record, rewritten in place on recapture.
   * Valid up to {@link RetainedFragmentGroup.entryCount} - the array itself may
   * still hold records a longer earlier capture left behind, which is what keeps
   * the recapture from re-growing it (see {@link RetainedGroupFragment}).
   */
  readonly entries: RetainedFragmentEntry[];
  entryCount: number;
}

/**
 * A barrier-effect node inside the fragment. NOT captured - re-dispatched
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
 * so a node's dedup stamp from any earlier cycle - this fragment's or another's
 * - can never equal a fragment's current epoch, making a false dedup (a dropped
 * move → stale render) impossible.
 */

/**
 * Whole-command-range fragment cache for one {@link RetainedContainer}.
 * Keyed on the subtree's aggregate
 * content/structure revision and the backend identity - deliberately NOT on
 * `View.updateId` (group-level culling makes the fragment view-independent;
 * this is the camera-pan win) and NOT on the container's own transform
 * (a group move only changes the group matrix).
 *
 * Snapshot records live in fragment-owned grow-only pools:
 * a steady-state recapture of a same-shaped subtree rewrites the previous
 * records in place and allocates zero objects.
 */
export class RetainedGroupFragment {
  /**
   * Snapshotted entries, valid up to {@link _entryCount}. Like every other
   * per-capture store here the array is rewritten rather than emptied: the
   * records in it are pooled and immortal either way, and emptying would hand
   * the backing store back and re-grow it on the next capture - ~33 bytes per
   * entry per capture, which is the whole cost of recapturing a scene whose
   * content changes every frame.
   */
  private readonly _entries: RetainedFragmentEntry[] = [];
  private _entryCount = 0;
  private _contentRevision = -1;
  private _structureRevision = -1;
  private _backend: RenderBackend | null = null;
  private _hasCapture = false;

  // Grow-only record pools. Rewound per capture; the backing records survive
  // and are mutated in place. Each pooled group record owns its own entries
  // array, reused the same way.
  private readonly _drawPool = new RetainedRecordPool(createFragmentDraw);
  private readonly _groupPool = new RetainedRecordPool(createFragmentGroup);
  private readonly _barrierPool = new RetainedRecordPool(createFragmentBarrier);

  // Thrash suppression. The state machine is shared with the render-root
  // representation ({@link CaptureThrashSuppressor}); what stays here is this
  // tier's KEY - the content and structure revisions, and nothing else, because
  // a group's clean-frame test spans exactly those two channels.
  private readonly _thrash = new CaptureThrashSuppressor();
  private _observedContent = -1;
  private _observedStructure = -1;

  // Instruction-set tier. `_instructions` is a stable
  // per-fragment singleton (lazily created on first record arming) so
  // captured references to it - e.g. inside an OUTER group's fragment -
  // survive re-records; validity is re-checked per collect. Recordability
  // is computed lazily per capture and cached.
  private _instructions: RetainedInstructionSet | null = null;
  private _recordable = false;
  private _recordableFor: RenderBackend | null = null;

  // Lazy drawable -> captured shared-row map over EVERY draw record in the
  // fragment, nested groups included. Built on first lookup after a capture,
  // dropped on the next capture. Which of those rows a given consumer may
  // actually patch is the consumer's own eligibility question - a
  // {@link RetainedContainer} restricts itself to direct children, the
  // render-root representation does not.
  private _rowMap: Map<Drawable, RetainedFragmentDraw> | null = null;
  // The smallest nodeIndex among ALL draw records - the fragment's own
  // shared-buffer base at CAPTURE time. Local row = nodeIndex minus this.
  // Computed with the row map; -1 when there are no draws.
  private _rowMinIndex = -1;

  // The dirty-index mark sequence this fragment's baked transform rows are
  // current as of. Everything marked up to it has either been patched in or was
  // read live by the capture that set it; a later mark is a move this fragment
  // has not accounted for yet.
  //
  // A cursor rather than a queue of its own. Holding one queue per fragment
  // meant every mutation had to be offered to every fragment above the moved
  // node, and each of them had to keep and grow an array; the index keeps one
  // entry per changed node per generation regardless of how many fragments read
  // it. Starts at -1, which no sequence reaches, so a fragment that never
  // accounted for anything is unprovable rather than silently up to date.
  private _transformCursor = -1;
  // The same for the content channel: what this fragment has accounted for of
  // the tint rows it baked. Separate from the transform cursor because the two
  // channels are settled by different frames - a product may replay a move
  // without a tint having changed, and the other way round.
  private _contentCursor = -1;

  /** Snapshot policy for nested transform groups - see {@link _snapshotInto}. */
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
   *   unchanged subtree - captured here - not of the absolute base. Using the
   *   record-frame base offsets every patch by the delta.
   * - It spans NESTED draws, not just top-level ones. The backend rebases by
   *   the minimum node index over every recorded batch, and entries carry
   *   monotonically increasing indices in collect order, so a fragment whose
   *   first child is a plain container holding a drawable starts lower than its
   *   first top-level draw. A top-level-only minimum then shifts every patch by
   *   that difference - the nested node takes the moved node's transform and
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

    this._rowMinIndex = this._collectRowsInto(map, this._entries, this._entryCount, -1);
    this._rowMap = map;
  }

  /** Fold every draw record (nested groups included) into `map`; returns the running minimum. */
  private _collectRowsInto(map: Map<Drawable, RetainedFragmentDraw>, entries: readonly RetainedFragmentEntry[], entryCount: number, min: number): number {
    let currentMin = min;

    for (let index = 0; index < entryCount; index++) {
      const entry = entries[index]!;

      if (entry.kind === RenderEntryKind.Draw) {
        map.set(entry.drawable, entry);

        if (currentMin === -1 || entry.nodeIndex < currentMin) {
          currentMin = entry.nodeIndex;
        }
      } else if (entry.kind === RenderEntryKind.Group) {
        currentMin = this._collectRowsInto(map, entry.entries, entry.entryCount, currentMin);
      }
    }

    return currentMin;
  }

  /**
   * The mark sequence this fragment's baked rows are current as of, or `-1`
   * while it has never accounted for anything. Passed to
   * {@link NodeDirtyIndex.readSince} to enumerate the moves since.
   */
  public get transformCursor(): number {
    return this._transformCursor;
  }

  /**
   * Every move marked so far is accounted for - after patching the rows, after
   * a capture read them live, or after a re-collect subsumed them.
   */
  public markTransformsSeen(): void {
    this._transformCursor = nodeDirtyIndex.sequence;
  }

  /** The mark sequence this fragment's baked tint rows are current as of. */
  public get contentCursor(): number {
    return this._contentCursor;
  }

  /** Every content-channel mark so far is accounted for - patched in, or read live. */
  public markContentSeen(): void {
    this._contentCursor = nodeDirtyIndex.sequence;
  }

  /**
   * Whether a move this fragment has not accounted for has been marked since.
   * `false` also when the index no longer covers the cursor, in which case the
   * caller must treat the channel as unproven rather than as quiet.
   */
  public hasUnseenTransformMarks(): boolean {
    return nodeDirtyIndex.hasMarksSince(this._transformCursor, DirtyChannel.Transform);
  }

  /** Whether the index still covers everything since this fragment's cursor. */
  public get transformMarksProvable(): boolean {
    return nodeDirtyIndex.covers(this._transformCursor);
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
      this._recordable = isRetainedFragmentRecordable(this._entries, this._entryCount, backend);
      this._recordableFor = backend;
    }

    return this._recordable;
  }

  /** `true` while capture is thrash-suppressed. */
  public get captureSuppressed(): boolean {
    return this._thrash.suppressed;
  }

  /** The active capture was replayed (spliced) at least once - it earned its keep. */
  public markReplayed(): void {
    this._thrash.markReplayed();
  }

  /**
   * Decide, on a DIRTY build (the isClean gate already failed), whether this
   * frame's snapshot should be skipped. Mutates the suppression state
   * machine; call exactly once per dirty build, before collecting. Returns
   * `true` to skip the capture.
   */
  public shouldSuppressCapture(contentRevision: number, structureRevision: number): boolean {
    const verdict = this._thrash.evaluate(this._hasCapture, this._observedContent === contentRevision && this._observedStructure === structureRevision);

    if (verdict === CaptureVerdict.Capture) {
      return false;
    }

    if (verdict === CaptureVerdict.InvalidateAndSuppress) {
      this.invalidate();
      this._thrash.suppress();
    }

    this._observedContent = contentRevision;
    this._observedStructure = structureRevision;

    return true;
  }

  /**
   * The captured entries. Valid up to {@link entryCount} - reading past it walks
   * records an earlier, longer capture left in the array.
   */
  public get entries(): readonly RetainedFragmentEntry[] {
    return this._entries;
  }

  /** How many of {@link entries} belong to the current capture. */
  public get entryCount(): number {
    return this._entryCount;
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
   *
   * `entryCount` is how many of `entries` belong to this capture. It defaults to
   * the array's own length, which is right for every exact array; a caller
   * handing over a STILL-OPEN builder scope must pass the scope's entry count
   * instead, because that array can run past what the collect filled (see
   * `RenderPlanBuilder._peekCurrentScopeEntries`).
   */
  public capture(
    contentRevision: number,
    structureRevision: number,
    backend: RenderBackend,
    entries: readonly ScopeEntry[],
    entryCount = entries.length,
    deferTransformGroups = false,
  ): void {
    this._deferTransformGroups = deferTransformGroups;
    // Not clean while the snapshot is being (re)written: an exception
    // mid-snapshot must not leave a half-updated capture looking valid.
    this._hasCapture = false;
    this._drawPool.rewind();
    this._groupPool.rewind();
    this._barrierPool.rewind();
    this._rowMap = null;
    // A full (re)capture reads every child's current transform: any queued
    // transform-only moves are subsumed and must not double-patch afterwards.
    this.markTransformsSeen();
    this.markContentSeen();

    this._entryCount = this._snapshotInto(this._entries, entries, entryCount);

    this._contentRevision = contentRevision;
    this._structureRevision = structureRevision;
    this._backend = backend;
    this._hasCapture = true;
    this._thrash.markCaptured();
    // The subtree changed: any recorded batches and the cached recordability
    // verdict are stale. The instruction set keeps its GPU bundle (grow-only)
    // and re-records from the next clean playback.
    this._recordableFor = null;
    this._instructions?.invalidate();
  }

  public invalidate(): void {
    releasePooledDrawables(this._drawPool);
    this._hasCapture = false;
    this._entries.length = 0;
    this._entryCount = 0;
    this._rowMap = null;
    this.markTransformsSeen();
    this.markContentSeen();
    this._thrash.reset();
    this._recordableFor = null;
    this._instructions?.invalidate();
  }

  /**
   * Release the fragment's retained GPU resources along with the capture
   * (container destroy, deep-barrier branch escape).
   */
  public dispose(): void {
    this.invalidate();
    this._instructions?.dispose();
  }

  /** Copy `entryCount` scope entries into `target`, reusing its slots; returns how many it wrote. */
  private _snapshotInto(target: RetainedFragmentEntry[], entries: readonly ScopeEntry[], entryCount: number): number {
    let used = 0;

    for (let index = 0; index < entryCount; index++) {
      const entry = entries[index]!;

      if (entry.kind === RenderEntryKind.Draw) {
        const command = entry.command;
        const record = this._drawPool.acquire();

        copyRetainedDrawData(record, command);
        record.nodeIndex = command.nodeIndex;
        used = appendRecord(target, used, record);
      } else if (entry.kind === RenderEntryKind.Group) {
        // A snapshot that DEFERS transform groups (the automatic render-root
        // representation) records a nested boundary as a live re-dispatch
        // instead of copying its scope: the boundary owns its own retention
        // tier - capture key, recorded set, in-place transform-row patching -
        // and swallowing its entries into an outer snapshot would stop its
        // `_collectContent` from ever running again, silently disabling all of
        // it. Re-dispatch keeps `RetainedContainer` semantics byte-identical
        // and costs the outer fragment only its recordability (a re-dispatch
        // record is a barrier, and barriers cannot interleave with cached batch
        // runs) - it stays on the entry-replay tier, which is what an outer
        // scope full of nested groups would replay anyway.
        if (this._deferTransformGroups && entry.scope.transformNode !== null) {
          const deferred = this._barrierPool.acquire();

          deferred.seq = entry.seq;
          deferred.node = entry.scope.transformNode;
          used = appendRecord(target, used, deferred);

          continue;
        }

        const record = this._groupPool.acquire();

        record.seq = entry.seq;
        record.zIndex = entry.zIndex;
        record.preserveDrawOrder = entry.scope.preserveDrawOrder;
        record.transformNode = entry.scope.transformNode;
        // ?? null: hand-built test scopes may omit this field.
        record.retainedInstructions = entry.scope.retainedInstructions ?? null;
        record.entryCount = this._snapshotInto(record.entries, entry.scope.entries, entry.scope.entries.length);
        used = appendRecord(target, used, record);
      } else {
        const record = this._barrierPool.acquire();

        record.seq = entry.seq;
        record.node = entry.scope.node;
        used = appendRecord(target, used, record);
      }
    }

    return used;
  }
}

// Record factories, one per pool. Written out field by field at a single site
// each - see the hidden-class note on `RetainedRecordPool`.

const createFragmentDraw = (): RetainedFragmentDraw => ({
  kind: RenderEntryKind.Draw,
  drawable: undefined as unknown as Drawable,
  nodeIndex: 0,
  seq: 0,
  zIndex: 0,
  material: createEmptyMaterialKey(),
  minX: 0,
  minY: 0,
  maxX: 0,
  maxY: 0,
});

const createFragmentGroup = (): RetainedFragmentGroup => ({
  kind: RenderEntryKind.Group,
  seq: 0,
  zIndex: 0,
  preserveDrawOrder: false,
  transformNode: null,
  retainedInstructions: null,
  entries: [],
  entryCount: 0,
});

/** Write `record` at `used` in a snapshot array, reusing the slot when it exists. */
const appendRecord = (target: RetainedFragmentEntry[], used: number, record: RetainedFragmentEntry): number => {
  if (used < target.length) {
    target[used] = record;
  } else {
    target.push(record);
  }

  return used + 1;
};

const createFragmentBarrier = (): RetainedFragmentBarrier => ({
  kind: RenderEntryKind.Barrier,
  seq: 0,
  node: undefined as unknown as RenderNode,
});
