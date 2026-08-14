import { invariant } from '#core/dev';
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
 * containing the subtree. The size and edge accessors report that rectangle;
 * writing to `width`/`height` rescales `scale` to fit.
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
  private readonly _childList: RenderNode[] = [];
  private _retainedPlan: RetainedPlanCache | null = null;
  private _childrenView: readonly RenderNode[] | null = null;
  private _paintChildrenView: readonly RenderNode[] | null = null;
  private _childIndexView: ReadonlyMap<RenderNode, number> | null = null;

  /**
   * The live child list, readable by subclasses and mutable only from here.
   *
   * Typed `readonly` on purpose: the public {@link children} snapshot and the
   * paint-order/child-index caches derived from it are invalidated by the
   * mutation methods below, so a subclass splicing the array directly would
   * leave all three silently stale. Unlike {@link children} this is the array
   * itself — no copy, no freeze — so reading it in a hot path costs nothing.
   * Go through `addChild`/`removeChild`/`setChildIndex` to change it.
   */
  protected get _children(): readonly RenderNode[] {
    return this._childList;
  }

  /**
   * Snapshot of the current children in document order. Frozen and cached —
   * repeated reads return the same array reference until the next
   * structural change (`addChild`/`removeChild`/`setChildIndex`/
   * `swapChildren`/etc.), which invalidates it. A reference to a previous
   * snapshot is unaffected by later changes — it keeps reflecting the child
   * list as it was at the time of the read. Mutating methods (`push`,
   * `splice`, ...) throw in normal (strict-mode) usage; go through
   * `addChild`/`removeChild` instead so parent linkage, stage propagation,
   * and bounds invalidation stay consistent.
   */
  public get children(): readonly RenderNode[] {
    return (this._childrenView ??= Object.freeze([...this._childList]));
  }

  /** Cached renderer-compatible child order. @internal */
  public _childrenInPaintOrder(): readonly RenderNode[] {
    if (this._paintChildrenView !== null) return this._paintChildrenView;
    const children = this.children;
    const first = children[0];
    if (first === undefined) return (this._paintChildrenView = children);
    for (let i = 1; i < children.length; i++) {
      if (children[i]!.zIndex !== first.zIndex) {
        return (this._paintChildrenView = Object.freeze([...children].sort((a, b) => a.zIndex - b.zIndex)));
      }
    }
    return (this._paintChildrenView = children);
  }

  /** Invalidate document-order, paint-order and child-index views. @internal */
  public _invalidateChildOrder(): void {
    this._childrenView = null;
    this._paintChildrenView = null;
    this._childIndexView = null;
  }

  /**
   * Invalidate only the paint-order view — for a child's `zIndex` write, which
   * reorders painting but leaves document order and every child index exactly
   * as they were, so the {@link children} snapshot stays valid (and keeps its
   * documented reference stability).
   * @internal
   */
  public _invalidatePaintOrder(): void {
    this._paintChildrenView = null;
  }

  /**
   * Iterate the same frozen, cached document-order snapshot {@link children}
   * returns — mutating the container after obtaining this iterator does not
   * change what it yields (see {@link children}'s doc comment for the full
   * snapshot/invalidation contract).
   */
  public [Symbol.iterator](): IterableIterator<RenderNode> {
    return this.children[Symbol.iterator]();
  }

  /**
   * Rendered width of the whole subtree, in the node's global-transform space.
   *
   * Unlike {@link Sprite.width} — which scales an unscaled texture frame — a
   * container has no intrinsic local size, so this reads the aggregate bounds
   * directly. Those are already scaled, so multiplying by `scale` again would
   * count it twice. Writing rescales `scale.x` to make the subtree render at
   * the requested width.
   */
  public get width(): number {
    return this.getBounds().width;
  }

  public set width(value: number) {
    this._rescaleToFit('x', value, this.getBounds().width);
  }

  /** Rendered height of the whole subtree — see {@link width}. */
  public get height(): number {
    return this.getBounds().height;
  }

  public set height(value: number) {
    this._rescaleToFit('y', value, this.getBounds().height);
  }

  /**
   * Rescale one axis so the subtree's rendered extent along it becomes
   * `target`.
   *
   * `current` is a world-space measurement and therefore already linear in
   * `scale[axis]`, so the new scale is the old one times the ratio. Dividing
   * `target` by `current` instead — as if `current` were an unscaled local
   * size — makes the assigned value relate quadratically to the rendered
   * result. Going through the ratio also preserves a negative (mirrored)
   * scale, which an absolute division would silently flip.
   */
  private _rescaleToFit(axis: 'x' | 'y', target: number, current: number): void {
    // An empty container (or one collapsed to zero by a zero scale) has no
    // extent to scale from; dividing by it would poison scale with NaN or
    // Infinity, and being NaN it would never recover. Keep the current scale
    // until the subtree has a real extent.
    if (current !== 0) {
      this.scale[axis] = (this.scale[axis] * target) / current;
    }
  }

  /**
   * Leftmost edge of the subtree in the node's global-transform space.
   *
   * These four edges are read straight off the aggregate bounds so they always
   * span exactly {@link width}/{@link height} and agree with each other. They
   * cannot be reconstructed from `position` and `origin`: `origin` is in local
   * pixels and a container's own local bounds are empty, so the rendered
   * extent comes entirely from the children.
   */
  public get left(): number {
    return this.getBounds().left;
  }

  /** Topmost edge of the subtree — see {@link left}. */
  public get top(): number {
    return this.getBounds().top;
  }

  /** Rightmost edge of the subtree — see {@link left}. */
  public get right(): number {
    return this.getBounds().right;
  }

  /** Bottommost edge of the subtree — see {@link left}. */
  public get bottom(): number {
    return this.getBounds().bottom;
  }

  /**
   * Append one or more children to the end of the child list. Each child
   * is detached from its previous parent (if any) before being added.
   */
  public addChild(...children: RenderNode[]): this {
    for (const child of children) {
      this._attachChild(child, null);
    }

    return this;
  }

  /**
   * Insert `child` at `index` in the child list. The child is detached
   * from any previous parent first. Throws if `index` is out of bounds, if
   * `child` has already been `destroy()`ed, or if `child` is an ancestor of
   * this container (would create a cycle). Self-as-child is a no-op.
   *
   * When `child` already belongs to this container the call is a pure reorder:
   * the node keeps its parent, its stage and its keyboard focus.
   */
  public addChildAt(child: RenderNode, index: number): this {
    if (index < 0 || index > this._childList.length) {
      throw new Error(`The index ${index} is out of bounds ${this._childList.length}`);
    }

    return this._attachChild(child, index);
  }

  /**
   * Shared insert path for {@link addChild} and {@link addChildAt}. A `null`
   * index means "append", and the position is resolved only after the child is
   * detached from its previous parent — that detach dispatches focus and
   * interaction callbacks, i.e. arbitrary user code that can grow or shrink
   * this container's list while the insert is still in flight.
   */
  private _attachChild(child: RenderNode, index: number | null): this {
    if (child === this) {
      return this;
    }

    // Attaching an already-destroyed node used to be silent in production: it
    // rendered nothing (the collect dev-guard skips it) or replayed freed
    // state, and only a __DEV__-only warning ever fired — the check evaporated
    // in production builds while the node was linked into the tree regardless.
    // pre-1.0 favours a clean break over a use-after-destroy that half-works,
    // so this is an always-on rejection (like the cycle guard below), not a
    // dev diagnostic.
    invariant(
      !child.destroyed,
      'Container.addChild(): cannot attach a child that has already been destroy()ed — its pooled state (transform/bounds) is gone, so reusing it renders nothing or replays stale state. Create a fresh node instead of re-adding a destroyed one.',
    );

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

    if (child.parent === this) {
      return this._reorderChild(child, index);
    }

    if (child.parent) {
      child.parent.removeChild(child);
    }

    const insertAt = this._resolveInsertIndex(index);

    child._setParent(this);
    this._childList.splice(insertAt, 0, child);
    this._invalidateChildOrder();
    this.invalidateCache();
    this._markStructureDirty();

    child._invalidateSubtreeTransform();
    this._invalidateBoundsCascade();

    child._setStage(this._stage);
    this._stage?.interaction._notifyNodeAdded(child);

    return this;
  }

  /**
   * Move a node that already belongs to this container to `index`. Routing a
   * same-parent insert through `removeChild()` would tear the node off the
   * stage and blur it, so a pure reorder used to steal keyboard focus and
   * re-announce the node to the interaction manager. Neither the child's
   * transform nor the aggregate bounds change, so only the order-dependent
   * caches are invalidated.
   */
  private _reorderChild(child: RenderNode, index: number | null): this {
    removeArrayItems(this._childList, this.getChildIndex(child), 1);

    this._childList.splice(this._resolveInsertIndex(index), 0, child);
    this._invalidateChildOrder();
    this.invalidateCache();
    this._markStructureDirty();

    return this;
  }

  /** Clamp an insert position against the CURRENT list length; `null` appends. */
  private _resolveInsertIndex(index: number | null): number {
    return index === null ? this._childList.length : Math.min(index, this._childList.length);
  }

  public swapChildren(firstChild: RenderNode, secondChild: RenderNode): this {
    if (firstChild !== secondChild) {
      const firstIndex = this.getChildIndex(firstChild);
      const secondIndex = this.getChildIndex(secondChild);

      this._childList[firstIndex] = secondChild;
      this._childList[secondIndex] = firstChild;
      this._invalidateChildOrder();
      this.invalidateCache();
      this._markStructureDirty();
    }

    return this;
  }

  public getChildIndex(child: RenderNode): number {
    if (this._childIndexView === null) {
      const map = new Map<RenderNode, number>();

      for (let i = 0; i < this._childList.length; i++) {
        map.set(this._childList[i]!, i);
      }

      this._childIndexView = map;
    }
    const index = this._childIndexView.get(child);
    if (index === undefined) {
      throw new Error('Drawable is not a child of the container.');
    }
    return index;
  }

  public setChildIndex(child: RenderNode, index: number): this {
    if (index < 0 || index >= this._childList.length) {
      throw new Error(`The index ${index} is out of bounds ${this._childList.length}`);
    }

    removeArrayItems(this._childList, this.getChildIndex(child), 1);

    this._childList.splice(index, 0, child);
    this._invalidateChildOrder();
    this.invalidateCache();
    this._markStructureDirty();

    return this;
  }

  public getChildAt(index: number): RenderNode {
    if (index < 0 || index >= this._childList.length) {
      throw new Error(`getChildAt: Index (${index}) does not exist.`);
    }

    // Bounds-checked above.
    return this._childList[index]!;
  }

  /** Remove `child` from this container. No-op if not present. */
  public removeChild(child: RenderNode): this {
    const index = this._childList.indexOf(child);

    if (index !== -1) {
      this.removeChildAt(index);
    }

    return this;
  }

  public removeChildAt(index: number): this {
    const child = this._childList[index];

    removeArrayItems(this._childList, index, 1);
    // Invalidate the children-view cache immediately after the array write,
    // before any of the notify calls below can run user code (e.g. an
    // onBlur handler) that reads `container.children` — otherwise that read
    // would observe a stale snapshot still containing `child`.
    this._invalidateChildOrder();

    if (child?.parent === this) {
      // Cascade bounds up BEFORE clearing parent so the walk reaches this node.
      this._invalidateBoundsCascade();
      child._setParent(null);
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
  public removeChildren(begin = 0, end: number = this._childList.length): this {
    const range = end - begin;

    if (range < 0 || range > end) {
      throw new Error('Values are outside the acceptable range.');
    }

    if (range === 0) {
      return this;
    }

    // Cascade bounds before clearing any parent references.
    this._invalidateBoundsCascade();

    const removed = this._childList.slice(begin, end);

    // Same ordering rule as `removeChildAt`: commit the array write and drop
    // the children-view cache BEFORE any notify below can run user code (an
    // `onBlur` handler reading `container.children`). Running every notify
    // first and splicing afterwards handed that handler a list that still held
    // every node being removed.
    removeArrayItems(this._childList, begin, range);
    this._invalidateChildOrder();

    for (const child of removed) {
      if (child.parent === this) {
        child._setParent(null);
        child._invalidateSubtreeTransform();
        this._stage?.interaction._notifyNodeRemoved(child);
        this._stage?.focus._notifyNodeRemoved(child);
        child._setStage(null);
      }
    }

    this.invalidateCache();
    this._markStructureDirty();

    return this;
  }

  /**
   * @internal — whether `child` (a DIRECT child of this container) opts out of
   * this container's transform-group boundary and resolves world-space
   * transforms. Always `false` on plain containers; {@link RetainedContainer}
   * overrides it with its revision-keyed deep-barrier branch-escape set.
   * Every caller guards on the parent being an engaged boundary (or
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

    for (const child of this._childList) {
      child._setStage(stage);
    }
  }

  /**
   * @internal — a grouping node handed to `render()` gets the automatic
   * persistent render representation. Two exclusions: a transform-group
   * boundary ({@link RetainedContainer}) already owns the group-level retention
   * tier, and wrapping a second one around the same scope would fight it over
   * the scope's record target; a barrier-bearing root never reaches the plan
   * builder's group branch at all (it collects through the effect path), so
   * excluding it here just keeps the predicate honest.
   */
  public override _supportsRootRetention(): boolean {
    return !this._isTransformGroupBoundary && !this._renderPlanHasBarrierEffects();
  }

  /** @internal */
  protected override _collectContent(builder: RenderPlanBuilder): void {
    if (this._childList.length === 0) {
      return;
    }

    if (builder._isCollectingSource) {
      // Source discovery walks every child unconditionally and produces no
      // frame-local draws, so neither half of the retained-slot cache applies:
      // replaying a slot would allocate exactly the pooled `DrawCommand` and
      // transform row the discovery invariant forbids, and capturing one would
      // key this cache against a scope that never received the entries it peeks
      // for — throwing away a valid capture in the process.
      for (let index = 0; index < this._childList.length; index++) {
        // In-bounds: index < length.
        this._childList[index]!._collect(builder, index);
      }

      return;
    }

    // The cache-key accessor, deliberately not `builder.view`: reading the view
    // marks the surrounding capture view-dependent, and keying a slot cache on
    // the view is not deriving content from it.
    const viewUpdateId = builder.viewUpdateId;

    // A captured slot can no longer outlive its drawable: `SceneNode.destroy`
    // unlinks the node, and the removal stamps this container structure-dirty,
    // so a destroyed direct child always fails the key check above rather than
    // being replayed from a stale slot.
    if (this._retainedPlan?.isClean(this._contentRevision, this._structureRevision, this._transformRevision, viewUpdateId, builder.backend)) {
      this._replayRetainedChildren(builder);

      return;
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

    for (let index = 0; index < this._childList.length; index++) {
      const slot = slots[slotIndex];

      if (slot?.childIndex === index) {
        builder._replayRetainedDraw(slot);
        slotIndex++;
      } else {
        // In-bounds: index < length.
        this._childList[index]!._collect(builder, index);
      }
    }
  }

  /**
   * Slow path (today's unmodified behavior): collect every child normally,
   * then snapshot exactly the direct-Drawable children that produced a single
   * `Draw`-kind entry (a plain, non-barrier, visible Drawable) into the
   * cache's pooled retained slots for next frame's fast path: a steady-state
   * recapture allocates zero slot records.
   */
  private _collectAndCaptureChildren(builder: RenderPlanBuilder, viewUpdateId: number): void {
    let sawSlotCandidate = false;

    // Rewind an existing cache's slot pool; a cache created lazily below
    // starts already-begun.
    this._retainedPlan?._beginCapture();

    for (let index = 0; index < this._childList.length; index++) {
      // In-bounds: index < length.
      const child = this._childList[index]!;

      // Only a plain, non-barrier drawable can ever produce a retained slot
      // (exactly one Draw entry for itself). Every other child skips the
      // peek/capture bookkeeping entirely -- most containers have no direct
      // drawable children and would otherwise pay pure overhead here.
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
    const children = this._childList;

    for (let i = 0; i < children.length; i++) {
      // In-bounds: i < length.
      if (children[i]!.contains(x, y)) {
        return true;
      }
    }

    return false;
  }

  public override updateBounds(): this {
    const localBounds = this.getLocalBounds();
    // A plain container carries no geometry of its own: its local rect is the
    // empty 0x0 box at the local origin. Merging that unconditionally pins the
    // origin into every aggregate, so a container whose children all sit far
    // away would report an AABB stretching back to its own position.
    const hasLocalContent = localBounds.width !== 0 || localBounds.height !== 0;
    let hasContent = hasLocalContent;

    this._bounds.reset();

    if (hasLocalContent) {
      this._bounds.addRect(localBounds, this.getGlobalTransform());
    }

    for (const child of this._childList) {
      if (child.visible) {
        this._bounds.addRect(child.getBounds());
        hasContent = true;
      }
    }

    // Nothing contributed an extent. Fall back to the degenerate local rect so
    // the aggregate stays a real rectangle at this container's own transform —
    // handing out the untouched accumulator would leak its Infinity/-Infinity
    // seed into width/height and every edge accessor.
    if (!hasContent) {
      this._bounds.addRect(localBounds, this.getGlobalTransform());
    }

    return this;
  }

  /**
   * Destroy this container and every node beneath it.
   *
   * Ownership is by containment: detaching a subtree only unlinks it, so the
   * descendants' GPU-backed resources (cached bitmaps, filters, render
   * textures) and signal listeners would outlive the tree that owned them and
   * leak on every scene change.
   */
  public override destroy(): void {
    // Idempotent by contract, matching Texture.destroy(): re-entry would take
    // already-released pooled state through a second teardown.
    if (this.destroyed) {
      return;
    }

    // Snapshot before detaching: removeChildren() empties the live array, and a
    // child's own destroy() walks its subtree, so iterating the live list while
    // it is being mutated would skip entries.
    const children = [...this._childList];

    // Detach first, so every child leaves the interaction/focus registries and
    // drops its stage while it is still a valid node; only then tear it down.
    this.removeChildren();

    for (const child of children) {
      // A child the caller already destroyed stays destroyed — re-entering its
      // teardown would double-release resources it no longer owns.
      if (!child.destroyed) {
        child.destroy();
      }
    }

    this._retainedPlan?.invalidate();

    super.destroy();
  }
}
