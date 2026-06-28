import { Rectangle } from '#math/Rectangle';
import type { Drawable } from '#rendering/Drawable';
import type { Geometry } from '#rendering/geometry/Geometry';
import type { RenderBackend } from '#rendering/RenderBackend';
import type { RenderNode } from '#rendering/RenderNode';
import { isAdvancedBlendMode } from '#rendering/types';
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
} from './RenderScope';

interface MutableGroupScope extends GroupScope {
  _nextSeq: number;
  firstZ: number | null;
}

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

  public build(root: RenderNode, backend: RenderBackend): RenderPlan {
    this.backend = backend;
    this._view = null;
    this._plan.reset();
    this._groupPoolCursor = 0;
    this._commandPoolCursor = 0;
    this._drawEntryPoolCursor = 0;
    this._groupEntryPoolCursor = 0;
    this._barrierEntryPoolCursor = 0;
    this._scopeStack.length = 0;
    this._hasPending = false;
    // Base this plan's node indices after whatever earlier render() calls already
    // wrote into the frame-scoped transform buffer, so every draw across all
    // render() calls in the frame references a distinct slot and can batch.
    const frameBase = (backend as { transformBufferCount?: number }).transformBufferCount ?? 0;
    this._nodeIndex = frameBase;

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
  }

  private _acquireGroupScope(preserveDrawOrder: boolean): MutableGroupScope {
    const scope = this._groupPool[this._groupPoolCursor] ?? {
      kind: RenderEntryKind.Group,
      entries: [],
      hasMixedZ: false,
      preserveDrawOrder: false,
      _nextSeq: 0,
      firstZ: null,
    };

    this._groupPool[this._groupPoolCursor] = scope;
    this._groupPoolCursor++;

    scope.entries.length = 0;
    scope.hasMixedZ = false;
    scope.preserveDrawOrder = preserveDrawOrder;
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
