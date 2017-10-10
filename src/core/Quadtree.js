import Rectangle from './shape/Rectangle';
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
        this._bounds = bounds.clone();

        /**
         * @private
         * @member {Number}
         */
        this._level = level;

        /**
         * @private
         * @member {Map<Number, Quadtree>}
         */
        this._children = new Map();

        /**
         * @private
         * @member {Set<Object>}
         */
        this._entities = new Set();
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
    get children() {
        return this._children;
    }

    /**
     * @public
     * @readonly
     * @member {Set<Object>}
     */
    get entities() {
        return this._entities;
    }

    /**
     * @public
     * @chainable
     * @returns {Quadtree}
     */
    clear() {
        for (const child of this._children.values()) {
            child.clear();
        }

        this._children.clear();
        this._entities.clear();

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Object} entity
     * @returns {Quadtree}
     */
    insert(entity) {
        const entities = this._entities,
            childNode = this._getChildNode(entity);

        if (childNode) {
            childNode.insert(entity);

            return this;
        }

        entities.add(entity);

        if ((entities.size > settings.QUAD_TREE_MAX_ENTITIES) && (this._level < settings.QUAD_TREE_MAX_LEVEL)) {
            this._split();

            for (const entity of entities) {
                const childNode = this._getChildNode(entity);

                if (childNode) {
                    entities.delete(entity);
                    childNode.insert(entity);
                }
            }
        }

        return this;
    }

    /**
     * @public
     * @param {Object} entity
     * @returns {Object[]}
     */
    getRelatedEntities(entity) {
        const childNode = this._getChildNode(entity);

        return childNode ? [...childNode.getRelatedEntities(entity), ...this._entities] : [...this._entities];
    }

    /**
     * @public
     */
    destroy() {
        this._bounds.destroy();
        this._bounds = null;

        this._children.clear();
        this._children = null;

        this._entities.clear();
        this._entities = null;

        this._level = null;
    }

    /**
     * @private
     */
    _split() {
        if (this._children.size) {
            return;
        }

        const bounds = this._bounds,
            childLevel = this._level + 1,
            childWidth = (bounds.width / 2) | 0,
            childHeight = (bounds.height / 2) | 0,
            x = bounds.x,
            y = bounds.y;

        this._children
            .set(0, new Quadtree(new Rectangle(x, y, childWidth, childHeight), childLevel))
            .set(1, new Quadtree(new Rectangle(x + childWidth, y, childWidth, childHeight), childLevel))
            .set(2, new Quadtree(new Rectangle(x, y + childHeight, childWidth, childHeight), childLevel))
            .set(3, new Quadtree(new Rectangle(x + childWidth, y + childHeight, childWidth, childHeight), childLevel));
    }

    /**
     * @private
     * @param {Object} entity
     * @returns {?Quadtree}
     */
    _getChildNode(entity) {
        const bounds = entity.getBounds();

        for (const child of this._children.values()) {
            if (bounds.containsRect(child.getBounds())) {
                return child;
            }
        }

        return null;
    }
}
