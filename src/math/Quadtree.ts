import { Rectangle } from './Rectangle';

/** An item stored in a {@link Quadtree}. Carries an axis-aligned bounding box and an arbitrary `payload`. */
export interface QuadtreeItem<T> {
    bounds: Rectangle;
    payload: T;
}

/**
 * Generic recursive spatial index used by the engine's `InteractionManager`
 * to accelerate per-frame hit-testing of scene nodes.
 *
 * Items are inserted with their axis-aligned bounding box; the tree
 * automatically subdivides into four quadrants (NW/NE/SW/SE) when a node
 * accumulates more than `maxItems` entries and the current depth is below
 * `maxDepth`. Items that span multiple quadrants are kept at the current node
 * rather than duplicated.
 *
 * The tree is persistent: `insert` and `remove` modify the tree in place
 * without full rebuilds. Call `clear()` for bulk reset, or `destroy()` to
 * release all memory including child rectangles.
 *
 * @example
 * ```ts
 * const qt = new Quadtree<SceneNode>(new Rectangle(0, 0, 1920, 1080));
 * qt.insert({ bounds: node.getBounds(), payload: node });
 * const hits = qt.queryPoint(mouseX, mouseY);
 * ```
 */
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

    /**
     * Insert `item` into the tree. If this node is full and below `maxDepth`,
     * it subdivides first. Items whose bounds span multiple child quadrants are
     * stored at the current node to avoid duplication.
     */
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

    /**
     * Returns all items whose bounds contain the point `(x, y)`.
     *
     * The optional `results` parameter allows callers to provide a
     * pre-allocated array that will be reused across calls. The array is
     * **appended to** (not replaced), so callers should reset it (e.g.
     * `buf.length = 0`) before passing it in when a fresh result set is
     * needed. The same array reference is returned.
     *
     * Omitting `results` allocates a new array on every call. For
     * hot paths (e.g. per-frame hit-testing) prefer passing a persistent
     * buffer to avoid allocation pressure.
     */
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

    /**
     * Return all items whose bounds overlap the axis-aligned `rect`.
     *
     * Same reuse semantics as {@link queryPoint}: pass a persistent buffer and
     * reset it (`buf.length = 0`) before each call to avoid allocations on hot
     * paths.
     */
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

    /**
     * Remove the first occurrence of `item` from this subtree by object
     * identity. Returns `true` if the item was found and removed, `false`
     * otherwise. This is an O(n) walk of every node in the affected
     * subtree; prefer `clear()` for bulk removal.
     */
    public remove(item: QuadtreeItem<T>): boolean {
        const index = this._items.indexOf(item);

        if (index !== -1) {
            this._items.splice(index, 1);

            return true;
        }

        if (this._children !== null) {
            for (const child of this._children) {
                if (child.remove(item)) {
                    return true;
                }
            }
        }

        return false;
    }

    /** Remove all items and collapse all child nodes. Child `Quadtree` instances are retained but reset. */
    public clear(): void {
        this._items.length = 0;

        if (this._children !== null) {
            for (const child of this._children) {
                child.clear();
            }

            this._children = null;
        }
    }

    /**
     * Walk every subdivided region's bounding rectangle, calling `callback`
     * once per node in the tree (including the root). Used by
     * {@link HitTestLayer} to visualise quadtree partitioning. Not part of
     * the stable public API — friend-class access only.
     *
     * @internal
     */
    public _walkBounds(callback: (rect: Rectangle) => void): void {
        callback(this._bounds);

        if (this._children !== null) {
            for (const child of this._children) {
                child._walkBounds(callback);
            }
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
