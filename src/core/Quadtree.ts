import { Rectangle } from 'math/Rectangle';
import type { SceneNode } from './SceneNode';
import type { IDestroyable, IWithBoundingBox } from 'types/types';

export class Quadtree implements IWithBoundingBox, IDestroyable {

    public static maxSceneNodes = 50;
    public static maxLevel = 5;

    public readonly level: number;

    private readonly _bounds: Rectangle;
    private readonly _quadTrees: Map<number, Quadtree> = new Map();
    private readonly _sceneNodes: Set<SceneNode> = new Set();

    public constructor(bounds: Rectangle, level = 0) {
        this._bounds = bounds.clone();
        this.level = level;
    }

    public addSceneNode(sceneNode: SceneNode): this {
        const quadTree = this._getQuadTree(sceneNode);

        if (quadTree) {
            quadTree.addSceneNode(sceneNode);

            return this;
        }

        this._sceneNodes.add(sceneNode);

        if (this._sceneNodes.size > Quadtree.maxSceneNodes && this.level < Quadtree.maxLevel) {
            this._split();
        }

        return this;
    }

    public getRelatedChildren(sceneNode: SceneNode): Array<SceneNode> {
        const quadTree = this._getQuadTree(sceneNode);

        if (quadTree === null) {
            return [...this._sceneNodes];
        }

        return [...quadTree.getRelatedChildren(sceneNode), ...this._sceneNodes];
    }

    public getBounds(): Rectangle {
        return this._bounds;
    }

    public clear(): this {
        if (this._quadTrees.size > 0) {
            for (const quadTree of this._quadTrees.values()) {
                quadTree.destroy();
            }

            this._quadTrees.clear();
        }

        this._sceneNodes.clear();

        return this;
    }

    public destroy(): void {
        this.clear();
        this._bounds.destroy();
    }

    private _getQuadTree(sceneNode: SceneNode): Quadtree | null {
        if (this._quadTrees.size > 0) {
            const bounds = sceneNode.getBounds();

            for (const quadTree of this._quadTrees.values()) {
                if (quadTree.getBounds().containsRect(bounds)) {
                    return quadTree;
                }
            }
        }

        return null;
    }

    private _split(): void {
        if (this._quadTrees.size === 0) {
            const { top, left, width, height } = this.getBounds();
            const halfWidth = (width / 2) | 0;
            const halfHeight = (height / 2) | 0;
            const nextLevel = this.level + 1;

            this._quadTrees.set(0, new Quadtree(Rectangle.temp.set(left, top, halfWidth, halfHeight), nextLevel));
            this._quadTrees.set(1, new Quadtree(Rectangle.temp.set(left + halfWidth, top, halfWidth, halfHeight), nextLevel));
            this._quadTrees.set(2, new Quadtree(Rectangle.temp.set(left, top + halfHeight, halfWidth, halfHeight), nextLevel));
            this._quadTrees.set(3, new Quadtree(Rectangle.temp.set(left + halfWidth, top + halfHeight, halfWidth, halfHeight), nextLevel));
        }

        this._passSceneNodesToQuadTrees();
    }

    private _passSceneNodesToQuadTrees(): void {
        for (const sceneNode of this._sceneNodes) {
            const quadTree = this._getQuadTree(sceneNode);

            if (quadTree) {
                this._sceneNodes.delete(sceneNode);
                quadTree.addSceneNode(sceneNode);
            }
        }
    }
}
