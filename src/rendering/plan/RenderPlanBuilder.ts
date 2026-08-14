import { Rectangle } from '#math/Rectangle';
import type { Drawable } from '#rendering/Drawable';
import type { Geometry } from '#rendering/geometry/Geometry';
import type { RenderBackend } from '#rendering/RenderBackend';
import type { RenderNode } from '#rendering/RenderNode';
import { BlendModes, isAdvancedBlendMode } from '#rendering/types';
import type { View } from '#rendering/View';

import { type DrawCommand, materialKeyForcesFlush, RenderEntryKind } from './RenderCommand';
import { MutableRenderPlan, type RenderPlan } from './RenderPlan';
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
import type { RetainedFragmentEntry, RetainedFragmentGroup, RetainedGroupFragment } from './RetainedGroupFragment';
import type { RetainedInstructionSet } from './RetainedInstructionSet';
import type { RetainedDrawData } from './RetainedPlanCache';
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

interface MutableGroupScope extends GroupScope {
  _nextSeq: number;
  firstZ: number | null;
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

/**
 * Effect-less descriptor shared by every sub-branch escape barrier:
 * all effect stages are disabled, so {@link RenderEffectExecutor.play} is a
 * pure passthrough into the child plan. The barrier entry exists only for its
 * playback semantics — the group uniform is suspended (the branch collected
 * world-space transforms) and fragment capture records a live re-dispatch.
 */
const groupEscapeEffect: EffectDescriptor = Object.freeze({
  filters: [],
  clip: ClipKind.None,
  clipShape: null,
  maskSource: null,
  cacheAsBitmap: false,
  blendMode: BlendModes.Normal,
  needsBackdropBlend: false,
});

/** @internal */
export class RenderPlanBuilder {
  private static readonly _available: RenderPlanBuilder[] = [];
  private static readonly _active: RenderPlanBuilder[] = [];

  public static acquire(): RenderPlanBuilder {
    const builder = RenderPlanBuilder._available.pop() ?? new RenderPlanBuilder();

    RenderPlanBuilder._active.push(builder);

    return builder;
  }

  public static release(builder: RenderPlanBuilder): void {
    const index = RenderPlanBuilder._active.lastIndexOf(builder);

    if (index === -1) {
      return;
    }

    RenderPlanBuilder._active.splice(index, 1);
    builder._resetRuntimeState();
    RenderPlanBuilder._available.push(builder);
  }

  public backend!: RenderBackend;
  private _view: View | null = null;

  private readonly _plan = new MutableRenderPlan();
  private readonly _groupPool: MutableGroupScope[] = [];
  private readonly _scopeStack: MutableGroupScope[] = [];
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
    this._scopeStack.length = 0;
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

    this._scopeStack.push(rootScope);
    root._collect(this);
    this._scopeStack.pop();

    if (rootScope.entries.length > 0) {
      this._plan.passes.push({
        target: null,
        view: this._viewUnobserved(),
        clearColor: null,
        root: rootScope,
      });
    }

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
      const barrierScope: BarrierScope = {
        kind: RenderEntryKind.Barrier,
        node,
        effect,
        childPlan,
        left,
        top,
        width,
        height,
      };

      this._pushBarrierEntry(reservedSeq, reservedZ, barrierScope);

      if (childPlan !== null) {
        this._scopeStack.push(childPlan);

        try {
          node._collectForRenderPlan(this);
        } finally {
          this._scopeStack.pop();
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
      const barrierScope: BarrierScope = {
        kind: RenderEntryKind.Barrier,
        node,
        effect: groupEscapeEffect,
        childPlan,
        left: 0,
        top: 0,
        width: 0,
        height: 0,
      };

      this._pushBarrierEntry(reservedSeq, reservedZ, barrierScope);
      this._scopeStack.push(childPlan);

      try {
        this.emitNode(node, seq);
      } finally {
        this._scopeStack.pop();
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

    this._scopeStack.push(groupScope);

    try {
      if (node === this._retentionRoot) {
        this._collectRetainedRoot(node);
      } else {
        node._collectForRenderPlan(this);
      }
    } finally {
      this._scopeStack.pop();
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

      this._replayRetainedFragment(representation.fragment.entries);
      representation.markReplayed();
      // Record-on-first-clean-frame: this clean playback is the recording
      // source, so the record cost never lands on a frame whose capture is
      // about to be invalidated.
      this._armRetainedRecord(representation.fragment);

      return;
    }

    if (representation.shouldSuppressCapture(contentRevision, structureRevision, transformRevision, view)) {
      node._collectForRenderPlan(this);

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
      node._collectForRenderPlan(this);
    } finally {
      this._trackedRoot = previousTracked;
      this._captureCullActive = false;
    }

    representation.commitCapture(contentRevision, structureRevision, transformRevision, ancestryStamp, view, backend, target, this._peekCurrentScopeEntries());
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
   * @internal — the entries pushed into the currently-active scope so far this
   * collect. Read-only peek used by {@link RetainedPlanCache} to snapshot a
   * container's direct-drawable fragment right after a full (non-skipped)
   * collect of it.
   */
  public _peekCurrentScopeEntries(): readonly ScopeEntry[] {
    return this._currentScope().entries;
  }

  /**
   * @internal — true while collecting below a transform-group boundary.
   * Inside a group, child bounds are group-local, so testing them against the
   * world-space view rect would be meaningless; the group is culled as a
   * whole by RetainedContainer._collect instead.
   */
  public get _isViewCullSuppressed(): boolean {
    return this._viewCullSuppression > 0;
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
    const scope = this._currentScope();

    if (slot.seq >= scope._nextSeq) {
      scope._nextSeq = slot.seq + 1;
    }

    if (scope.firstZ === null) {
      scope.firstZ = slot.zIndex;
    } else if (!scope.hasMixedZ && scope.firstZ !== slot.zIndex) {
      scope.hasMixedZ = true;
    }

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
  public _replayRetainedFragment(entries: readonly RetainedFragmentEntry[]): void {
    for (const entry of entries) {
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
    const scope = this._currentScope();

    if (fragment.seq >= scope._nextSeq) {
      scope._nextSeq = fragment.seq + 1;
    }

    if (scope.firstZ === null) {
      scope.firstZ = fragment.zIndex;
    } else if (!scope.hasMixedZ && scope.firstZ !== fragment.zIndex) {
      scope.hasMixedZ = true;
    }

    const groupScope = this._acquireGroupScope(fragment.preserveDrawOrder);

    groupScope.transformNode = fragment.transformNode;

    if (innerSet !== null) {
      groupScope.retainedInstructions = innerSet;
      this._pushGroupEntry(fragment.seq, fragment.zIndex, groupScope);

      return; // empty scope: the player replays the instructions
    }

    this._pushGroupEntry(fragment.seq, fragment.zIndex, groupScope);
    this._scopeStack.push(groupScope);

    try {
      this._replayRetainedFragment(fragment.entries);
    } finally {
      this._scopeStack.pop();
    }
  }

  private _resetRuntimeState(): void {
    this._scopeStack.length = 0;
    this._hasPending = false;
    this._groupPoolCursor = 0;
    this._commandPoolCursor = 0;
    this._drawEntryPoolCursor = 0;
    this._groupEntryPoolCursor = 0;
    this._barrierEntryPoolCursor = 0;
    this._view = null;
    this._nodeIndex = 0;
    this._viewCullSuppression = 0;
    this._retentionRoot = null;
    this._trackedRoot = null;
  }

  private _acquireGroupScope(preserveDrawOrder: boolean): MutableGroupScope {
    const scope = this._groupPool[this._groupPoolCursor] ?? {
      kind: RenderEntryKind.Group,
      entries: [],
      hasMixedZ: false,
      hasMixedPipeline: false,
      preserveDrawOrder: false,
      transformNode: null,
      retainedInstructions: null,
      retainedRecordTarget: null,
      _nextSeq: 0,
      firstZ: null,
      firstPipelineKey: null,
      firstBindKey: 0,
      firstOwnMaterial: false,
    };

    this._groupPool[this._groupPoolCursor] = scope;
    this._groupPoolCursor++;

    scope.entries.length = 0;
    scope.hasMixedZ = false;
    scope.hasMixedPipeline = false;
    scope.preserveDrawOrder = preserveDrawOrder;
    scope.transformNode = null;
    scope.retainedInstructions = null;
    scope.retainedRecordTarget = null;
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
    scope.entries.push(entry);
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
    this._currentScope().entries.push(entry);
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
    this._currentScope().entries.push(entry);
  }

  private _reserveEntryPlacement(seq: number | undefined, zIndex: number): void {
    const scope = this._currentScope();
    const nextSeq = seq ?? scope._nextSeq;

    if (nextSeq >= scope._nextSeq) {
      scope._nextSeq = nextSeq + 1;
    }

    if (scope.firstZ === null) {
      scope.firstZ = zIndex;
    } else if (!scope.hasMixedZ && scope.firstZ !== zIndex) {
      scope.hasMixedZ = true;
    }

    this._reservedSeq = nextSeq;
    this._reservedZ = zIndex;
  }

  private _currentScope(): MutableGroupScope {
    const scope = this._scopeStack[this._scopeStack.length - 1];

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

    return {
      filters: node._renderPlanGetFilters(),
      clip,
      clipShape,
      maskSource: mask,
      cacheAsBitmap: node.cacheAsBitmap,
      blendMode,
      needsBackdropBlend: isAdvancedBlendMode(blendMode),
    };
  }
}
