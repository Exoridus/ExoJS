import { Rectangle } from 'math/Rectangle';
import { SceneNode } from './SceneNode';
import { defaultQuadTreeMaxLevel, defaultQuadTreeMaxObjects } from "const/defaults";

export class Quadtree {

    public readonly bounds: Rectangle;
    public readonly level: number;
    private _nodes: Map<number, Quadtree> = new Map();
    private _children: Set<SceneNode> = new Set();

    constructor(bounds: Rectangle, level = 0) {
        this.bounds = (bounds && bounds.clone()) || new Rectangle();
        this.level = level;
    }

    get nodes(): Map<number, Quadtree> {
        return this._nodes;
    }

    get children(): Set<SceneNode> {
        return this._children;
    }

    clear(): this {
        for (const node of this._nodes.values()) {
            node.clear();
        }

        this._nodes.clear();
        this._children.clear();

        return this;
    }

    insert(child: SceneNode): this {
        const children = this._children;
        const node = this._getNode(child);

        if (node) {
            node.insert(child);

            return this;
        }

        children.add(child);

        if ((children.size > defaultQuadTreeMaxObjects) && (this.level < defaultQuadTreeMaxLevel)) {
            this._split();

            for (const child of children) {
                const node = this._getNode(child);

                if (node) {
                    children.delete(child);
                    node.insert(child);
                }
            }
        }

        return this;
    }

    getRelatedChildren(child: SceneNode): Array<SceneNode> {
        const node = this._getNode(child);

        return node ? [...node.getRelatedChildren(child), ...this._children] : [...this._children];
    }

    destroy() {
        this.bounds.destroy();
        this._nodes.clear();
        this._children.clear();
    }

    _split() {
        if (!this._nodes.size) {
            return;
        }

        const rect = Rectangle.Temp,
            nodeLevel = this.level + 1,
            bounds = this.bounds,
            width = (bounds.width / 2) | 0,
            height = (bounds.height / 2) | 0,
            left = bounds.left,
            top = bounds.top,
            right = left + width,
            bottom = top + height;

        this._nodes
            .set(0, new Quadtree(rect.set(left, top, width, height), nodeLevel))
            .set(1, new Quadtree(rect.set(right, top, width, height), nodeLevel))
            .set(2, new Quadtree(rect.set(left, bottom, width, height), nodeLevel))
            .set(3, new Quadtree(rect.set(right, bottom, width, height), nodeLevel));
    }

    _getNode(child: SceneNode): Quadtree | null {
        const bounds = child.getBounds();

        for (const node of this._nodes.values()) {
            if (bounds.containsRect(node.bounds)) {
                return node;
            }
        }

        return null;
    }
}
