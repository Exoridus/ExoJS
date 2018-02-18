import Rectangle from '../types/Rectangle';
import settings from '../settings';

/**
 * @class Quadtree
 */
export default class Quadtree {

    /**
     * @constructor
     * @param {Rectangle} bounds
     * @param {Number} [level=0]
     */
    constructor(bounds, level = 0) {

        /**
         * @private
         * @member {Rectangle}
         */
        this._bounds = (bounds && bounds.clone()) || new Rectangle();

        /**
         * @private
         * @member {Number}
         */
        this._level = level;

        /**
         * @private
         * @member {Map<Number, Quadtree>}
         */
        this._nodes = new Map();

        /**
         * @private
         * @member {Set<SceneNode>}
         */
        this._children = new Set();
    }

    /**
     * @public
     * @readonly
     * @member {Rectangle}
     */
    get bounds() {
        return this._bounds;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get level() {
        return this._level;
    }

    /**
     * @public
     * @readonly
     * @member {Map<Number, Quadtree>}
     */
    get nodes() {
        return this._nodes;
    }

    /**
     * @public
     * @readonly
     * @member {Set<SceneNode>}
     */
    get children() {
        return this._children;
    }

    /**
     * @public
     * @chainable
     * @returns {Quadtree}
     */
    clear() {
        for (const node of this._nodes.values()) {
            node.clear();
        }

        this._nodes.clear();
        this._children.clear();

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {SceneNode} child
     * @returns {Quadtree}
     */
    insert(child) {
        const children = this._children,
            node = this._getNode(child);

        if (node) {
            node.insert(child);

            return this;
        }

        children.add(child);

        if ((children.size > settings.QUAD_TREE_MAX_OBJECTS) && (this._level < settings.QUAD_TREE_MAX_LEVEL)) {
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

    /**
     * @public
     * @param {SceneNode} child
     * @returns {SceneNode[]}
     */
    getRelatedChildren(child) {
        const node = this._getNode(child);

        return node ? [...node.getRelatedChildren(child), ...this._children] : [...this._children];
    }

    /**
     * @public
     */
    destroy() {
        this._bounds.destroy();
        this._bounds = null;

        this._nodes.clear();
        this._nodes = null;

        this._children.clear();
        this._children = null;

        this._level = null;
    }

    /**
     * @private
     */
    _split() {
        if (!this._nodes.size) {
            return;
        }

        const rect = Rectangle.Temp,
            nodeLevel = this._level + 1,
            bounds = this._bounds,
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

    /**
     * @private
     * @param {SceneNode} child
     * @returns {?Quadtree}
     */
    _getNode(child) {
        const bounds = child.getBounds();

        for (const node of this._nodes.values()) {
            if (bounds.containsRect(node.getBounds())) {
                return node;
            }
        }

        return null;
    }
}
