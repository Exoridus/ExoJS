import { Drawable } from './Drawable';
import { removeArrayItems } from 'utils/core';
import type { RenderManager } from './RenderManager';

export class Container extends Drawable {

    private readonly _children: Array<Drawable> = [];

    public get children(): Array<Drawable> {
        return this._children;
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

    public addChild(child: Drawable): this {
        return this.addChildAt(child, this._children.length);
    }

    public addChildAt(child: Drawable, index: number): this {
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

    public swapChildren(firstChild: Drawable, secondChild: Drawable): this {
        if (firstChild !== secondChild) {
            this._children[this.getChildIndex(firstChild)] = secondChild;
            this._children[this.getChildIndex(secondChild)] = firstChild;
        }

        return this;
    }

    public getChildIndex(child: Drawable): number {
        const index = this._children.indexOf(child);

        if (index === -1) {
            throw new Error('Drawable is not a child of the container.');
        }

        return index;
    }

    public setChildIndex(child: Drawable, index: number): this {
        if (index < 0 || index >= this._children.length) {
            throw new Error(`The index ${index} is out of bounds ${this._children.length}`);
        }

        removeArrayItems(this._children, this.getChildIndex(child), 1);

        this._children.splice(index, 0, child);

        return this;
    }

    public getChildAt(index: number): Drawable {
        if (index < 0 || index >= this._children.length) {
            throw new Error(`getChildAt: Index (${index}) does not exist.`);
        }

        return this._children[index];
    }

    public removeChild(child: Drawable): this {
        const index = this._children.indexOf(child);

        if (index !== -1) {
            this.removeChildAt(index);
        }

        return this;
    }

    public removeChildAt(index: number): this {
        removeArrayItems(this._children, index, 1);

        return this;
    }

    public removeChildren(begin = 0, end: number = this._children.length): this {
        const range = (end - begin);

        if (range < 0 || range > end) {
            throw new Error('Values are outside the acceptable range.');
        }

        removeArrayItems(this._children, begin, range);

        return this;
    }

    public render(renderManager: RenderManager): this {
        if (this.visible && this.inView(renderManager.view)) {
            for (const child of this._children) {
                child.render(renderManager);
            }
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
        super.destroy();

        this._children.length = 0;
    }
}
