import { removeArrayItems } from 'core/utils';
import type { SceneRenderRuntime } from './SceneRenderRuntime';
import type { SceneNode } from 'core/SceneNode';
import { RenderNode } from './RenderNode';

export class Container extends RenderNode {

    private readonly _children: Array<SceneNode> = [];
    private _sortableChildren = false;
    private _sortDirty = false;
    private _nextChildOrder = 0;

    public get children(): Array<SceneNode> {
        return this._children;
    }

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
        return Math.abs(this.scale.x) * this.bounds.width;
    }

    public set width(value: number) {
        this.scale.x = value / this.bounds.width;
    }

    public get height(): number {
        return Math.abs(this.scale.y) * this.bounds.height;
    }

    public set height(value: number) {
        this.scale.y = value / this.bounds.height;
    }

    public get left(): number {
        return this.x - (this.width * this.origin.x);
    }

    public get top(): number {
        return this.y - (this.height * this.origin.y);
    }

    public get right(): number {
        return (this.x + this.width - this.origin.x);
    }

    public get bottom(): number {
        return (this.y + this.height - this.origin.y);
    }

    public addChild(child: SceneNode): this {
        return this.addChildAt(child, this._children.length);
    }

    public addChildAt(child: SceneNode, index: number): this {
        if (index < 0 || index > this._children.length) {
            throw new Error(`The index ${index} is out of bounds ${this._children.length}`);
        }

        if (child === this) {
            return this;
        }

        if (child.parentNode) {
            child.parentNode.removeChild(child);
        }

        child.parentNode = this;
        child.setChildOrder(this._nextChildOrder++);

        this._children.splice(index, 0, child);
        this.markSortDirty();
        this.invalidateCache();

        return this;
    }

    public swapChildren(firstChild: SceneNode, secondChild: SceneNode): this {
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

    public getChildIndex(child: SceneNode): number {
        const index = this._children.indexOf(child);

        if (index === -1) {
            throw new Error('Drawable is not a child of the container.');
        }

        return index;
    }

    public setChildIndex(child: SceneNode, index: number): this {
        if (index < 0 || index >= this._children.length) {
            throw new Error(`The index ${index} is out of bounds ${this._children.length}`);
        }

        removeArrayItems(this._children, this.getChildIndex(child), 1);

        this._children.splice(index, 0, child);
        this.markSortDirty();
        this.invalidateCache();

        return this;
    }

    public getChildAt(index: number): SceneNode {
        if (index < 0 || index >= this._children.length) {
            throw new Error(`getChildAt: Index (${index}) does not exist.`);
        }

        return this._children[index];
    }

    public removeChild(child: SceneNode): this {
        const index = this._children.indexOf(child);

        if (index !== -1) {
            this.removeChildAt(index);
        }

        return this;
    }

    public removeChildAt(index: number): this {
        const child = this._children[index];

        removeArrayItems(this._children, index, 1);

        if (child && child.parentNode === this) {
            child.parentNode = null;
        }

        this.markSortDirty();
        this.invalidateCache();

        return this;
    }

    public removeChildren(begin = 0, end: number = this._children.length): this {
        const range = (end - begin);

        if (range < 0 || range > end) {
            throw new Error('Values are outside the acceptable range.');
        }

        for (let i = begin; i < end; i++) {
            const child = this._children[i];

            if (child && child.parentNode === this) {
                child.parentNode = null;
            }
        }

        removeArrayItems(this._children, begin, range);
        this.markSortDirty();
        this.invalidateCache();

        return this;
    }

    public render(renderManager: SceneRenderRuntime): this {
        if (this.visible && this.inView(renderManager.view)) {
            this.renderVisualContent(renderManager, () => {
                this._sortChildrenIfNeeded();

                for (const child of this._children) {
                    child.render(renderManager);
                }
            });
        }

        return this;
    }

    public contains(x: number, y: number): boolean {
        return this._children.some((child) => child.contains(x, y));
    }

    public updateBounds(): this {
        this._bounds.reset()
            .addRect(this.getLocalBounds(), this.getGlobalTransform());

        for (const child of this._children) {
            if (child.visible) {
                this._bounds.addRect(child.getBounds());
            }
        }

        return this;
    }

    public destroy(): void {
        this.removeChildren();

        super.destroy();
    }

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
