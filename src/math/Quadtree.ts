import { Rectangle } from './Rectangle';

export interface QuadtreeItem<T> {
    bounds: Rectangle;
    payload: T;
}

export class Quadtree<T> {
    private readonly _bounds: Rectangle;
    private readonly _maxItems: number;
    private readonly _maxDepth: number;
    private readonly _depth: number;
    private _items: Array<QuadtreeItem<T>>;
    private _children: [Quadtree<T>, Quadtree<T>, Quadtree<T>, Quadtree<T>] | null;

    public constructor(bounds: Rectangle, maxItems: number = 8, maxDepth: number = 5, depth: number = 0) {
        this._bounds = bounds;
        this._maxItems = maxItems;
        this._maxDepth = maxDepth;
        this._depth = depth;
        this._items = [];
        this._children = null;
    }

    public insert(item: QuadtreeItem<T>): void {
        // If not subdivided and under capacity, store here.
        if (this._children === null && this._items.length < this._maxItems) {
            this._items.push(item);
            return;
        }

        // Subdivide if we haven't yet and depth allows.
        if (this._children === null && this._depth < this._maxDepth) {
            this._subdivide();
        }

        // Try to push into a single child whose bounds fully contain the item.
        if (this._children !== null) {
            for (const child of this._children) {
                if (child._bounds.containsRect(item.bounds)) {
                    child.insert(item);
                    return;
                }
            }
        }

        // No single child fully contains it — keep at this node.
        this._items.push(item);
    }

    public queryPoint(x: number, y: number, results: Array<QuadtreeItem<T>> = []): Array<QuadtreeItem<T>> {
        if (!this._bounds.contains(x, y)) {
            return results;
        }

        for (const item of this._items) {
            if (item.bounds.contains(x, y)) {
                results.push(item);
            }
        }

        if (this._children !== null) {
            for (const child of this._children) {
                child.queryPoint(x, y, results);
            }
        }

        return results;
    }

    public queryRect(rect: Rectangle, results: Array<QuadtreeItem<T>> = []): Array<QuadtreeItem<T>> {
        // Check intersection using left/right/top/bottom comparisons to avoid
        // needing a full Rectangle.intersectsWith() call with collision dispatch.
        if (
            rect.right < this._bounds.left
            || rect.left > this._bounds.right
            || rect.bottom < this._bounds.top
            || rect.top > this._bounds.bottom
        ) {
            return results;
        }

        for (const item of this._items) {
            if (
                !(item.bounds.right < rect.left
                || item.bounds.left > rect.right
                || item.bounds.bottom < rect.top
                || item.bounds.top > rect.bottom)
            ) {
                results.push(item);
            }
        }

        if (this._children !== null) {
            for (const child of this._children) {
                child.queryRect(rect, results);
            }
        }

        return results;
    }

    public clear(): void {
        this._items.length = 0;

        if (this._children !== null) {
            for (const child of this._children) {
                child.clear();
            }

            this._children = null;
        }
    }

    public destroy(): void {
        this._items.length = 0;
        this._bounds.destroy();

        if (this._children !== null) {
            for (const child of this._children) {
                child.destroy();
            }

            this._children = null;
        }
    }

    private _subdivide(): void {
        const { x, y, width, height } = this._bounds;
        const halfW = width / 2;
        const halfH = height / 2;
        const depth = this._depth + 1;
        const maxItems = this._maxItems;
        const maxDepth = this._maxDepth;

        this._children = [
            // NW
            new Quadtree<T>(new Rectangle(x, y, halfW, halfH), maxItems, maxDepth, depth),
            // NE
            new Quadtree<T>(new Rectangle(x + halfW, y, halfW, halfH), maxItems, maxDepth, depth),
            // SW
            new Quadtree<T>(new Rectangle(x, y + halfH, halfW, halfH), maxItems, maxDepth, depth),
            // SE
            new Quadtree<T>(new Rectangle(x + halfW, y + halfH, halfW, halfH), maxItems, maxDepth, depth),
        ];
    }
}
