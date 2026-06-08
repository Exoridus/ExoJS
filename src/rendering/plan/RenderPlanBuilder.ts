import { Rectangle } from '#math/Rectangle';
import type { Drawable } from '#rendering/Drawable';
import type { Geometry } from '#rendering/geometry/Geometry';
import type { RenderBackend } from '#rendering/RenderBackend';
import type { RenderNode } from '#rendering/RenderNode';
import type { View } from '#rendering/View';

import { type DrawCommand, makeMaterialKey, RenderEntryKind } from './RenderCommand';
import { MutableRenderPlan, type RenderPlan } from './RenderPlan';
import { type BarrierScope, ClipKind, type EffectDescriptor, type GroupScope, type ScopeEntry } from './RenderScope';

interface PendingEntryPlacement {
  seq: number;
  zIndex: number;
}

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
  private _pendingEntryPlacement: PendingEntryPlacement | null = null;
  private _nodeIndex = 0;

  public build(root: RenderNode, backend: RenderBackend): RenderPlan {
    this.backend = backend;
    this._view = null;
    this._plan.reset();
    this._groupPoolCursor = 0;
    this._scopeStack.length = 0;
    this._pendingEntryPlacement = null;
    this._nodeIndex = 0;

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

    this._plan.nodeCount = this._nodeIndex;

    return this._plan;
  }

  public get view(): View {
    if (this._view === null) {
      this._view = this.backend.view;
    }

    return this._view;
  }

  public emitNode(node: RenderNode, seq?: number): void {
    const placement = this._reserveEntryPlacement(seq, node.zIndex);

    if (node._renderPlanHasBarrierEffects()) {
      const effect = this._createEffectDescriptor(node);
      const hasAlphaMask = effect.maskSource !== null && !(effect.maskSource instanceof Rectangle);
      const needsBounds = effect.cacheAsBitmap || effect.filters.length > 0 || hasAlphaMask;
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

      this._pushEntry({
        kind: RenderEntryKind.Barrier,
        seq: placement.seq,
        zIndex: placement.zIndex,
        scope: barrierScope,
      });

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
      this._pendingEntryPlacement = placement;

      try {
        node._collectForRenderPlan(this);
      } finally {
        this._pendingEntryPlacement = null;
      }

      return;
    }

    const groupScope = this._acquireGroupScope(this._resolvePreserveDrawOrder(node));

    this._pushEntry({
      kind: RenderEntryKind.Group,
      seq: placement.seq,
      zIndex: placement.zIndex,
      scope: groupScope,
    });

    this._scopeStack.push(groupScope);

    try {
      node._collectForRenderPlan(this);
    } finally {
      this._scopeStack.pop();
    }
  }

  public emitDraw(drawable: Drawable, seq?: number): void {
    const pendingPlacement = this._pendingEntryPlacement;

    if (pendingPlacement !== null) {
      this._pendingEntryPlacement = null;
    }

    const zIndex = pendingPlacement?.zIndex ?? drawable.zIndex;
    const placement = this._reserveEntryPlacement(seq ?? pendingPlacement?.seq, zIndex);
    const bounds = drawable.getBounds();
    const command: DrawCommand = {
      kind: RenderEntryKind.Draw,
      drawable,
      nodeIndex: this._nodeIndex++,
      seq: placement.seq,
      zIndex: placement.zIndex,
      material: makeMaterialKey(drawable, this.backend),
      minX: bounds.left,
      minY: bounds.top,
      maxX: bounds.right,
      maxY: bounds.bottom,
    };

    this._pushEntry({
      kind: RenderEntryKind.Draw,
      seq: placement.seq,
      zIndex: placement.zIndex,
      command,
    });
  }

  private _resetRuntimeState(): void {
    this._scopeStack.length = 0;
    this._pendingEntryPlacement = null;
    this._groupPoolCursor = 0;
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

  private _reserveEntryPlacement(seq: number | undefined, zIndex: number): PendingEntryPlacement {
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

    return { seq: nextSeq, zIndex };
  }

  private _pushEntry(entry: ScopeEntry): void {
    this._currentScope().entries.push(entry);
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

    return {
      filters: node._renderPlanGetFilters(),
      clip,
      clipShape,
      maskSource: mask,
      cacheAsBitmap: node.cacheAsBitmap,
      blendMode: node._renderPlanGetBlendMode(),
    };
  }
}
