import { Drawable } from './Drawable';
import { removeArrayItems } from 'utils/core';
import type { RenderManager } from './RenderManager';

export class Container extends Drawable {

    private readonly _children: Array<Drawable> = [];

    get children(): Array<Drawable> {
        return this._children;
    }

    get width(): number {
        return Math.abs(this.scale.x) * this.bounds.width;
    }

    set width(value: number) {
        this.scale.x = value / this.bounds.width;
    }

    get height(): number {
        return Math.abs(this.scale.y) * this.bounds.height;
    }

    set height(value: number) {
        this.scale.y = value / this.bounds.height;
    }

    get left(): number {
        return this.x - (this.width * this.origin.x);
    }

    get top(): number {
        return this.y - (this.height * this.origin.y);
    }

    get right(): number {
        return (this.x + this.width - this.origin.x);
    }

    get bottom(): number {
        return (this.y + this.height - this.origin.y);
    }

    addChild(child: Drawable): this {
        return this.addChildAt(child, this._children.length);
    }

    addChildAt(child: Drawable, index: number): this {
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

        return this;
    }

    swapChildren(firstChild: Drawable, secondChild: Drawable): this {
        if (firstChild !== secondChild) {
            this._children[this.getChildIndex(firstChild)] = secondChild;
            this._children[this.getChildIndex(secondChild)] = firstChild;
        }

        return this;
    }

    getChildIndex(child: Drawable): number {
        const index = this._children.indexOf(child);

        if (index === -1) {
            throw new Error('Drawable is not a child of the container.');
        }

        return index;
    }

    setChildIndex(child: Drawable, index: number): this {
        if (index < 0 || index >= this._children.length) {
            throw new Error(`The index ${index} is out of bounds ${this._children.length}`);
        }

        removeArrayItems(this._children, this.getChildIndex(child), 1);

        this._children.splice(index, 0, child);

        return this;
    }

    getChildAt(index: number): Drawable {
        if (index < 0 || index >= this._children.length) {
            throw new Error(`getChildAt: Index (${index}) does not exist.`);
        }

        return this._children[index];
    }

    removeChild(child: Drawable): this {
        const index = this._children.indexOf(child);

        if (index !== -1) {
            this.removeChildAt(index);
        }

        return this;
    }

    removeChildAt(index: number): this {
        removeArrayItems(this._children, index, 1);

        return this;
    }

    removeChildren(begin = 0, end: number = this._children.length): this {
        const range = (end - begin);

        if (range < 0 || range > end) {
            throw new Error('Values are outside the acceptable range.');
        }

        removeArrayItems(this._children, begin, range);

        return this;
    }

    render(renderManager: RenderManager): this {
        if (this.visible && this.inView(renderManager.view)) {
            for (const child of this._children) {
                child.render(renderManager);
            }
        }

        return this;
    }

    contains(x: number, y: number): boolean {
        return this._children.some((child) => child.contains(x, y));
    }

    updateBounds(): this {
        this._bounds.reset()
            .addRect(this.getLocalBounds(), this.getGlobalTransform());

        for (const child of this._children) {
            if (child.visible) {
                this._bounds.addRect(child.getBounds());
            }
        }

        return this;
    }

    destroy(): void {
        super.destroy();

        this._children.length = 0;
    }
}
