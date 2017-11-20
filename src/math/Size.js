/**
 * @class Size
 */
export default class Size {

    /**
     * @constructor
     * @param {Number} [width=0]
     * @param {Number} [height=0]
     */
    constructor(width = 0, height = 0) {

        /**
         * @public
         * @member {Number}
         */
        this._width = width;

        /**
         * @public
         * @member {Number}
         */
        this._height = height;
    }

    /**
     * @public
     * @member {Number}
     */
    get width() {
        return this._width;
    }

    set width(width) {
        this._width = width;
    }

    /**
     * @public
     * @member {Number}
     */
    get height() {
        return this._height;
    }

    set height(height) {
        this._height = height;
    }

    /**
     * @public
     * @chainable
     * @param {Number} width
     * @param {Number} [height=width]
     * @returns {Size}
     */
    set(width, height = width) {
        this._width = width;
        this._height = height;

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} width
     * @param {Number} [height=width]
     * @returns {Size}
     */
    add(width, height = width) {
        this._width += width;
        this._height += height;

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} width
     * @param {Number} [height=width]
     * @returns {Size}
     */
    subtract(width, height = width) {
        this._width -= width;
        this._height -= height;

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} width
     * @param {Number} [height=width]
     * @returns {Size}
     */
    multiply(width, height = width) {
        this._width *= width;
        this._height *= height;

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} width
     * @param {Number} [height=width]
     * @returns {Size}
     */
    divide(width, height = width) {
        this._width /= width;
        this._height /= height;

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Size} size
     * @returns {Size}
     */
    copy(size) {
        this._width = size.width;
        this._height = size.height;

        return this;
    }

    /**
     * @public
     * @returns {Size}
     */
    clone() {
        return new Size(this._width, this._height);
    }

    /**
     * @public
     * @param {Size|Object} size
     * @param {Number} [size.width]
     * @param {Number} [size.height]
     * @returns {Boolean}
     */
    equals({ width, height } = {}) {
        return (width === undefined || this.width === width)
            && (height === undefined || this.height === height);
    }

    /**
     * @override
     */
    destroy() {
        this._width = null;
        this._height = null;
    }
}

/**
 * @public
 * @static
 * @constant
 * @type {Size}
 */
Size.Empty = new Size(0, 0);

/**
 * @public
 * @static
 * @constant
 * @type {Size}
 */
Size.Temp = new Size();
