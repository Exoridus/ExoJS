import type { Mutable } from '#core/types';
import { type ReadonlyRectangle, Rectangle } from '#math/Rectangle';
import type { Drawable } from '#rendering/Drawable';
import type { Filter } from '#rendering/filters/Filter';
import type { Geometry } from '#rendering/geometry/Geometry';
import type { RenderBackend } from '#rendering/RenderBackend';
import type { RenderNode } from '#rendering/RenderNode';
import { BlendModes, isAdvancedBlendMode } from '#rendering/types';
import type { View } from '#rendering/View';

import type { DerivedRootProduct } from './DerivedRootProduct';
import { type EntryPlacementState, reserveEntryPlacement } from './EntryPlacement';
import type { PersistentSlotBackend } from './PersistentSlotDraw';
import { type DrawCommand, materialKeyForcesFlush, RenderEntryKind } from './RenderCommand';
import { MutableRenderPlan, type RenderPlan } from './RenderPlan';
import type { RenderRootSource } from './RenderRootSource';
import {
  type BarrierScope,
  type BarrierScopeEntry,
  ClipKind,
  type DrawScopeEntry,
  type EffectDescriptor,
  type GroupScope,
  type GroupScopeEntry,
  type ScopeEntry,
} from './RenderScope';
import { createSourceScope, LiveEntryReason, type SourceGroup, type SourceOther, type SourceScope } from './RenderSourceItem';
import type { RetainedFragmentEntry, RetainedFragmentGroup, RetainedGroupFragment } from './RetainedGroupFragment';
import type { RetainedInstructionSet } from './RetainedInstructionSet';
import type { RetainedDrawData } from './RetainedRecordPool';
import type { RetainedRootRepresentation } from './RetainedRootRepresentation';

/**
 * Collect-time view of the backend's retained-batch hooks.
 * `_replayRetainedBatch` gates the splice tier, the capture pair gates record
 * arming, and `_validateRetainedInstructionSet` is the backend's optional
 * extra collect-time validation (e.g. WebGPU texture-view identity) on
 * top of the plan-level generation check.
 *
 * `_validateRetainedInstructionSet` failure contract — the backend chooses
 * between two sanctioned failure modes. Either way the splice is refused and
 * the frame takes the (correct) entry-replay tier; what differs is whether
 * the player re-records, and that is governed solely by the PLAN-level key
 * (`set.isValidFor`, the record-once guard):
 *
 * - **Drop & re-record (same frame):** call `set.invalidate()` AND return
 *   `false`. The plan-level key stops validating, so this same clean frame
 *   entry-replays, re-arms recording, and the player re-records — one frame,
 *   no tier loss. Use when the recording merely went stale against live GPU
 *   state (WebGPU does this on texture-view recreate/resize).
 * - **Persistent veto (no re-record):** return `false` WITHOUT invalidating.
 *   While the set still validates plan-level (committed recording, matching
 *   generations), the record-once guard keeps skipping re-capture — the
 *   group stays on entry replay every frame without record churn. Use for
 *   sets that would fail again identically (WebGPU's rejected/poisoned
 *   sets: re-recording would just re-poison).
 */
interface RetainedBackendHooks {
  _beginRetainedCapture?(set: RetainedInstructionSet): void;
  _endRetainedCapture?(set: RetainedInstructionSet): void;
  _replayRetainedBatch?(batch: unknown): void;
  _validateRetainedInstructionSet?(set: RetainedInstructionSet): boolean;
}

/**
 * How far a capturing collect's cull rect reaches beyond the view, per side, as
 * a fraction of that view axis. Each axis therefore grows by twice this, and the
 * camera may travel that fraction of an axis before the captured product
 * expires.
 *
 * A start value, not a tuned one: the trade is band area (nodes captured once,
 * then replayed for free) against re-collect frequency (which falls roughly
 * linearly with margin / camera speed). The `scrolling-world` benchmark
 * archetype exists to sweep it.
 */
const RETAINED_CULL_MARGIN_RATIO = 1 / 16;

interface MutableGroupScope extends GroupScope, EntryPlacementState {
  /**
   * How many of {@link GroupScope.entries} this collect has filled. Live only
   * while the scope is on the stack: {@link RenderPlanBuilder._popScope} trims
   * the array to it, so every consumer downstream of the collect still reads a
   * scope whose physical length IS its entry count.
   *
   * The indirection exists because the alternative — emptying the array at
   * acquire and pushing back into it — hands the backing store to the GC once
   * per scope per frame and re-grows it through the whole doubling sequence on
   * the refill, at ~27 bytes per entry per frame (28.6 KB/frame on a
   * 1000-entry fragment replay). Overwriting the slots the scope already owns
   * costs nothing in steady state.
   */
  entryCount: number;
  /**
   * First-draw material of this scope, the `hasMixedPipeline` counterpart of
   * {@link MutableGroupScope.firstZ}. `firstPipelineKey === null` means "no draw
   * seen yet"; `firstBindKey`/`firstOwnMaterial` are only meaningful once it is
   * set. Held as primitives rather than as the {@link MaterialKey} object,
   * because that object is pooled and reused.
   */
  firstPipelineKey: number | null;
  firstBindKey: number;
  firstOwnMaterial: boolean;
}

/** What one frame selects from: the scopes, the source, and this view's membership. */
interface SourceSelection {
  readonly rootScope: SourceScope;
  readonly source: RenderRootSource;
  readonly product: DerivedRootProduct;
}

/**
 * Effect-less descriptor shared by every sub-branch escape barrier:
 * all effect stages are disabled, so {@link RenderEffectExecutor.play} is a
 * pure passthrough into the child plan. The barrier entry exists only for its
 * playback semantics — the group uniform is suspended (the branch collected
 * world-space transforms) and fragment capture records a live re-dispatch.
 */
/** Placeholder for a pooled descriptor's `filters` before its first fill. */
const emptyFilters: readonly Filter[] = Object.freeze([]);

const groupEscapeEffect: EffectDescriptor = Object.freeze({
  filters: emptyFilters,
  clip: ClipKind.None,
  clipShape: null,
  maskSource: null,
  cacheAsBitmap: false,
  blendMode: BlendModes.Normal,
  needsBackdropBlend: false,
});

/**
 * Append `entry` at the scope's logical end, reusing the slot the previous
 * collect left there when the array is already that long. See
 * {@link MutableGroupScope.entryCount} for why the array is not emptied and
 * re-pushed instead.
 */
const appendScopeEntry = (scope: MutableGroupScope, entry: ScopeEntry): void => {
  const index = scope.entryCount++;

  if (index < scope.entries.length) {
    scope.entries[index] = entry;
  } else {
    scope.entries.push(entry);
  }
};

/** @internal */
export class RenderPlanBuilder {
  /**
   * Free list of released builders, held with an explicit logical length: the
   * acquire/release pair runs once per `render()` call, and draining the array
   * physically would hand its backing store back and re-grow it on the very
   * next release.
   */
  private static readonly _available: RenderPlanBuilder[] = [];
  private static _availableCount = 0;

  /**
   * Whether this builder is checked out. A flag rather than an `_active` list:
   * the list was never read except to answer this one question, and answering it
   * per builder costs nothing to maintain.
   */
  private _checkedOut = false;

  public static acquire(): RenderPlanBuilder {
    const builder = RenderPlanBuilder._availableCount > 0 ? RenderPlanBuilder._available[--RenderPlanBuilder._availableCount]! : new RenderPlanBuilder();

    builder._checkedOut = true;

    return builder;
  }

  public static release(builder: RenderPlanBuilder): void {
    if (!builder._checkedOut) {
      return;
    }

    builder._checkedOut = false;
    builder._resetRuntimeState();

    const index = RenderPlanBuilder._availableCount++;

    if (index < RenderPlanBuilder._available.length) {
      RenderPlanBuilder._available[index] = builder;
    } else {
      RenderPlanBuilder._available.push(builder);
    }
  }

  public backend!: RenderBackend;
  private _view: View | null = null;

  private readonly _plan = new MutableRenderPlan();
  private readonly _groupPool: MutableGroupScope[] = [];
  /**
   * Open scopes, innermost last, with {@link _scopeDepth} as the cursor. Held
   * that way rather than push/pop-drained for the same reason as every other
   * per-frame store here: the array outlives the frame and its slots are
   * overwritten, so no frame pays to re-grow it.
   */
  private readonly _scopeStack: MutableGroupScope[] = [];
  private _scopeDepth = 0;
  private _groupPoolCursor = 0;

  // Frame-persistent free-lists. Each lives on the builder INSTANCE
  // (never module-global) to keep the multi-instance invariant: a second app /
  // backend uses its own builder and its own pools. Cursors reset every frame in
  // build() + _resetRuntimeState(); the backing objects survive and are mutated
  // in place, so a steady-state static scene allocates zero plan objects.
  private readonly _commandPool: DrawCommand[] = [];
  private _commandPoolCursor = 0;
  private readonly _drawEntryPool: DrawScopeEntry[] = [];
  private _drawEntryPoolCursor = 0;
  private readonly _groupEntryPool: GroupScopeEntry[] = [];
  private _groupEntryPoolCursor = 0;
  private readonly _barrierEntryPool: BarrierScopeEntry[] = [];
  private _barrierEntryPoolCursor = 0;
  // The barrier ENTRY was pooled; the scope and effect descriptor it points at
  // were not, so every barrier still built two fresh objects per frame — on a
  // path a static scene re-walks unchanged, because a barrier node never
  // reaches the retained tier. Same cursor discipline as the pools above: reset
  // per build, reused across frames, so a settled scene allocates none of them.
  private readonly _barrierScopePool: Array<Mutable<BarrierScope>> = [];
  private _barrierScopePoolCursor = 0;
  private readonly _effectDescriptorPool: Array<Mutable<EffectDescriptor>> = [];
  private _effectDescriptorPoolCursor = 0;

  // Reserved placement (replaces the per-call `{ seq, zIndex }` literal).
  private _reservedSeq = 0;
  private _reservedZ = 0;

  // Placement inherited by emitDraw from a drawable emitNode (replaces the
  // `_pendingEntryPlacement` object); `_hasPending` distinguishes "no pending".
  private _hasPending = false;
  private _pendingSeq = 0;
  private _pendingZ = 0;

  private _nodeIndex = 0;

  // Count of transform-group boundaries currently being
  // collected below. See `_isViewCullSuppressed`.
  private _viewCullSuppression = 0;

  /**
   * Scope stack of the source-collection walk, or empty when not collecting a
   * source. Non-empty means this build is DISCOVERING a render root's persistent
   * items rather than producing a frame.
   *
   * That walk must not pay the frame path: no pooled `DrawCommand`, no
   * frame-global `nodeIndex`, no transform-buffer row and no backend-bound
   * material key for a node that is only being discovered. It covers the whole
   * subtree — a million nodes where three quarters are off-screen — so taking
   * the normal `emitDraw` path would allocate roughly 48MB of transform rows in
   * a grow-only buffer for draws that never happen.
   */
  private readonly _sourceStack: SourceScope[] = [];
  /**
   * The producer whose collect is currently running during source discovery.
   *
   * A view read attributes to THIS node rather than to the root, so one
   * view-dependent parallax layer becomes one {@link LiveEntry} instead of
   * forcing every sibling off the persistent path — the segment granularity
   * contract 10 of the architecture freeze asks for.
   */
  private _sourceProducer: RenderNode | null = null;
  /** Producers observed reading the view during the current source walk. */
  private readonly _sourceViewReaders = new Set<RenderNode>();

  /**
   * The node this build treats as the retained render root, or `null` when the
   * root is not eligible. Compared by identity in {@link emitNode}, so the
   * automatic representation attaches to the root's OWN group scope — the one
   * that holds its whole subtree — and to nothing else.
   */
  private _retentionRoot: RenderNode | null = null;
  /**
   * The representation currently accumulating its view-selection facts, or
   * `null` when this frame will not capture (clean replay, or suppressed).
   * Gating the accumulation on an actual capture keeps the per-node cull hooks
   * at one null check on every other frame.
   */
  private _trackedRoot: RetainedRootRepresentation | null = null;
  /**
   * The INFLATED rect a capturing collect culls against (see
   * {@link RETAINED_CULL_MARGIN_RATIO}), live only while {@link _trackedRoot} is
   * set. Off a capture, {@link cullRect} falls back to the view's own rect, so a
   * frame that will not be retained culls exactly as tightly as it always has.
   */
  private readonly _captureCullRect = new Rectangle();
  private _captureCullActive = false;

  /**
   * The rect the view test compares against for this collect: the view's own
   * bounds normally, the capture's inflated rect while a render root is being
   * captured.
   * @internal
   */
  public get cullRect(): Rectangle {
    return this._captureCullActive ? this._captureCullRect : this._viewUnobserved().getBounds();
  }

  public build(root: RenderNode, backend: RenderBackend): RenderPlan {
    this.backend = backend;
    this._view = null;
    this._plan.reset();
    this._groupPoolCursor = 0;
    this._drawEntryPoolCursor = 0;
    this._groupEntryPoolCursor = 0;
    this._barrierEntryPoolCursor = 0;
    this._barrierScopePoolCursor = 0;
    this._effectDescriptorPoolCursor = 0;
    this._drainScopeStack();
    this._hasPending = false;
    this._viewCullSuppression = 0;
    this._retentionRoot = root._supportsRootRetention() ? root : null;
    this._trackedRoot = null;
    this._captureCullActive = false;
    // Base this plan's node indices after whatever earlier render() calls already
    // wrote into the frame-scoped transform buffer, so every draw across all
    // render() calls in the frame references a distinct slot and can batch.
    const frameBase = (backend as { transformBufferCount?: number }).transformBufferCount ?? 0;
    this._nodeIndex = frameBase;
    // The draw-command pool must be frame-global too — not reset to 0 per plan.
    // A drawable's renderer may DEFER its draw across render() calls (cross-call
    // batching) while holding a reference to its pooled DrawCommand until the
    // frame-end flush. Resetting the command cursor to 0 every plan recycles
    // command objects between render() calls, so a later call's build() would
    // overwrite an earlier deferred draw's nodeIndex/groupIndex/material and the
    // deferred draw would read the wrong transform+tint slot (all draws collapse
    // onto the last command's values). Basing the command cursor at the same
    // frame-global slot as the node index keeps each frame's commands distinct
    // and alive until flush; the cursor resets naturally when frameBase returns
    // to 0 at the next frame's resetStats().
    this._commandPoolCursor = frameBase;

    const rootScope = this._acquireGroupScope(false);

    this._pushScope(rootScope);
    root._collect(this);
    this._popScope();

    this._plan.setSinglePass(rootScope.entries.length > 0 ? this._viewUnobserved() : null, rootScope);

    this._plan.nodeCount = this._nodeIndex - frameBase;

    return this._plan;
  }

  public get view(): View {
    // A collect that reads the view produces view-DEPENDENT content, and the
    // capture running around it must then not be replayed under a different
    // view. `ImageLayerNode` and `TileLayerNode` do exactly this (both read
    // `view.center` to place repeat coverage, and both opt out of view culling
    // so no cull rect records the dependency for them), and contract 9 of the
    // architecture freeze reserves the right for any node. Noting the read here
    // rather than asking nodes to declare a flag covers third-party nodes too,
    // and costs one null check on a path that already resolves a getter.
    //
    // Builder-internal reads go through `_viewUnobserved` so the machinery that
    // sets a capture up — the cull-rect inflation, the plan's own view field —
    // cannot mark every capture as view-dependent.
    this._trackedRoot?.noteViewRead();

    if (this._sourceProducer !== null) {
      // Local attribution: only the producer in flight is view-dependent. The
      // root-wide flag above answers a different, binary question (may this
      // capture replay under a moved view); this one decides which single entry
      // stops being persistent.
      this._sourceViewReaders.add(this._sourceProducer);
    }

    return this._viewUnobserved();
  }

  /**
   * The view's identity for CACHE KEYS, without recording a view dependency.
   *
   * Keying a cache on the view and deriving content from the view are different
   * things, and only the second one makes a capture unreplayable under a moved
   * camera. `Container._collectContent` does the first — it keys its retained
   * child slots on `updateId` — and must not be mistaken for the second, or
   * every capture would be view-locked and root retention would be dead for
   * every scene.
   */
  public get viewUpdateId(): number {
    return this._viewUnobserved().updateId;
  }

  /** The view without recording a dependency — builder-internal reads only. */
  private _viewUnobserved(): View {
    if (this._view === null) {
      this._view = this.backend.view;
    }

    return this._view;
  }

  public emitNode(node: RenderNode, seq?: number): void {
    this._reserveEntryPlacement(seq, node.zIndex);
    const reservedSeq = this._reservedSeq;
    const reservedZ = this._reservedZ;

    if (this._sourceStack.length > 0) {
      this._collectSourceNode(node, reservedSeq, reservedZ);

      return;
    }

    if (node._renderPlanHasBarrierEffects()) {
      const effect = this._createEffectDescriptor(node);
      const hasAlphaMask = effect.maskSource !== null && !(effect.maskSource instanceof Rectangle);
      const needsBounds = effect.cacheAsBitmap || effect.filters.length > 0 || hasAlphaMask || (effect.needsBackdropBlend ?? false);
      let left = 0;
      let top = 0;
      let width = 0;
      let height = 0;

      if (needsBounds) {
        const bounds = node.getBounds();

        if (bounds.width <= 0 || bounds.height <= 0) {
          return;
        }

        left = Math.floor(bounds.left);
        top = Math.floor(bounds.top);
        width = Math.max(1, Math.ceil(bounds.width));
        height = Math.max(1, Math.ceil(bounds.height));
      }

      const childPlan =
        effect.cacheAsBitmap && node._renderPlanCanReuseBitmapCache(left, top, width, height)
          ? null
          : this._acquireGroupScope(this._resolvePreserveDrawOrder(node));
      const barrierScope = this._acquireBarrierScope(node, effect, childPlan, left, top, width, height);

      this._pushBarrierEntry(reservedSeq, reservedZ, barrierScope);

      if (childPlan !== null) {
        this._pushScope(childPlan);

        try {
          node._collectForRenderPlan(this);
        } finally {
          this._popScope();
        }
      }

      return;
    }

    // Sub-branch escape: a DIRECT child of the engaged transform-
    // group boundary being collected (the scope guard keeps this off every
    // other emit) whose subtree contains a deep barrier leaves the group,
    // while its siblings keep retention + the group transform. Wrap it in an
    // effect-less barrier entry — playback suspends the group uniform (the
    // branch resolves world-space transforms via the matching
    // `_escapesTransformGroup` seam) and fragment capture records a live
    // re-dispatch — then re-enter emitNode inside the child plan,
    // where the guard no longer matches and the node collects through its
    // normal path (a nested boundary still gets its own transformNode scope).
    if (node.parent !== null && this._currentScope().transformNode === node.parent && node.parent._childEscapesTransformGroup(node)) {
      const childPlan = this._acquireGroupScope(this._resolvePreserveDrawOrder(node));
      const barrierScope = this._acquireBarrierScope(node, groupEscapeEffect, childPlan, 0, 0, 0, 0);

      this._pushBarrierEntry(reservedSeq, reservedZ, barrierScope);
      this._pushScope(childPlan);

      try {
        this.emitNode(node, seq);
      } finally {
        this._popScope();
      }

      return;
    }

    if (node._isDrawableForRenderPlan()) {
      this._hasPending = true;
      this._pendingSeq = reservedSeq;
      this._pendingZ = reservedZ;

      try {
        node._collectForRenderPlan(this);
      } finally {
        this._hasPending = false;
      }

      return;
    }

    const groupScope = this._acquireGroupScope(this._resolvePreserveDrawOrder(node));

    groupScope.transformNode = node._isTransformGroupBoundary ? node : null;

    this._pushGroupEntry(reservedSeq, reservedZ, groupScope);

    this._pushScope(groupScope);

    try {
      if (node === this._retentionRoot) {
        this._collectRetainedRoot(node);
      } else {
        node._collectForRenderPlan(this);
      }
    } finally {
      this._popScope();
    }
  }

  /**
   * Discovery counterpart of {@link emitNode}: decide what this producer
   * contributes to the persistent source, and never build any frame-local
   * product on the way.
   *
   * Three producers are refused outright, each because the source would
   * otherwise have to re-implement semantics that already have exactly one
   * owner:
   *
   * - **Barrier / effect nodes.** Filters, masks, `cacheAsBitmap`, clipping and
   *   backdrop blending live in the barrier entry and the effect executor. The
   *   retained fragment already stores such a node as a live re-dispatch, and
   *   the source does the same rather than growing a second copy of it.
   * - **Transform-group boundaries.** A `RetainedContainer` owns its own group
   *   matrix, group-level culling, branch-escape rule, capture key and
   *   transform-row patching. Descending into one would flatten all of that
   *   into the outer source and stop its `_collectContent` from ever running
   *   again — which is why the discovery walk needs no copy of
   *   `_childEscapesTransformGroup`: it never gets below a boundary, so no
   *   discovered node ever has an engaged boundary as its parent.
   * - **View-dependent producers**, resolved after the fact in
   *   {@link _resolveViewAttribution}.
   *
   * In every case the producer becomes one {@link LiveEntry} at its exact
   * placement and the walk stops there.
   */
  private _collectSourceNode(node: RenderNode, seq: number, zIndex: number): void {
    const scope = this._sourceStack[this._sourceStack.length - 1]!;

    if (node._renderPlanHasBarrierEffects()) {
      scope.others.push({ kind: RenderEntryKind.Barrier, seq, node, reason: LiveEntryReason.Barrier, itemMark: scope.items.count });

      return;
    }

    if (node._isTransformGroupBoundary) {
      scope.others.push({ kind: RenderEntryKind.Barrier, seq, node, reason: LiveEntryReason.Boundary, itemMark: scope.items.count });

      return;
    }

    if (node._isDrawableForRenderPlan()) {
      this._collectSourceDrawable(node, scope, seq, zIndex);

      return;
    }

    this._collectSourceGroup(node, scope, seq, zIndex);
  }

  /**
   * A drawable producer: run its collect with itself as the attribution context
   * so the 0..n items it emits are its own.
   *
   * The producer context matters here and not only on containers: a drawable is
   * free to read the view too, and without a context in flight its items would
   * be persisted while its output is a function of the camera.
   */
  private _collectSourceDrawable(node: RenderNode, scope: SourceScope, seq: number, zIndex: number): void {
    const mark = scope.items.count;
    const otherMark = scope.others.length;
    const previousProducer = this._sourceProducer;

    this._sourceProducer = node;
    this._hasPending = true;
    this._pendingSeq = seq;
    this._pendingZ = zIndex;

    try {
      node._collectForRenderPlan(this);
    } finally {
      this._hasPending = false;
      this._sourceProducer = previousProducer;
    }

    this._resolveViewAttribution(node, scope, mark, otherMark, seq);
  }

  /** A grouping producer: mirror its scope into the source and descend. */
  private _collectSourceGroup(node: RenderNode, scope: SourceScope, seq: number, zIndex: number): void {
    const mark = scope.items.count;
    const otherMark = scope.others.length;
    const group: SourceGroup = {
      ...createSourceScope(),
      kind: RenderEntryKind.Group,
      seq,
      zIndex,
      preserveDrawOrder: this._resolvePreserveDrawOrder(node),
      node,
      itemMark: mark,
    };

    scope.others.push(group);
    this._sourceStack.push(group);

    const previousProducer = this._sourceProducer;

    this._sourceProducer = node;

    try {
      node._collectForRenderPlan(this);
    } finally {
      this._sourceProducer = previousProducer;
      this._sourceStack.pop();
    }

    this._resolveViewAttribution(node, scope, mark, otherMark, seq);
  }

  /**
   * Collapse a producer that read the view into a single live re-dispatch.
   *
   * Resolved after its collect rather than before, because the read is OBSERVED
   * — there is no flag to ask for up front, which is what lets a third-party
   * node be covered without declaring anything (contract 9 of the architecture
   * freeze). Everything the producer contributed is dropped back to `mark` and
   * replaced by one entry at the same placement, so the segment stays exactly as
   * wide as the producer and its ordering is unchanged.
   *
   * `mark`, not "the last entry": a drawable producer may have emitted several
   * items, and a nested producer that read the view has already collapsed
   * itself, so this only ever fires for the OUTERMOST reader of a chain.
   */
  private _resolveViewAttribution(node: RenderNode, scope: SourceScope, mark: number, otherMark: number, seq: number): void {
    if (!this._sourceViewReaders.has(node)) {
      return;
    }

    scope.items.truncate(mark);
    scope.others.length = otherMark;
    scope.others.push({ kind: RenderEntryKind.Barrier, seq, node, reason: LiveEntryReason.ViewDependent, itemMark: mark });
  }

  /**
   * Walk `node`'s whole subtree once and return its persistent source entries,
   * or `null` when the ROOT producer itself read the view.
   *
   * The walk is culling-free by construction ({@link _isViewCullSuppressed}):
   * an item that is off-screen now is exactly the one that must be findable when
   * it scrolls in, so a cull test here would drop precisely what the source
   * exists to remember.
   *
   * It also produces no frame-local product — no pooled `DrawCommand`, no
   * `nodeIndex`, no transform-buffer row, no backend-bound material key. At a
   * million nodes the normal `emitDraw` path would otherwise reserve roughly
   * 48MB of rows in a grow-only buffer for draws that never happen, three
   * quarters of them off-screen.
   *
   * The `null` case has no more local answer available: the root is the
   * outermost producer, so a view read attributed to it covers everything below
   * it and there is nothing left to persist.
   */
  private _discoverSource(node: RenderNode): SourceScope | null {
    const scope = createSourceScope();
    const previousTracked = this._trackedRoot;
    const previousCaptureCull = this._captureCullActive;

    // Discovery is not the capture. It culls nothing and produces no records, so
    // every kept/culled fact and every view read it could report would describe
    // a collect the capture never performed.
    this._trackedRoot = null;
    this._captureCullActive = false;
    this._sourceViewReaders.clear();
    this._sourceStack.push(scope);
    this._sourceProducer = node;

    try {
      node._collectForRenderPlan(this);
    } finally {
      this._sourceProducer = null;
      this._sourceStack.pop();
      this._trackedRoot = previousTracked;
      this._captureCullActive = previousCaptureCull;
    }

    return this._sourceViewReaders.has(node) ? null : scope;
  }

  /**
   * Materialise a stored selection into the CURRENT frame's plan: the other
   * entrance to the same renderer, not a second one.
   *
   * Every entry lands in the existing `GroupScope` with its stored `(zIndex,
   * seq)`, so the existing optimizer sorts it, the existing player plays it and
   * the existing backend batches it. What the source saves is everything ahead
   * of that: the scene-graph walk, the transform derivation and the material
   * resolve for items the rect rejects.
   */
  private _emitSourceSelection(scope: SourceScope, selection: SourceSelection, rect: ReadonlyRectangle): void {
    const bits = selection.product.selectScope(scope, rect, selection.source.visibility);
    const items = scope.items;
    const others = scope.others;
    const count = items.count;
    const otherCount = others.length;
    const seq = items.seq;
    const zIndex = items.zIndex;
    const drawables = items.drawables;
    const minX = items.minX;
    const minY = items.minY;
    const maxX = items.maxX;
    const maxY = items.maxY;
    const words = bits.words;
    const wordCount = bits.wordCount;
    let other = 0;
    let selected = 0;

    // Walk the ADMITTED items only, one set bit at a time, instead of stepping
    // over every stored item and asking. A scope that holds a million items and
    // admits a quarter of them otherwise pays three quarters of its loop to
    // reject — the exact cost the spatial index was built to stop paying, still
    // being paid one layer further out. Skipping empty words makes the walk
    // O(items / 32 + admitted).
    //
    // The interleaved `others` keep their placement: each is emitted at the
    // first admitted index that reaches its mark, which is still after every
    // item stored before it (a rejected item emits nothing, so it constrains no
    // ordering) and before every item stored after it.
    for (let w = 0; w < wordCount; w++) {
      let word = words[w]!;

      if (word === 0) {
        continue;
      }

      const base = w << 5;

      while (word !== 0) {
        const lowest = word & -word;
        const i = base + (31 - Math.clz32(lowest));

        word ^= lowest;

        while (other < otherCount && others[other]!.itemMark <= i) {
          this._emitSelectedOther(others[other]!, selection, rect);
          other++;
        }

        this._emitSelectedItem(drawables[i]!, seq[i]!, zIndex[i]!, minX[i]!, minY[i]!, maxX[i]!, maxY[i]!);
        selected++;
      }
    }

    const culled = count - selected;

    while (other < otherCount) {
      this._emitSelectedOther(others[other]!, selection, rect);
      other++;
    }

    if (culled > 0) {
      // One note per scope rather than per item: `noteCulled` sets a flag, and
      // the count is a stat. Both stay exactly what a full collect reports.
      this.backend.stats.culledNodes += culled;
      this._noteViewCulled();
    }
  }

  /** A stored non-item entry: a nested group, or a live re-dispatch. */
  private _emitSelectedOther(other: SourceOther, selection: SourceSelection, rect: ReadonlyRectangle): void {
    if (other.kind === RenderEntryKind.Group) {
      this._emitSelectedGroup(other, selection, rect);

      return;
    }

    // Live re-dispatch through the ordinary collect path, at its stored
    // placement. A view-dependent producer therefore sees the CURRENT view and
    // rebuilds its coverage; a barrier or boundary keeps every bit of its own
    // semantics, including its own retention tier.
    other.node._collect(this, other.seq);
  }

  /**
   * One selected item becomes one fresh frame-local draw.
   *
   * Nothing backend- or frame-bound is taken from the item: the `nodeIndex` is
   * this frame's, the material key is resolved live (a backend switch or a tint
   * change since discovery has to win), and the bounds are read live because
   * they feed the optimizer's overlap test — a moved node whose command still
   * carried its discovery-time extent could let a batch run be reordered past a
   * draw it really overlaps.
   *
   * No `visible`/`destroyed` guard, deliberately: both flips stamp the subtree
   * structure-dirty (`SceneNode.visible`'s setter, and `destroy()` through the
   * parent's `removeChild`), and the source is keyed on the structure revision,
   * so neither can be observed here on a source that is still usable. Testing
   * them anyway would be two getter calls per item on the one path whose whole
   * purpose is to be cheap at a million.
   */
  private _emitSelectedItem(drawable: Drawable, seq: number, zIndex: number, minX: number, minY: number, maxX: number, maxY: number): void {
    reserveEntryPlacement(this._currentScope(), seq, zIndex);

    const command = this._acquireDrawCommand();

    command.drawable = drawable;
    command.nodeIndex = this._nodeIndex++;
    command.seq = seq;
    command.zIndex = zIndex;
    command.groupIndex = undefined;
    command.material = drawable._getOrComputeMaterialKey(this.backend);

    // The stored extent is the drawable's own, unchanged — the same argument
    // the query just made. Asking the node again would resolve its parent chain
    // a second time for an answer already in hand.
    command.minX = minX;
    command.minY = minY;
    command.maxX = maxX;
    command.maxY = maxY;

    this._noteSelectedItemKept(command, drawable);
    this._pushDrawEntry(seq, zIndex, command);
  }

  /**
   * Fold a selected item into the capture's kept-union, folding exactly the rect
   * the cull test compared.
   *
   * That "exactly" is the whole contract of the union — a later view containing
   * it must provably admit the same set — so a node with a `cullArea` folds its
   * `cullArea`, and every other node folds its bounds, which the command already
   * carries.
   */
  private _noteSelectedItemKept(command: DrawCommand, drawable: Drawable): void {
    const tracked = this._trackedRoot;

    if (tracked === null || !drawable.cullable) {
      return;
    }

    const area = drawable.cullArea;

    if (area !== null) {
      tracked.noteKept(area);

      return;
    }

    tracked.noteKeptCoords(command.minX, command.minY, command.maxX, command.maxY);
  }

  /**
   * A stored group, re-entered under the same subtree-level cull a full collect
   * applies before it ever reaches `emitNode`.
   *
   * That test is not an optimisation bolted on: without it the selection would
   * push an empty group entry where a full collect pushes nothing, and it is
   * what keeps the descent proportional to what is on screen instead of to
   * everything the source holds.
   */
  private _emitSelectedGroup(group: SourceGroup, selection: SourceSelection, rect: ReadonlyRectangle): void {
    const node = group.node;

    // Read live rather than from a stored group extent: a group's AABB
    // aggregates its children, so it is the one rect a `getBounds()` call still
    // has to compose even on the stored-bounds path — and there are as many
    // groups as the scene has containers, not as many as it has sprites.
    if (!node._inCullRect(rect)) {
      this.backend.stats.culledNodes++;
      this._noteViewCulled();

      return;
    }

    this._noteViewKept(node);
    reserveEntryPlacement(this._currentScope(), group.seq, group.zIndex);

    const groupScope = this._acquireGroupScope(group.preserveDrawOrder);

    this._pushGroupEntry(group.seq, group.zIndex, groupScope);
    this._pushScope(groupScope);

    try {
      this._emitSourceSelection(group, selection, rect);
    } finally {
      this._popScope();
    }
  }

  /**
   * Collect the render root through its automatic persistent representation.
   *
   * Same ladder a {@link RetainedContainer} climbs — recorded-instruction
   * splice, then entry replay, then plain collect — over a key that additionally
   * covers what a root needs and a group does not: the subtree's transform
   * revision (no group matrix, no row patch), the root's own global-transform
   * stamp (an ancestor ABOVE the root moves it without stamping its revisions),
   * the render target, and the view SELECTION. Every gate failure degrades to
   * today's behaviour, never to wrong pixels.
   *
   * Between "the product still fits" and "rebuild from the scene graph" sits the
   * selection tier. A camera step that leaves the capture's margin used to cost
   * a complete collect — walk, transform resolve, material resolve, record — for
   * a scene where nothing but the camera changed. The persistent source already
   * holds every item in the subtree, on screen or not, so such a frame becomes a
   * selection over those items instead:
   *
   * ```text
   * tier 1  view still fits the capture              -> replay
   * tier 2  source still describes the subtree       -> select from the source
   * tier 3  transform-only moves                     -> O(k) row patch
   * tier 4  content / structure / ancestry changed   -> collect the scene graph
   * ```
   *
   * Tier 2 sits BELOW the capture decision, not inside it: the source is keyed
   * on the node's own content, structure and ancestry and on nothing the capture
   * owns, so a frame that may not capture at all still gets to select. That is
   * not a detail — a root holding a view-dependent producer can never replay its
   * capture (PR #553), so its captures are always wasted and capture suppression
   * eventually turns them off for good. Keying the selection on the capture
   * would have withdrawn the source from a parallax-bearing scrolling map, which
   * is the exact scene this whole tier exists for.
   */
  private _collectRetainedRoot(node: RenderNode): void {
    const representation = node._retainedRootRepresentation();
    const view = this._viewUnobserved();
    const backend = this.backend;
    const target = backend.renderTarget;
    const contentRevision = node._contentRevision;
    const structureRevision = node._structureRevision;
    const transformRevision = node._transformRevision;

    // Resolve the parent chain BEFORE reading the stamp: `getGlobalTransform`
    // observes `parent._globalTransformVersion` lazily, so the ancestor move
    // that never touched this node's revisions only becomes visible here.
    node.getGlobalTransform();

    const ancestryStamp = node._globalTransformStamp;

    // Persistent-indexed tier, ABOVE the capture decision. A root whose source
    // the backend can serve from slot-addressed stores does not produce entries
    // at all: the frame either re-issues the order stream the last selection
    // built, or rebuilds that stream from a membership delta. Both are cheaper
    // than the capture tiers below, and neither materialises a staying item.
    if (this._collectPersistentRoot(representation, view, contentRevision, structureRevision, ancestryStamp, transformRevision)) {
      return;
    }

    // Transform is settled separately from the equality keys: a transform-only
    // descendant move patches its baked row in place instead of invalidating,
    // which is what keeps a partly-dynamic scene on the recorded tier.
    if (
      representation.isCleanIgnoringTransform(contentRevision, structureRevision, ancestryStamp, view, backend, target) &&
      representation.reconcileTransform(transformRevision, view, backend)
    ) {
      const set = representation.fragment.instructions;

      if (set !== null && this._markCurrentScopeRetained(set)) {
        representation.markReplayed();

        return;
      }

      this._replayRetainedFragment(representation.fragment.entries, representation.fragment.entryCount);
      representation.markReplayed();
      // Record-on-first-clean-frame: this clean playback is the recording
      // source, so the record cost never lands on a frame whose capture is
      // about to be invalidated.
      this._armRetainedRecord(representation.fragment);

      return;
    }

    // This frame has to produce entries one way or another. Settle the source
    // first — it is keyed on the node alone and is equally valid whether or not
    // this frame ends up capturing.
    representation.noteRebuildKeys(contentRevision, structureRevision, ancestryStamp, transformRevision);

    const selection = this._resolveSourceSelection(node, representation, contentRevision, structureRevision, ancestryStamp, transformRevision);

    if (representation.shouldSuppressCapture(contentRevision, structureRevision, transformRevision, view)) {
      // No capture this frame, but the cheap path is still the cheap path: the
      // selection culls against the view's own rect (`cullRect` off a capture)
      // and produces exactly the entries a plain collect would.
      if (selection === null) {
        node._collectForRenderPlan(this);
      } else {
        this._emitSourceSelection(selection.rootScope, selection, this.cullRect);
        selection.product.commitSelection(selection.source.scopes);
      }

      return;
    }

    const previousTracked = this._trackedRoot;

    // Exactly one node per build is the retention root (`_retentionRoot` is
    // compared by identity in `emitNode`), so the capture cull rect needs no
    // stack — it is armed here and disarmed below.
    this._inflateCaptureCullRect(view);
    representation.beginCapture(this._captureCullRect);
    this._trackedRoot = representation;

    try {
      if (selection === null) {
        node._collectForRenderPlan(this);
      } else {
        this._emitSourceSelection(selection.rootScope, selection, this._captureCullRect);
        selection.product.commitSelection(selection.source.scopes);
      }
    } finally {
      this._trackedRoot = previousTracked;
      this._captureCullActive = false;
    }

    representation.commitCapture(
      contentRevision,
      structureRevision,
      transformRevision,
      ancestryStamp,
      view,
      backend,
      target,
      this._peekCurrentScopeEntries(),
      this._peekCurrentScopeEntryCount(),
    );
  }

  /**
   * Draw one render root straight out of its persistent slot stores, or report
   * that it does not qualify.
   *
   * Two frames exist here. When the camera still lies inside the rect the last
   * selection admitted against, the answer it produced is still the right one —
   * same argument as the capture margin, one tier down — so the same order
   * stream is re-issued and the frame costs one draw call. Otherwise the
   * membership is re-queried, the delta hands slots to arrivals and takes them
   * back from departures, and only the arrivals have their per-slot data
   * written. A staying item is touched exactly once, to write its position in
   * the order stream.
   *
   * Requires a source that still describes the subtree: everything below keys on
   * the items' stored world bounds, and the source is invalidated by any content,
   * structure, ancestry or transform change. So a moved subtree does not arrive
   * here at all — it takes the transform-reconcile tier below, which stays O(k).
   */
  private _collectPersistentRoot(
    representation: RetainedRootRepresentation,
    view: View,
    contentRevision: number,
    structureRevision: number,
    ancestryStamp: number,
    transformRevision: number,
  ): boolean {
    const source = representation.source;

    if (!source?.isUsable(contentRevision, structureRevision, ancestryStamp, transformRevision)) {
      return false;
    }

    const rootScope = source.rootScope;

    if (rootScope === null) {
      return false;
    }

    const bundle = representation.persistentSlots(source, this.backend);

    if (bundle === null) {
      return false;
    }

    const product = representation.ensureDerivedProduct();

    product.slotsEnabled = true;

    const cached = representation.persistentSelectionCovers(view) ? representation.lastPersistentDraw : null;

    if (cached !== null && cached.bundle === bundle) {
      this._currentScope().persistentDraw = cached;

      return true;
    }

    if (!product.matches(source.scopes.length)) {
      product.rebind(source.scopes);
    }

    // Admit against the view grown by the same margin a capture uses, so the
    // stream this selection produces stays valid for every view still inside it.
    this._inflateCaptureCullRect(view);
    this._captureCullActive = false;

    const rect = this._captureCullRect;

    product.beginSelection();
    this._selectMembership(rootScope, product, source);
    product.commitSelection(source.scopes);

    const slots = product.slots;
    const backend = this.backend as RenderBackend & PersistentSlotBackend;

    if (slots.enteredCount > 0) {
      backend._writePersistentSlots!(bundle, source, slots.entered, slots.enteredCount);
    }

    // One note for the whole root rather than one per item: the count is exact
    // either way, and it is what proves the tier still culls.
    this.backend.stats.culledNodes += source.itemCount - product.delta.visible;
    representation.notePersistentSelection(rect);
    this._currentScope().persistentDraw = representation.persistentDrawRecord(bundle, slots.order, slots.orderCount);

    return true;
  }

  /**
   * Fill every scope's membership without emitting anything.
   *
   * The subtree cull a nested group gets on the ordinary path is deliberately
   * absent: it is an optimisation over a per-item test, and here the per-item
   * test is the spatial index, which already answers for a fully off-screen
   * group in the time it takes to reject its cells.
   */
  private _selectMembership(scope: SourceScope, product: DerivedRootProduct, source: RenderRootSource): void {
    product.selectScope(scope, this._captureCullRect, source.visibility);

    for (const other of scope.others) {
      if (other.kind === RenderEntryKind.Group) {
        this._selectMembership(other, product, source);
      }
    }
  }

  /**
   * The items this frame may select from, discovering them first if the root has
   * earned a source and does not have one yet. `null` means "collect the scene
   * graph" and is always a correct answer.
   *
   * Discovery is gated on the SECOND consecutive rebuild frame that found the
   * same content, structure and ancestry, and that gate is the whole safety
   * argument for building a source at all. A source is one O(N) walk plus one
   * item per drawable in the subtree, so a scene that alternates between a
   * content change and a camera step would otherwise pay for a source it never
   * gets to use twice. Two rebuild frames in a row over unchanged content is the
   * signature of a camera moving across a settled scene — where the source then
   * serves every frame after it — and it is a signature a changing scene cannot
   * produce.
   */
  private _resolveSourceSelection(
    node: RenderNode,
    representation: RetainedRootRepresentation,
    contentRevision: number,
    structureRevision: number,
    ancestryStamp: number,
    transformRevision: number,
  ): SourceSelection | null {
    const existing = representation.source;

    if (existing?.isUsable(contentRevision, structureRevision, ancestryStamp, transformRevision)) {
      return this._beginSelection(existing, representation.ensureDerivedProduct());
    }

    // Stale items describe a subtree that no longer exists, and world bounds
    // stored against a different ancestry are not repairable. Release them here
    // rather than leaving a million dead records reachable until the next build.
    existing?.invalidate();
    representation.derivedProduct?.release();

    if (!representation.shouldBuildSource()) {
      return null;
    }

    const discovered = this._discoverSource(node);

    if (discovered === null) {
      // The root itself is view-dependent, so nothing below it can be attributed
      // more locally and there is no persistable source. Remember that rather
      // than paying the walk again on every view change.
      representation.markSourceUnbuildable();

      return null;
    }

    const source = representation.ensureSource();
    const product = representation.ensureDerivedProduct();

    source.adopt(discovered, contentRevision, structureRevision, ancestryStamp, transformRevision);
    product.rebind(source.scopes);

    return this._beginSelection(source, product);
  }

  /** Open a selection window over `source`; every membership set starts empty. */
  private _beginSelection(source: RenderRootSource, product: DerivedRootProduct): SourceSelection | null {
    const rootScope = source.rootScope;

    if (rootScope === null) {
      return null;
    }

    if (!product.matches(source.scopes.length)) {
      product.rebind(source.scopes);
    }

    product.beginSelection();

    return { rootScope, source, product };
  }

  /**
   * Arm {@link _captureCullRect} as the view's rect grown by
   * {@link RETAINED_CULL_MARGIN_RATIO} on every side.
   *
   * The margin is what lets a capture outlive a moving camera. Culling against
   * the tight view rect makes the resulting product valid for that rect and
   * nothing else — every camera step invalidates it, which is why a scene with
   * off-screen content used to re-collect every single frame. Culling against a
   * rect that ENCLOSES the view instead makes the product valid for every view
   * still inside that rect: whatever was dropped was outside a rect containing
   * today's view, so it is still correctly not drawn, and whatever was kept but
   * has since left the view is drawn off-screen and clipped. Same pixels, one
   * O(1) rect test instead of a re-collect.
   *
   * The price is the extra nodes in the band, which are captured once and then
   * replayed for free. Growing each axis by twice the ratio, a uniformly dense
   * scene gains `(1 + 2r)^2 - 1` nodes — about 27% at the current ratio — while
   * the camera may travel a full `r` of each axis before the product expires.
   */
  private _inflateCaptureCullRect(view: View): void {
    const rect = view.getBounds();
    const marginX = rect.width * RETAINED_CULL_MARGIN_RATIO;
    const marginY = rect.height * RETAINED_CULL_MARGIN_RATIO;

    this._captureCullRect.set(rect.x - marginX, rect.y - marginY, rect.width + 2 * marginX, rect.height + 2 * marginY);
    this._captureCullActive = true;
  }

  /**
   * @internal — a node was dropped by the view test during a capturing collect.
   * The capture is then view-LOCKED: a later view could admit that node again
   * and no index exists to find it, so any view change must re-collect.
   */
  public _noteViewCulled(): void {
    this._trackedRoot?.noteCulled();
  }

  /**
   * @internal — a node passed the view test during a capturing collect. Folds
   * exactly the rect `inView` compared into the capture's kept-union, so a later
   * view that still contains the union provably admits the same set of nodes.
   * Nodes that opt out of culling never affect the selection and are skipped.
   */
  public _noteViewKept(node: RenderNode): void {
    const tracked = this._trackedRoot;

    if (tracked === null || !node.cullable) {
      return;
    }

    tracked.noteKept(node.cullArea ?? node.getBounds());
  }

  public emitDraw(drawable: Drawable, seq?: number): void {
    const hasPending = this._hasPending;
    const pendingSeq = this._pendingSeq;
    const pendingZ = this._pendingZ;

    if (hasPending) {
      this._hasPending = false;
    }

    const zIndex = hasPending ? pendingZ : drawable.zIndex;

    this._reserveEntryPlacement(seq ?? (hasPending ? pendingSeq : undefined), zIndex);

    const placementSeq = this._reservedSeq;
    const placementZ = this._reservedZ;
    const bounds = drawable.getBounds();

    if (this._sourceStack.length > 0) {
      // Discovery: record the neutral item and stop. No pooled command, no
      // nodeIndex, no transform row, no material key — the cut-1 invariant.
      // Bounds are read because they ARE the item's payload, and they are a
      // cache hit for an unmoved node.
      this._sourceStack[this._sourceStack.length - 1]!.items.push(drawable, placementSeq, placementZ, bounds.left, bounds.top, bounds.right, bounds.bottom);

      return;
    }

    const command = this._acquireDrawCommand();

    command.drawable = drawable;
    command.nodeIndex = this._nodeIndex++;
    command.seq = placementSeq;
    command.zIndex = placementZ;
    // Reset the optimizer's batch index: a recycled command must not carry a
    // stale groupIndex from a previous frame (the plan player's group-adjacency
    // walk would coalesce on it before optimize() runs).
    command.groupIndex = undefined;
    command.material = drawable._getOrComputeMaterialKey(this.backend);
    command.minX = bounds.left;
    command.minY = bounds.top;
    command.maxX = bounds.right;
    command.maxY = bounds.bottom;

    this._pushDrawEntry(placementSeq, placementZ, command);
  }

  /**
   * @internal — the entry array of the currently-active scope. Read-only peek
   * used by {@link RetainedPlanCache} to snapshot a container's direct-drawable
   * fragment right after a full (non-skipped) collect of it.
   *
   * Valid only up to {@link _peekCurrentScopeEntryCount}: while a scope is still
   * open its array may run past the entries THIS collect filled, holding
   * whatever the previous frame left in those slots (see
   * {@link MutableGroupScope.entryCount}). Reading `entries.length` here instead
   * of the count would snapshot a stale entry as if it had just been collected.
   */
  public _peekCurrentScopeEntries(): readonly ScopeEntry[] {
    return this._currentScope().entries;
  }

  /** @internal — how many entries the currently-active scope holds so far this collect. */
  public _peekCurrentScopeEntryCount(): number {
    return this._currentScope().entryCount;
  }

  /**
   * @internal — true while collecting below a transform-group boundary.
   * Inside a group, child bounds are group-local, so testing them against the
   * world-space view rect would be meaningless; the group is culled as a
   * whole by RetainedContainer._collect instead.
   */
  public get _isViewCullSuppressed(): boolean {
    // Source discovery suppresses culling too, and must: the whole point of the
    // items is to hold what is OFF screen right now, since that is exactly what
    // scrolls in later. A cull test during discovery would drop precisely the
    // nodes the source exists to remember.
    return this._viewCullSuppression > 0 || this._sourceStack.length > 0;
  }

  /** @internal — true while discovering a render root's persistent items. */
  public get _isCollectingSource(): boolean {
    return this._sourceStack.length > 0;
  }

  /** @internal — enter a transform-group subtree (see {@link _isViewCullSuppressed}). */
  public _pushViewCullSuppression(): void {
    this._viewCullSuppression++;
  }

  /** @internal — leave a transform-group subtree. */
  public _popViewCullSuppression(): void {
    this._viewCullSuppression--;
  }

  /**
   * @internal — replay a single previously-captured {@link RetainedDrawData}
   * into the current scope: reuses its cached material key and screen-space
   * bounds verbatim, only assigning a fresh frame-local `nodeIndex`. Used by
   * {@link RetainedPlanCache} for the static-subtree skip and by
   * {@link _replayRetainedFragment} for the whole-fragment splice;
   * callers must have already verified the owning container's subtree is
   * unchanged (content + structure revision, and backend all match the
   * capture — plus view for the per-child cache).
   */
  public _replayRetainedDraw(slot: RetainedDrawData): void {
    // Mirror the scope bookkeeping that `_reserveEntryPlacement` maintains on the
    // normal emit path, but HONOR the slot's verbatim seq/zIndex instead of
    // assigning a fresh seq. Skipping this leaves the active scope's placement
    // state stale, which breaks two invariants the optimizer/placement rely on:
    //   - `firstZ`/`hasMixedZ`: `RenderPlanOptimizer._optimizeGroup` gates the
    //     z-sort SOLELY on `hasMixedZ`. Replaying drawables with differing zIndex
    //     without folding them in would leave `hasMixedZ` false, skip the sort,
    //     and paint the scope in the wrong order.
    //   - `_nextSeq`: a later normally-emitted sibling (e.g. a nested Container)
    //     in the same scope must not collide with a replayed slot's seq.
    // The matching `hasMixedPipeline` fold needs no mirror here: it hangs off
    // `_pushDrawEntry` below, which this path already goes through.
    reserveEntryPlacement(this._currentScope(), slot.seq, slot.zIndex);

    const command = this._acquireDrawCommand();

    command.drawable = slot.drawable;
    command.nodeIndex = this._nodeIndex++;
    command.seq = slot.seq;
    command.zIndex = slot.zIndex;
    command.groupIndex = undefined;
    // Own-material values and texture identities are live even while the
    // fragment itself stays clean. Re-derive their key on the entry-replay
    // fallback so a structural retained invalidation cannot regroup using the
    // record-time snapshot before the replacement capture is produced.
    command.material = slot.material.ownMaterial ? slot.drawable._getOrComputeMaterialKey(this.backend) : slot.material;
    command.minX = slot.minX;
    command.minY = slot.minY;
    command.maxX = slot.maxX;
    command.maxY = slot.maxY;

    this._pushDrawEntry(slot.seq, slot.zIndex, command);
  }

  /**
   * @internal — instruction splice: when the current
   * scope belongs to a clean RetainedContainer whose fragment holds a valid
   * recorded instruction set for this backend, mark the scope and push NO
   * entries. The plan player replays the recorded batches in O(batches);
   * the optimizer sees an empty scope (O(1)). Returns `false` — caller falls
   * back to entry replay — when the backend does not implement the replay
   * hook, the set is stale (backend identity / bundle generation), or the
   * backend's own collect-time validation rejects it.
   */
  public _markCurrentScopeRetained(set: RetainedInstructionSet): boolean {
    if (!this._validateRetainedSet(set)) {
      return false;
    }

    this._currentScope().retainedInstructions = set;

    return true;
  }

  /**
   * @internal — arm instruction recording for the current scope:
   * called on a CLEAN entry-replay frame (record-on-first-clean-frame
   * policy), so the record cost is never wasted on a frame whose capture is
   * about to be invalidated. No-op when the backend lacks the capture hooks
   * (dormant fallback — shipped behavior unchanged) or the fragment fails the
   * v1 recordability predicate.
   */
  public _armRetainedRecord(fragment: RetainedGroupFragment): void {
    const hooks = this.backend as RenderBackend & RetainedBackendHooks;

    if (
      typeof hooks._beginRetainedCapture !== 'function' ||
      typeof hooks._endRetainedCapture !== 'function' ||
      typeof hooks._replayRetainedBatch !== 'function'
    ) {
      return;
    }

    if (!fragment.isRecordable(this.backend)) {
      return;
    }

    this._currentScope().retainedRecordTarget = fragment.instructionsForRecording();
  }

  /** Collect-time replay eligibility for `set` on this backend. */
  private _validateRetainedSet(set: RetainedInstructionSet): boolean {
    const hooks = this.backend as RenderBackend & RetainedBackendHooks;

    if (typeof hooks._replayRetainedBatch !== 'function') {
      return false;
    }

    if (!set.isValidFor(this.backend)) {
      return false;
    }

    return hooks._validateRetainedInstructionSet?.(set) !== false;
  }

  /**
   * @internal — replay a captured fragment into the current scope: the
   * whole-range splice. No scene-graph walk, no cull, no bounds,
   * no material keys — draws re-acquire pooled commands with fresh
   * frame-local nodeIndex values (multi-render() bases stay coherent), nested
   * groups re-acquire pooled scopes, and barrier nodes re-dispatch through a
   * normal `_collect`.
   */
  public _replayRetainedFragment(entries: readonly RetainedFragmentEntry[], entryCount = entries.length): void {
    for (let index = 0; index < entryCount; index++) {
      const entry = entries[index]!;

      if (entry.kind === RenderEntryKind.Draw) {
        this._replayRetainedDraw(entry);
      } else if (entry.kind === RenderEntryKind.Group) {
        this._replayRetainedGroup(entry);
      } else {
        entry.node._collect(this, entry.seq);
      }
    }
  }

  private _replayRetainedGroup(fragment: RetainedFragmentGroup): void {
    // A nested group that SPLICED its instruction set during the capture
    // frame was recorded with EMPTY entries + the set reference.
    // If the set is still replay-eligible, reproduce the splice; if
    // it went stale (bundle generation, backend validation), re-dispatch the
    // live node so the inner container rebuilds from its own fragment —
    // never replay the empty scope as-is.
    let innerSet = fragment.retainedInstructions;

    if (innerSet !== null && !this._validateRetainedSet(innerSet)) {
      if (fragment.transformNode !== null) {
        fragment.transformNode._collect(this, fragment.seq);

        return;
      }

      // Unreachable by construction (only transform-group boundaries splice);
      // degrade to the captured (empty) entries rather than replaying stale
      // instructions.
      innerSet = null;
    }

    // Mirror _replayRetainedDraw's scope bookkeeping for the group entry's
    // verbatim seq/zIndex (see the invariants documented there).
    reserveEntryPlacement(this._currentScope(), fragment.seq, fragment.zIndex);

    const groupScope = this._acquireGroupScope(fragment.preserveDrawOrder);

    groupScope.transformNode = fragment.transformNode;

    if (innerSet !== null) {
      groupScope.retainedInstructions = innerSet;
      this._pushGroupEntry(fragment.seq, fragment.zIndex, groupScope);

      return; // empty scope: the player replays the instructions
    }

    this._pushGroupEntry(fragment.seq, fragment.zIndex, groupScope);
    this._pushScope(groupScope);

    try {
      this._replayRetainedFragment(fragment.entries, fragment.entryCount);
    } finally {
      this._popScope();
    }
  }

  private _resetRuntimeState(): void {
    this._drainScopeStack();
    this._hasPending = false;
    this._groupPoolCursor = 0;
    this._commandPoolCursor = 0;
    this._drawEntryPoolCursor = 0;
    this._groupEntryPoolCursor = 0;
    this._barrierEntryPoolCursor = 0;
    this._barrierScopePoolCursor = 0;
    this._effectDescriptorPoolCursor = 0;
    this._view = null;
    this._nodeIndex = 0;
    this._viewCullSuppression = 0;
    this._retentionRoot = null;
    this._trackedRoot = null;
    // Source-discovery state is per walk, never per pooled builder: a leaked
    // reader set would attribute a view read to a producer in a later, unrelated
    // build and make it live forever.
    this._sourceStack.length = 0;
    this._sourceProducer = null;

    // `Set.clear()` installs a fresh backing table, so an unconditional clear
    // allocates once per frame for a set that is empty on every frame that
    // discovered no source.
    if (this._sourceViewReaders.size > 0) {
      this._sourceViewReaders.clear();
    }
  }

  /**
   * Empty the scope stack without discarding its backing store.
   *
   * `length = 0` is not the same thing: V8 trims an array's backing store to
   * its new length, and it does so against the CAPACITY rather than the current
   * length — so the assignment gives the store back even on a stack that is
   * already empty, and the next push re-grows it. Popping leaves the store
   * alone. The loop also runs the per-scope trim `_popScope` owes each scope an
   * exception unwind may have left open.
   */
  private _drainScopeStack(): void {
    while (this._scopeDepth > 0) {
      this._popScope();
    }
  }

  private _acquireGroupScope(preserveDrawOrder: boolean): MutableGroupScope {
    const scope = this._groupPool[this._groupPoolCursor] ?? {
      kind: RenderEntryKind.Group,
      entries: [],
      entryCount: 0,
      hasMixedZ: false,
      hasMixedPipeline: false,
      preserveDrawOrder: false,
      transformNode: null,
      retainedInstructions: null,
      retainedRecordTarget: null,
      persistentDraw: null,
      _nextSeq: 0,
      firstZ: null,
      firstPipelineKey: null,
      firstBindKey: 0,
      firstOwnMaterial: false,
    };

    this._groupPool[this._groupPoolCursor] = scope;
    this._groupPoolCursor++;

    scope.entryCount = 0;
    scope.hasMixedZ = false;
    scope.hasMixedPipeline = false;
    scope.preserveDrawOrder = preserveDrawOrder;
    scope.transformNode = null;
    scope.retainedInstructions = null;
    scope.retainedRecordTarget = null;
    scope.persistentDraw = null;
    scope._nextSeq = 0;
    scope.firstZ = null;
    scope.firstPipelineKey = null;
    scope.firstBindKey = 0;
    scope.firstOwnMaterial = false;

    return scope;
  }

  private _acquireDrawCommand(): DrawCommand {
    const pooled = this._commandPool[this._commandPoolCursor];

    if (pooled !== undefined) {
      this._commandPoolCursor++;

      return pooled;
    }

    const command: DrawCommand = {
      kind: RenderEntryKind.Draw,
      drawable: undefined as unknown as Drawable,
      nodeIndex: 0,
      seq: 0,
      zIndex: 0,
      material: undefined as unknown as DrawCommand['material'],
      groupIndex: undefined,
      minX: 0,
      minY: 0,
      maxX: 0,
      maxY: 0,
    };

    this._commandPool[this._commandPoolCursor] = command;
    this._commandPoolCursor++;

    return command;
  }

  /**
   * Fold a draw's material into the scope's `hasMixedPipeline` flag. Lives in
   * {@link _pushDrawEntry} rather than beside the `firstZ`/`hasMixedZ` updates
   * because materials exist on draws only: `_pushDrawEntry` is the single funnel
   * every draw entry — freshly collected or retained-replayed — passes through,
   * so no emit path can silently skip the bookkeeping and leave the flag `false`
   * while the scope really does hold several materials.
   */
  private _foldMaterialIntoScope(scope: MutableGroupScope, command: DrawCommand): void {
    const material = command.material;

    if (scope.firstPipelineKey === null) {
      scope.firstPipelineKey = material.pipelineKey;
      scope.firstBindKey = material.bindKey;
      scope.firstOwnMaterial = material.ownMaterial;
    } else if (!scope.hasMixedPipeline && materialKeyForcesFlush(scope.firstPipelineKey, scope.firstBindKey, scope.firstOwnMaterial, material)) {
      scope.hasMixedPipeline = true;
    }
  }

  private _pushDrawEntry(seq: number, zIndex: number, command: DrawCommand): void {
    let entry = this._drawEntryPool[this._drawEntryPoolCursor];

    if (entry === undefined) {
      entry = { kind: RenderEntryKind.Draw, seq, zIndex, command };
      this._drawEntryPool[this._drawEntryPoolCursor] = entry;
    } else {
      entry.seq = seq;
      entry.zIndex = zIndex;
      entry.command = command;
    }

    this._drawEntryPoolCursor++;

    const scope = this._currentScope();

    this._foldMaterialIntoScope(scope, command);
    appendScopeEntry(scope, entry);
  }

  private _pushGroupEntry(seq: number, zIndex: number, scope: GroupScope): void {
    let entry = this._groupEntryPool[this._groupEntryPoolCursor];

    if (entry === undefined) {
      entry = { kind: RenderEntryKind.Group, seq, zIndex, scope };
      this._groupEntryPool[this._groupEntryPoolCursor] = entry;
    } else {
      entry.seq = seq;
      entry.zIndex = zIndex;
      entry.scope = scope;
    }

    this._groupEntryPoolCursor++;
    appendScopeEntry(this._currentScope(), entry);
  }

  private _pushBarrierEntry(seq: number, zIndex: number, scope: BarrierScope): void {
    let entry = this._barrierEntryPool[this._barrierEntryPoolCursor];

    if (entry === undefined) {
      entry = { kind: RenderEntryKind.Barrier, seq, zIndex, scope };
      this._barrierEntryPool[this._barrierEntryPoolCursor] = entry;
    } else {
      entry.seq = seq;
      entry.zIndex = zIndex;
      entry.scope = scope;
    }

    this._barrierEntryPoolCursor++;
    appendScopeEntry(this._currentScope(), entry);
  }

  private _reserveEntryPlacement(seq: number | undefined, zIndex: number): void {
    this._reservedSeq = reserveEntryPlacement(this._currentPlacement(), seq, zIndex);
    this._reservedZ = zIndex;
  }

  /**
   * The container the next entry is placed into: the innermost source scope
   * while a source is being discovered, the innermost frame-local group scope
   * otherwise.
   *
   * The two are different objects with the same placement contract, which is
   * exactly why the rule lives in {@link reserveEntryPlacement} instead of here.
   * Discovery deliberately does NOT borrow a `GroupScope` for its bookkeeping: a
   * dummy scope would tie the backend- and frame-neutral source to the frame's
   * plan and pull the pooled draw/entry machinery in behind it.
   */
  private _currentPlacement(): EntryPlacementState {
    return this._sourceStack[this._sourceStack.length - 1] ?? this._currentScope();
  }

  /**
   * Close the innermost scope: trim its entry array to what this collect
   * actually filled, so everything downstream — the optimizer's z-sort, the
   * player's walk, a fragment snapshot — reads a scope whose length is its
   * entry count and never sees a slot left over from an earlier frame.
   *
   * The trim is the ONE place the array may shrink, and it only shrinks to the
   * count this frame reached; the steady state where the count is unchanged
   * does nothing at all.
   */
  private _popScope(): void {
    if (this._scopeDepth === 0) {
      return;
    }

    const scope = this._scopeStack[--this._scopeDepth]!;

    if (scope.entries.length !== scope.entryCount) {
      scope.entries.length = scope.entryCount;
    }
  }

  /** Open `scope`, reusing the stack slot at this depth when one already exists. */
  private _pushScope(scope: MutableGroupScope): void {
    const depth = this._scopeDepth++;

    if (depth < this._scopeStack.length) {
      this._scopeStack[depth] = scope;
    } else {
      this._scopeStack.push(scope);
    }
  }

  private _currentScope(): MutableGroupScope {
    const scope = this._scopeDepth > 0 ? this._scopeStack[this._scopeDepth - 1] : undefined;

    if (!scope) {
      throw new Error('RenderPlanBuilder scope stack is empty.');
    }

    return scope;
  }

  private _resolvePreserveDrawOrder(node: RenderNode): boolean {
    return node.preserveDrawOrder;
  }

  private _createEffectDescriptor(node: RenderNode): EffectDescriptor {
    const mask = node._renderPlanGetMaskSource();
    let clip = ClipKind.None;
    let clipShape: Rectangle | Geometry | null = null;

    if (node.clip) {
      const shape = node.clipShape;

      if (shape === null || shape instanceof Rectangle) {
        clip = ClipKind.Rect;
        clipShape = shape;
      } else {
        clip = ClipKind.Stencil;
        clipShape = shape;
      }
    }

    const blendMode = node._renderPlanGetBlendMode();
    const descriptor = (this._effectDescriptorPool[this._effectDescriptorPoolCursor] ??= {
      filters: emptyFilters,
      clip: ClipKind.None,
      clipShape: null,
      maskSource: null,
      cacheAsBitmap: false,
      blendMode,
      needsBackdropBlend: false,
    });

    this._effectDescriptorPoolCursor++;

    descriptor.filters = node._renderPlanGetFilters();
    descriptor.clip = clip;
    descriptor.clipShape = clipShape;
    descriptor.maskSource = mask;
    descriptor.cacheAsBitmap = node.cacheAsBitmap;
    descriptor.blendMode = blendMode;
    descriptor.needsBackdropBlend = isAdvancedBlendMode(blendMode);

    return descriptor;
  }

  /**
   * A barrier scope from the pool, filled in. Held only for the duration of the
   * plan that produced it — the executor reads it during playback and keeps no
   * reference past the frame.
   */
  private _acquireBarrierScope(
    node: RenderNode,
    effect: EffectDescriptor,
    childPlan: GroupScope | null,
    left: number,
    top: number,
    width: number,
    height: number,
  ): BarrierScope {
    const scope = (this._barrierScopePool[this._barrierScopePoolCursor] ??= {
      kind: RenderEntryKind.Barrier,
      node,
      effect,
      childPlan,
      left,
      top,
      width,
      height,
    });

    this._barrierScopePoolCursor++;

    scope.node = node;
    scope.effect = effect;
    scope.childPlan = childPlan;
    scope.left = left;
    scope.top = top;
    scope.width = width;
    scope.height = height;

    return scope;
  }
}
