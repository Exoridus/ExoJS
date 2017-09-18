import Renderable from './Renderable';
import Vector from '../core/shape/Vector';
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

        /**
         * @private
         * @member {Vector}
         */
        this._size = new Vector();
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
     * @member {Renderable|Container}
     */
    get parent() {
        return this._parent;
    }

    set parent(parent) {
        this._parent = parent;
    }

    /**
     * @public
     * @member {Vector}
     */
    get size() {
        return this._size;
    }

    set size(size) {
        this._size.copy(size);
    }

    /**
     * @public
     * @member {Number}
     */
    get width() {
        return this._size.x;
    }

    set width(width) {
        this._size.x = width;
    }

    /**
     * @public
     * @member {Number}
     */
    get height() {
        return this._size.y;
    }

    set height(height) {
        this._size.y = height;
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
        if (firstChild === secondChild) {
            return this;
        }

        this._children[this.getChildIndex(firstChild)] = secondChild;
        this._children[this.getChildIndex(secondChild)] = firstChild;

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

        removeItems(this._children, this.getChildIndex(index), 1);
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

        if (index === -1) {
            return this;
        }

        child.parent = null;
        removeItems(this._children, index, 1);

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} index
     * @returns {Container}
     */
    removeChildAt(index) {
        this.getChildAt(index).parent = null;
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

        if (!range && !this._children.length) {
            return this;
        }

        if (range < 0 && range > end) {
            throw new Error('removeChildren: numeric values are outside the acceptable range.');
        }

        this._children.splice(begin, range);

        return this;
    }

    /**
     * @override
     */
    render(displayManager, parentTransform) {
        if (!this.visible) {
            return this;
        }

        this._worldTransform.copy(parentTransform);
        this._worldTransform.multiply(this.transform);

        for (let i = 0, len = this._children.length; i < len; i++) {
            this._children[i].render(displayManager, this._worldTransform);
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

        this._size.destroy();
        this._size = null;
    }
}
