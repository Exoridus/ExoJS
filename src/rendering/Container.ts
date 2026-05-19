import { removeArrayItems } from '@/core/utils';
import { _getCurrentInteractionManager } from '@/input/interaction-hooks';

import type { RenderBackend } from './RenderBackend';
import { RenderNode } from './RenderNode';

/**
 * Scene-graph node that owns child {@link RenderNode}s. Renders its
 * subtree in document order, optionally re-sorted each frame by
 * `zIndex` + child-add-order when {@link Container.sortableChildren} is
 * enabled.
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
 */
export class Container extends RenderNode {
  private readonly _children: RenderNode[] = [];
  private _sortableChildren = false;
  private _sortDirty = false;
  private _nextChildOrder = 0;

  public get children(): RenderNode[] {
    return this._children;
  }

  /**
   * When `true`, children are re-sorted by `zIndex` (ascending; ties
   * broken by add-order) before each render. Disabled by default to
   * avoid the per-frame sort cost; enable on the few containers where
   * z-ordering matters.
   */
  public get sortableChildren(): boolean {
    return this._sortableChildren;
  }

  public set sortableChildren(sortableChildren: boolean) {
    if (this._sortableChildren !== sortableChildren) {
      this._sortableChildren = sortableChildren;
      this._sortDirty = sortableChildren;
    }
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

    if (child.parent) {
      child.parent.removeChild(child);
    }

    child.parent = this;
    child.setChildOrder(this._nextChildOrder++);

    this._children.splice(index, 0, child);
    this.markSortDirty();
    this.invalidateCache();

    child._invalidateSubtreeTransform();
    this._invalidateBoundsCascade();

    _getCurrentInteractionManager()?._notifyNodeAdded(child);

    return this;
  }

  public swapChildren(firstChild: RenderNode, secondChild: RenderNode): this {
    if (firstChild !== secondChild) {
      const firstIndex = this.getChildIndex(firstChild);
      const secondIndex = this.getChildIndex(secondChild);

      this._children[firstIndex] = secondChild;
      this._children[secondIndex] = firstChild;
      this.markSortDirty();
      this.invalidateCache();
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
    this.markSortDirty();
    this.invalidateCache();

    return this;
  }

  public getChildAt(index: number): RenderNode {
    if (index < 0 || index >= this._children.length) {
      throw new Error(`getChildAt: Index (${index}) does not exist.`);
    }

    return this._children[index];
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
      _getCurrentInteractionManager()?._notifyNodeRemoved(child);
    }

    this.markSortDirty();
    this.invalidateCache();

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
        _getCurrentInteractionManager()?._notifyNodeRemoved(child);
      }
    }

    removeArrayItems(this._children, begin, range);
    this.markSortDirty();
    this.invalidateCache();

    return this;
  }

  public override render(backend: RenderBackend): this {
    if (!this.visible || this._children.length === 0) {
      return this;
    }

    if (!this.inView(backend.view)) {
      backend.stats.culledNodes++;

      return this;
    }

    this.renderVisualContent(backend, () => {
      this._sortChildrenIfNeeded();

      for (const child of this._children) {
        child.render(backend);
      }
    });

    return this;
  }

  public override contains(x: number, y: number): boolean {
    return this._children.some(child => child.contains(x, y));
  }

  protected override _invalidateChildrenTransform(): void {
    for (const child of this._children) {
      child._invalidateSubtreeTransform();
    }
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

    super.destroy();
  }

  /**
   * Flag the child list as needing a re-sort before next render. Called
   * automatically by `addChild*`, `removeChild*`, `swapChildren`, and
   * `setChildIndex`; expose for callers that mutate `zIndex` directly.
   */
  public markSortDirty(): this {
    if (this._sortableChildren) {
      this._sortDirty = true;
    }

    return this;
  }

  public sortChildren(): this {
    if (!this._sortableChildren || !this._sortDirty || this._children.length <= 1) {
      this._sortDirty = false;

      return this;
    }

    this._children.sort((left, right) => {
      if (left.zIndex === right.zIndex) {
        return left.childOrder - right.childOrder;
      }

      return left.zIndex - right.zIndex;
    });
    this._sortDirty = false;
    this.invalidateCache();

    return this;
  }

  private _sortChildrenIfNeeded(): void {
    if (this._sortableChildren && this._sortDirty) {
      this.sortChildren();
    }
  }
}
