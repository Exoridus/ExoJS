import Renderable from './Renderable';
import { removeItems } from '../utils';

/**
 * @class Container
 * @extends {Renderable}
 */
export default class Container extends Renderable {

    /**
     * @constructor
     */
    constructor() {
        super();

        /**
         * @private
         * @member {Renderable[]}
         */
        this._children = [];
    }

    /**
     * @public
     * @readonly
     * @member {Renderable[]}
     */
    get children() {
        return this._children;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get width() {
        return this.getBounds().width;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get height() {
        return this.getBounds().height;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get left() {
        return (this.x - this.width + this.origin.x);
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get top() {
        return (this.y - this.height + this.origin.y);
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get right() {
        return (this.x + this.width + this.origin.x);
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get bottom() {
        return (this.y + this.height + this.origin.y);
    }

    /**
     * @public
     * @chainable
     * @param {Renderable} child
     * @returns {Container}
     */
    addChild(child) {
        return this.addChildAt(child, this._children.length);
    }

    /**
     * @public
     * @chainable
     * @param {Renderable} child
     * @param {Number} index
     * @returns {Container}
     */
    addChildAt(child, index) {
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

    /**
     * @public
     * @chainable
     * @param {Renderable} firstChild
     * @param {Renderable} secondChild
     * @returns {Container}
     */
    swapChildren(firstChild, secondChild) {
        if (firstChild !== secondChild) {
            this._children[this.getChildIndex(firstChild)] = secondChild;
            this._children[this.getChildIndex(secondChild)] = firstChild;
        }

        return this;
    }

    /**
     * @public
     * @param {Renderable} child
     * @returns {Number}
     */
    getChildIndex(child) {
        const index = this._children.indexOf(child);

        if (index === -1) {
            throw new Error('Renderable is not a child of the container.');
        }

        return index;
    }

    /**
     * @public
     * @chainable
     * @param {Renderable} child
     * @param {Number} index
     * @returns {Container}
     */
    setChildIndex(child, index) {
        if (index < 0 || index >= this._children.length) {
            throw new Error(`The index ${index} is out of bounds ${this._children.length}`);
        }

        removeItems(this._children, this.getChildIndex(child), 1);
        this._children.splice(index, 0, child);

        return this;
    }

    /**
     * @public
     * @param {Number} index
     * @returns {Renderable}
     */
    getChildAt(index) {
        if (index < 0 || index >= this._children.length) {
            throw new Error(`getChildAt: Index (${index}) does not exist.`);
        }

        return this._children[index];
    }

    /**
     * @public
     * @chainable
     * @param {Renderable} child
     * @returns {Container}
     */
    removeChild(child) {
        const index = this._children.indexOf(child);

        if (index !== -1) {
            this.removeChildAt(index);
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} index
     * @returns {Container}
     */
    removeChildAt(index) {
        removeItems(this._children, index, 1);

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} begin
     * @param {Number} end
     * @returns {Container}
     */
    removeChildren(begin = 0, end = this._children.length) {
        const range = (end - begin);

        if (range < 0 || range > end) {
            throw new Error('removeChildren: numeric values are outside the acceptable range.');
        }

        if (range || this._children.length) {
            this._children.splice(begin, range);
        }

        return this;
    }

    /**
     * @override
     */
    render(displayManager, worldTransform) {
        if (this.visible) {
            const transform = this.worldTransform
                .copy(worldTransform)
                .multiply(this.getTransform());

            for (const child of this._children) {
                child.render(displayManager, transform);
            }
        }

        return this;
    }

    /**
     * @override
     */
    getBounds() {
        const bounds = this.bounds.reset();

        bounds.addRectangle(this.getTransform(), this.getLocalBounds());

        for (const child of this._children) {
            if (!child.visible) {
                continue;
            }

            bounds.addBounds(child.getBounds());
        }

        return bounds.set(minX, minY, maxX, maxY);
    }

    /**
     * @override
     */
    destroy() {
        super.destroy();

        this._children.length = 0;
        this._children = null;
    }
}
