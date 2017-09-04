import Renderable from './Renderable';
import Vector from '../core/Vector';
import {removeItems} from '../utils';

/**
 * @class Container
 * @extends {Exo.Renderable}
 * @memberof Exo
 */
export default class Container extends Renderable {

    /**
     * @constructor
     */
    constructor() {
        super();

        /**
         * @private
         * @member {Exo.Renderable[]}
         */
        this._children = [];

        /**
         * @private
         * @member {Exo.Vector}
         */
        this._size = new Vector();
    }

    /**
     * @public
     * @readonly
     * @member {Exo.Renderable[]}
     */
    get children() {
        return this._children;
    }

    /**
     * @public
     * @member {Exo.Renderable|Exo.Container}
     */
    get parent() {
        return this._parent;
    }

    set parent(value) {
        this._parent = value;
    }

    /**
     * @public
     * @member {Exo.Vector}
     */
    get size() {
        return this._size;
    }

    set size(value) {
        this._size.copy(value);
    }

    /**
     * @public
     * @member {Number}
     */
    get width() {
        return this._size.x;
    }

    set width(value) {
        this._size.x = value;
    }

    /**
     * @public
     * @member {Number}
     */
    get height() {
        return this._size.y;
    }

    set height(value) {
        this._size.y = value;
    }

    /**
     * @public
     * @chainable
     * @param {Exo.Renderable} child
     * @returns {Exo.Container}
     */
    addChild(child) {
        if (child === this) {
            return this;
        }

        if (child.parent) {
            child.parent.removeChild(child);
        }

        child.parent = this;

        this._children.push(child);

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Exo.Renderable} child
     * @param {Number} index
     * @returns {Exo.Container}
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
     * @param {Exo.Renderable} firstChild
     * @param {Exo.Renderable} secondChild
     * @returns {Exo.Container}
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
     * @param {Exo.Renderable} child
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
     * @param {Exo.Renderable} child
     * @param {Number} index
     * @returns {Exo.Container}
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
     * @returns {Exo.Renderable}
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
     * @param {Exo.Renderable} child
     * @returns {Exo.Container}
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
     * @returns {Exo.Container}
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
     * @returns {Exo.Container}
     */
    removeChildren(begin = 0, end) {
        const children = this._children,
            endIndex = (typeof end === 'number') ? end : children.length,
            range = (endIndex - begin);

        if (!range && !children.length) {
            return this;
        }

        if (range < 0 && range > endIndex) {
            throw new Error('removeChildren: numeric values are outside the acceptable range.');
        }

        children.splice(begin, range);

        return this;
    }

    /**
     * @override
     */
    render(displayManager, parentTransform) {
        if (!this.visible) {
            return;
        }

        this._worldTransform.copy(parentTransform);
        this._worldTransform.multiply(this.transform);

        for (let i = 0, len = this._children.length; i < len; i++) {
            this._children[i].render(displayManager, this._worldTransform);
        }
    }

    /**
     * @override
     * @param {Boolean} [destroyChildren=false]
     */
    destroy(destroyChildren = false) {
        super.destroy();

        if (destroyChildren) {
            for (const child of this._children) {
                child.destroy();
            }
        }

        this._children.length = 0;
        this._children = null;

        this._size.destroy();
        this._size = null;
    }
}
