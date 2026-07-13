import { invariant } from '#core/dev';
import { logger } from '#core/logging';
import type { Stage } from '#core/Stage';
import { removeArrayItems } from '#core/utils';
import { RenderEntryKind } from '#rendering/plan/RenderCommand';
import type { RenderPlanBuilder } from '#rendering/plan/RenderPlanBuilder';
import { RetainedPlanCache } from '#rendering/plan/RetainedPlanCache';

import { RenderNode } from './RenderNode';

/**
 * Scene-graph node that owns child {@link RenderNode}s. Renders its
 * subtree in document order with local `zIndex` ordering resolved inside
 * the internal render plan at playback time.
 *
 * Bounds aggregate the local bounds + every visible child's bounds, so
 * `container.getBounds()` always returns the smallest axis-aligned rectangle
 * containing the subtree. Width/height accessors derive from the bounds
 * (× `scale`) and writing to them rescales `scale` to fit.
 *
 * Adding a child re-parents it: the previous parent is detached
 * automatically. Removing a child cascades bounds invalidation up the
 * ancestor chain so further-up containers also rebuild on next read.
 *
 * Subclassed by {@link Sprite}, {@link Mesh}, {@link Graphics}, {@link Text},
 * etc. — the base `Container` is a non-drawing grouping node.
 * @stable
 */
export class Container extends RenderNode {
  protected readonly _children: RenderNode[] = [];
  private _retainedPlan: RetainedPlanCache | null = null;

  public get children(): RenderNode[] {
    return this._children;
  }

  public get width(): number {
    return Math.abs(this.scale.x) * this.getBounds().width;
  }

  public set width(value: number) {
    this.scale.x = value / this.getBounds().width;
  }

  public get height(): number {
    return Math.abs(this.scale.y) * this.getBounds().height;
  }

  public set height(value: number) {
    this.scale.y = value / this.getBounds().height;
  }

  public get left(): number {
    return this.x - this.width * this.origin.x;
  }

  public get top(): number {
    return this.y - this.height * this.origin.y;
  }

  public get right(): number {
    return this.x + this.width - this.origin.x;
  }

  public get bottom(): number {
    return this.y + this.height - this.origin.y;
  }

  /**
   * Append one or more children to the end of the child list. Each child
   * is detached from its previous parent (if any) before being added.
   */
  public addChild(...children: RenderNode[]): this {
    for (const child of children) {
      this.addChildAt(child, this._children.length);
    }

    return this;
  }

  /**
   * Insert `child` at `index` in the child list. The child is detached
   * from any previous parent first. Throws if `index` is out of bounds.
   * Self-as-child is a no-op.
   */
  public addChildAt(child: RenderNode, index: number): this {
    if (index < 0 || index > this._children.length) {
      throw new Error(`The index ${index} is out of bounds ${this._children.length}`);
    }

    if (child === this) {
      return this;
    }

    // #310: attaching an already-destroyed node is otherwise silent — it renders
    // nothing (the collect dev-guard skips it) or replays freed state. Warn once
    // in dev at the attach site, the earliest clear use-after-destroy signal.
    if (__DEV__ && child.destroyed) {
      logger.warn(
        'Container.addChild(): the child has already been destroy()ed — using a destroyed node is a no-op at best and stale state at worst. Create a fresh node instead of re-adding a destroyed one.',
        { source: 'rendering', once: 'container:add-destroyed-child' },
      );
    }

    // Reject reparenting an ancestor of this container as a child: it would
    // close a cycle in the scene graph, and every recursive walk over it
    // (bounds cascade, updateParentTransform, subtree destroy) would loop
    // forever instead of terminating at the root.
    for (let ancestor = this.parent; ancestor !== null; ancestor = ancestor.parent) {
      invariant(
        ancestor !== child,
        'Container.addChild(): cannot add an ancestor of this container as a child — that would create a cycle in the scene graph.',
      );
    }

    if (child.parent) {
      child.parent.removeChild(child);
    }

    child.parent = this;
    this._children.splice(index, 0, child);
    this.invalidateCache();
    this._markStructureDirty();

    child._invalidateSubtreeTransform();
    this._invalidateBoundsCascade();

    child._setStage(this._stage);
    this._stage?.interaction._notifyNodeAdded(child);

    return this;
  }

  public swapChildren(firstChild: RenderNode, secondChild: RenderNode): this {
    if (firstChild !== secondChild) {
      const firstIndex = this.getChildIndex(firstChild);
      const secondIndex = this.getChildIndex(secondChild);

      this._children[firstIndex] = secondChild;
      this._children[secondIndex] = firstChild;
      this.invalidateCache();
      this._markStructureDirty();
    }

    return this;
  }

  public getChildIndex(child: RenderNode): number {
    const index = this._children.indexOf(child);

    if (index === -1) {
      throw new Error('Drawable is not a child of the container.');
    }

    return index;
  }

  public setChildIndex(child: RenderNode, index: number): this {
    if (index < 0 || index >= this._children.length) {
      throw new Error(`The index ${index} is out of bounds ${this._children.length}`);
    }

    removeArrayItems(this._children, this.getChildIndex(child), 1);

    this._children.splice(index, 0, child);
    this.invalidateCache();
    this._markStructureDirty();

    return this;
  }

  public getChildAt(index: number): RenderNode {
    if (index < 0 || index >= this._children.length) {
      throw new Error(`getChildAt: Index (${index}) does not exist.`);
    }

    // Bounds-checked above.
    return this._children[index]!;
  }

  /** Remove `child` from this container. No-op if not present. */
  public removeChild(child: RenderNode): this {
    const index = this._children.indexOf(child);

    if (index !== -1) {
      this.removeChildAt(index);
    }

    return this;
  }

  public removeChildAt(index: number): this {
    const child = this._children[index];

    removeArrayItems(this._children, index, 1);

    if (child?.parent === this) {
      // Cascade bounds up BEFORE clearing parent so the walk reaches this node.
      this._invalidateBoundsCascade();
      child.parent = null;
      child._invalidateSubtreeTransform();
      this._stage?.interaction._notifyNodeRemoved(child);
      this._stage?.focus._notifyNodeRemoved(child);
      child._setStage(null);
    }

    this.invalidateCache();
    this._markStructureDirty();

    return this;
  }

  /**
   * Remove children in the half-open range `[begin, end)`. Defaults to
   * the entire child list. Throws if the range is invalid.
   */
  public removeChildren(begin = 0, end: number = this._children.length): this {
    const range = end - begin;

    if (range < 0 || range > end) {
      throw new Error('Values are outside the acceptable range.');
    }

    // Cascade bounds before clearing any parent references.
    if (range > 0) {
      this._invalidateBoundsCascade();
    }

    for (let i = begin; i < end; i++) {
      const child = this._children[i];

      if (child?.parent === this) {
        child.parent = null;
        child._invalidateSubtreeTransform();
        this._stage?.interaction._notifyNodeRemoved(child);
        this._stage?.focus._notifyNodeRemoved(child);
        child._setStage(null);
      }
    }

    removeArrayItems(this._children, begin, range);
    this.invalidateCache();
    this._markStructureDirty();

    return this;
  }

  /**
   * @internal — whether `child` (a DIRECT child of this container) opts out of
   * this container's transform-group boundary and resolves world-space
   * transforms. Always `false` on plain containers; {@link RetainedContainer}
   * overrides it with its revision-keyed deep-barrier branch-escape set
   * (F13/R3). Every caller guards on the parent being an engaged boundary (or
   * on the collect-scope's `transformNode`), so the base implementation is
   * never on a hot path.
   */
  public _childEscapesTransformGroup(_child: RenderNode): boolean {
    return false;
  }

  /** @internal — propagate the owning stage down the whole subtree. */
  public override _setStage(stage: Stage | null): void {
    if (this._stage === stage) {
      return;
    }

    this._stage = stage;

    for (const child of this._children) {
      child._setStage(stage);
    }
  }

  /** @internal */
  protected override _collectContent(builder: RenderPlanBuilder): void {
    if (this._children.length === 0) {
      return;
    }

    const viewUpdateId = builder.view.updateId;

    if (this._retainedPlan?.isClean(this._contentRevision, this._structureRevision, this._transformRevision, viewUpdateId, builder.backend)) {
      if (__DEV__ && this._retainedPlan._devHasDestroyedDrawable()) {
        // P3f: a direct drawable child was destroy()ed but left attached, so
        // no revision bumped and the slot cache still looks clean. Drop the
        // stale capture (releasing the strong refs) and fall through to a full
        // collect, which skips the destroyed child (RenderNode._collect dev
        // guard) and recaptures without it. Silent here — the loud diagnostic
        // is owned by the nearest RetainedContainer (P3f).
        this._retainedPlan.invalidate();
      } else {
        this._replayRetainedChildren(builder);

        return;
      }
    }

    this._collectAndCaptureChildren(builder, viewUpdateId);
  }

  /**
   * Fast path: this subtree's content/structure revision, the view, and the
   * backend are all unchanged since the last full collect. Direct Drawable
   * children with a captured slot are replayed without cull/bounds/
   * material-key work; every other direct child (Container, or a
   * barrier-having Drawable, or a child that was culled/invisible last
   * capture) still goes through a normal `_collect` call, which recurses into
   * its own independent skip decision.
   */
  private _replayRetainedChildren(builder: RenderPlanBuilder): void {
    // Non-null: only called from the isClean-guarded fast path above.
    const slots = this._retainedPlan!.slots;
    let slotIndex = 0;

    for (let index = 0; index < this._children.length; index++) {
      const slot = slots[slotIndex];

      if (slot?.childIndex === index) {
        builder._replayRetainedDraw(slot);
        slotIndex++;
      } else {
        // In-bounds: index < length.
        this._children[index]!._collect(builder, index);
      }
    }
  }

  /**
   * Slow path (today's unmodified behavior): collect every child normally,
   * then snapshot exactly the direct-Drawable children that produced a single
   * `Draw`-kind entry (a plain, non-barrier, visible Drawable) into the
   * cache's pooled retained slots for next frame's fast path (Slice 3, F11a:
   * steady-state recapture allocates zero slot records).
   */
  private _collectAndCaptureChildren(builder: RenderPlanBuilder, viewUpdateId: number): void {
    let sawSlotCandidate = false;

    // Rewind an existing cache's slot pool; a cache created lazily below
    // starts already-begun.
    this._retainedPlan?._beginCapture();

    for (let index = 0; index < this._children.length; index++) {
      // In-bounds: index < length.
      const child = this._children[index]!;

      // Only a plain, non-barrier drawable can ever produce a retained slot
      // (exactly one Draw entry for itself). Every other child skips the
      // peek/capture bookkeeping entirely -- the S2-D4 zero-slot fix: 99.7% of
      // containers in the Slice-1 measurement had no direct drawable children
      // and paid pure overhead here.
      if (!child._isDrawableForRenderPlan() || child._renderPlanHasBarrierEffects()) {
        child._collect(builder, index);

        continue;
      }

      sawSlotCandidate = true;

      const beforeCount = builder._peekCurrentScopeEntries().length;

      child._collect(builder, index);

      const entries = builder._peekCurrentScopeEntries();

      if (entries.length === beforeCount + 1) {
        const entry = entries[entries.length - 1]!;

        if (entry.kind === RenderEntryKind.Draw && entry.command.drawable === child) {
          (this._retainedPlan ??= new RetainedPlanCache())._appendSlot(index, entry.command);
        }
      }
    }

    // Allocate/refresh the cache only when there is (or once was) anything to
    // retain: a slot candidate this frame, or an already-live cache that must
    // be re-keyed so it cannot go stale-clean.
    if (sawSlotCandidate || this._retainedPlan !== null) {
      (this._retainedPlan ??= new RetainedPlanCache())._commitCapture(
        this._contentRevision,
        this._structureRevision,
        this._transformRevision,
        viewUpdateId,
        builder.backend,
      );
    }
  }

  public override contains(x: number, y: number): boolean {
    const children = this._children;

    for (let i = 0; i < children.length; i++) {
      // In-bounds: i < length.
      if (children[i]!.contains(x, y)) {
        return true;
      }
    }

    return false;
  }

  public override updateBounds(): this {
    this._bounds.reset().addRect(this.getLocalBounds(), this.getGlobalTransform());

    for (const child of this._children) {
      if (child.visible) {
        this._bounds.addRect(child.getBounds());
      }
    }

    return this;
  }

  public override destroy(): void {
    this.removeChildren();
    this._retainedPlan?.invalidate();

    super.destroy();
  }
}
