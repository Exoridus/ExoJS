import Drawable from './Drawable';
import { removeArrayItems } from '../utils/core';

/**
 * @class Container
 * @extends Drawable
 */
export default class Container extends Drawable {

    /**
     * @constructor
     */
    constructor() {
        super();

        /**
         * @private
         * @member {Drawable[]}
         */
        this._children = [];
    }

    /**
     * @public
     * @readonly
     * @member {Drawable[]}
     */
    get children() {
        return this._children;
    }

    /**
     * @public
     * @member {Number}
     */
    get width() {
        return Math.abs(this.scale.x) * this.bounds.width;
    }

    set width(value) {
        this.scale.x = value / this.bounds.width;
    }

    /**
     * @public
     * @member {Number}
     */
    get height() {
        return Math.abs(this.scale.y) * this.bounds.height;
    }

    set height(value) {
        this.scale.y = value / this.bounds.height;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get left() {
        return this.x - (this.width * this.origin.x);
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get top() {
        return this.y - (this.height * this.origin.y);
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get right() {
        return (this.x + this.width - this.origin.x);
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get bottom() {
        return (this.y + this.height - this.origin.y);
    }

    /**
     * @public
     * @chainable
     * @param {Drawable} child
     * @returns {Container}
     */
    addChild(child) {
        return this.addChildAt(child, this._children.length);
    }

    /**
     * @public
     * @chainable
     * @param {Drawable} child
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
     * @param {Drawable} firstChild
     * @param {Drawable} secondChild
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
     * @param {Drawable} child
     * @returns {Number}
     */
    getChildIndex(child) {
        const index = this._children.indexOf(child);

        if (index === -1) {
            throw new Error('Drawable is not a child of the container.');
        }

        return index;
    }

    /**
     * @public
     * @chainable
     * @param {Drawable} child
     * @param {Number} index
     * @returns {Container}
     */
    setChildIndex(child, index) {
        if (index < 0 || index >= this._children.length) {
            throw new Error(`The index ${index} is out of bounds ${this._children.length}`);
        }

        removeArrayItems(this._children, this.getChildIndex(child), 1);

        this._children.splice(index, 0, child);

        return this;
    }

    /**
     * @public
     * @param {Number} index
     * @returns {Drawable}
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
     * @param {Drawable} child
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
        removeArrayItems(this._children, index, 1);

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
            throw new Error('Values are outside the acceptable range.');
        }

        removeArrayItems(this._children, begin, range);

        return this;
    }

    /**
     * @override
     */
    render(renderManager) {
        if (this.visible && this.inView(renderManager.view)) {
            for (const child of this._children) {
                child.render(renderManager);
            }
        }

        return this;
    }

    /**
     * @override
     */
    updateBounds() {
        this._bounds.reset()
            .addRect(this.getLocalBounds(), this.getGlobalTransform());

        for (const child of this._children) {
            if (child.visible) {
                this._bounds.addRect(child.getBounds());
            }
        }

        return this;
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
