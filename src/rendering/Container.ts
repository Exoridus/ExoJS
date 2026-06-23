import type { Stage } from '#core/Stage';
import { removeArrayItems } from '#core/utils';
import type { RenderPlanBuilder } from '#rendering/plan/RenderPlanBuilder';

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
  private readonly _children: RenderNode[] = [];

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

    if (child.parent) {
      child.parent.removeChild(child);
    }

    child.parent = this;
    this._children.splice(index, 0, child);
    this.invalidateCache();

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

    return this;
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

    for (let index = 0; index < this._children.length; index++) {
      // In-bounds: index < length.
      this._children[index]!._collect(builder, index);
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
}
