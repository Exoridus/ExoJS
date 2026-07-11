import { Rectangle } from '#math/Rectangle';
import type { Drawable } from '#rendering/Drawable';
import type { Geometry } from '#rendering/geometry/Geometry';
import type { RenderBackend } from '#rendering/RenderBackend';
import type { RenderNode } from '#rendering/RenderNode';
import { BlendModes, isAdvancedBlendMode } from '#rendering/types';
import type { View } from '#rendering/View';

import { type DrawCommand, RenderEntryKind } from './RenderCommand';
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

/**
 * Collect-time view of the backend's retained-batch hooks (Track B Slice 3).
 * `_replayRetainedBatch` gates the splice tier, the capture pair gates record
 * arming, and `_validateRetainedInstructionSet` is the backend's optional
 * extra collect-time validation (e.g. WebGPU texture-view identity, S3-D3) on
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

interface MutableGroupScope extends GroupScope {
  _nextSeq: number;
  firstZ: number | null;
}

/**
 * Effect-less descriptor shared by every sub-branch escape barrier (F13/R3):
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

  // Frame-persistent free-lists (Slice 2b). Each lives on the builder INSTANCE
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

  // Track B Slice 2: count of transform-group boundaries currently being
  // collected below. See `_isViewCullSuppressed`.
  private _viewCullSuppression = 0;

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
        view: this.view,
        clearColor: null,
        root: rootScope,
      });
    }

    this._plan.nodeCount = this._nodeIndex - frameBase;

    return this._plan;
  }

  public get view(): View {
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

    // Sub-branch escape (F13/R3): a DIRECT child of the engaged transform-
    // group boundary being collected (the scope guard keeps this off every
    // other emit) whose subtree contains a deep barrier leaves the group,
    // while its siblings keep retention + the group transform. Wrap it in an
    // effect-less barrier entry — playback suspends the group uniform (the
    // branch resolves world-space transforms via the matching
    // `_escapesTransformGroup` seam) and fragment capture records a live
    // re-dispatch (spec §8) — then re-enter emitNode inside the child plan,
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
      node._collectForRenderPlan(this);
    } finally {
      this._scopeStack.pop();
    }
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
   * whole by RetainedContainer._collect instead (spec §6).
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
   * {@link RetainedPlanCache} for the Wave 3 static-subtree skip and by
   * {@link _replayRetainedFragment} for the Slice 2 whole-fragment splice;
   * callers must have already verified the owning container's subtree is
   * unchanged (content + structure revision, and backend all match the
   * capture — plus view for the Slice-1 per-child cache).
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
    command.material = slot.material;
    command.minX = slot.minX;
    command.minY = slot.minY;
    command.maxX = slot.maxX;
    command.maxY = slot.maxY;

    this._pushDrawEntry(slot.seq, slot.zIndex, command);
  }

  /**
   * @internal — instruction splice (Track B Slice 3, S3-D2): when the current
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
   * @internal — arm instruction recording for the current scope (Slice 3):
   * called on a CLEAN entry-replay frame (record-on-first-clean-frame
   * policy), so the record cost is never wasted on a frame whose capture is
   * about to be invalidated. No-op when the backend lacks the capture hooks
   * (dormant fallback — shipped behavior unchanged) or the fragment fails the
   * v1 recordability predicate (S3-D5).
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

  /** Collect-time replay eligibility (S3-D3) for `set` on this backend. */
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
   * whole-range splice (spec §4.2). No scene-graph walk, no cull, no bounds,
   * no material keys — draws re-acquire pooled commands with fresh
   * frame-local nodeIndex values (multi-render() bases stay coherent), nested
   * groups re-acquire pooled scopes, and barrier nodes re-dispatch through a
   * normal `_collect` (spec §8).
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
    // frame was recorded with EMPTY entries + the set reference (Slice 3,
    // S3-D6). If the set is still replay-eligible, reproduce the splice; if
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
  }

  private _acquireGroupScope(preserveDrawOrder: boolean): MutableGroupScope {
    const scope = this._groupPool[this._groupPoolCursor] ?? {
      kind: RenderEntryKind.Group,
      entries: [],
      hasMixedZ: false,
      preserveDrawOrder: false,
      transformNode: null,
      retainedInstructions: null,
      retainedRecordTarget: null,
      _nextSeq: 0,
      firstZ: null,
    };

    this._groupPool[this._groupPoolCursor] = scope;
    this._groupPoolCursor++;

    scope.entries.length = 0;
    scope.hasMixedZ = false;
    scope.preserveDrawOrder = preserveDrawOrder;
    scope.transformNode = null;
    scope.retainedInstructions = null;
    scope.retainedRecordTarget = null;
    scope._nextSeq = 0;
    scope.firstZ = null;

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
    this._currentScope().entries.push(entry);
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
