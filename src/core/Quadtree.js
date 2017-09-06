import {QUAD_TREE_MAX_LEVEL, QUAD_TREE_MAX_ENTITIES} from '../const';
import Rectangle from './Rectangle';

/**
 * @class Quadtree
 * @memberof Exo
 */
export default class Quadtree {

    /**
     * @constructor
     * @param {Exo.Rectangle} bounds
     * @param {Number} [level=0]
     */
    constructor(bounds, level = 0) {

        /**
         * @private
         * @member {Exo.Rectangle}
         */
        this._bounds = bounds.clone();

        /**
         * @private
         * @member {Number}
         */
        this._level = level;

        /**
         * @private
         * @member {Map.<Number, Exo.Quadtree>}
         */
        this._children = new Map();

        /**
         * @private
         * @member {Set.<Object>}
         */
        this._entities = new Set();
    }

    /**
     * @public
     * @readonly
     * @member {Exo.Rectangle}
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
     * @member {Map.<Number, Exo.Quadtree>}
     */
    get children() {
        return this._children;
    }

    /**
     * @public
     * @readonly
     * @member {Set.<Object>}
     */
    get entities() {
        return this._entities;
    }

    /**
     * @public
     * @chainable
     * @returns {Exo.Quadtree}
     */
    clear() {
        for (const quadtree of this._children) {
            quadtree.clear();
        }
        this._children.clear();
        this._entities.clear();

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Object} entity
     * @returns {Exo.Quadtree}
     */
    insert(entity) {
        const entities = this._entities,
            childNode = this._getChildNode(entity);

        if (childNode) {
            childNode.insert(entity);

            return this;
        }

        entities.add(entity);

        if ((entities.size > QUAD_TREE_MAX_ENTITIES) && (this._level < QUAD_TREE_MAX_LEVEL)) {
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
     * @returns {?Exo.Quadtree}
     */
    _getChildNode(entity) {
        const children = this._children,
            length = children.size,
            bounds = entity.getBounds();

        for (let i = 0; i < length; i++) {
            const child = children.get(i);

            if (child.bounds.contains(bounds)) {
                return child;
            }
        }

        return null;
    }

    /**
     * @private
     * @param {Object} entity
     * @returns {?Exo.Quadtree}
     */
    _getChildNode(entity) {
        const children = this._children,
            bounds = this._bounds,
            horizontalCenter = bounds.x + (bounds.width / 2),
            verticalCenter = bounds.y + (bounds.height / 2),
            topQuadrant = (entity.top < verticalCenter) && (entity.bottom < verticalCenter),
            bottomQuadrant = (entity.top > horizontalCenter);

        if (!children.size || (!topQuadrant && !bottomQuadrant)) {
            return null;
        }

        if ((entity.left < horizontalCenter) && (entity.right < horizontalCenter)) {
            return topQuadrant ? children.get(0) : children.get(2);
        } else if (entity.left > horizontalCenter) {
            return topQuadrant ? children.get(1) : children.get(3);
        }

        return null;
    }
}