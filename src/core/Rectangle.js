/**
 * @class Rectangle
 * @memberof Exo
 */
export default class Rectangle {

    /**
     * @constructor
     * @param {Number} [x=0]
     * @param {Number} [y=0]
     * @param {Number} [width=1]
     * @param {Number} [height=1]
     */
    constructor(x = 0, y = 0, width = 1, height = 1) {

        /**
         * @public
         * @member {Number}
         */
        this.x = x;

        /**
         * @public
         * @member {Number}
         */
        this.y = y;

        /**
         * @public
         * @member {Number}
         */
        this.width = width;

        /**
         * @public
         * @member {Number}
         */
        this.height = height;
    }

    /**
     * @public
     * @member {Number}
     */
    get left() {
        return this.x;
    }

    set left(value) {
        this.x = value;
    }

    /**
     * @public
     * @member {Number}
     */
    get right() {
        return this.x + this.width;
    }

    set right(value) {
        this.x = value - this.width;
    }

    /**
     * @public
     * @member {Number}
     */
    get top() {
        return this.y;
    }

    set top(value) {
        this.y = value;
    }

    /**
     * @public
     * @member {Number}
     */
    get bottom() {
        return this.y + this.height;
    }

    set bottom(value) {
        this.y = value - this.height;
    }

    /**
     * @public
     * @chainable
     * @param {Number} x
     * @param {Number} y
     * @param {Number} width
     * @param {Number} height
     * @returns {Exo.Rectangle}
     */
    set(x, y, width, height) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Exo.Rectangle} rectangle
     * @returns {Exo.Rectangle}
     */
    copy(rectangle) {
        this.x = rectangle.x;
        this.y = rectangle.y;
        this.width = rectangle.width;
        this.height = rectangle.height;

        return this;
    }

    /**
     * @public
     * @returns {Exo.Rectangle}
     */
    clone() {
        return new Rectangle(this.x, this.y, this.width, this.height);
    }

    /**
     * @public
     * @param {Number} x
     * @param {Number} y
     * @returns {Boolean}
     */
    contains(x, y) {
        if (this.width <= 0 || this.height <= 0) {
            return false;
        }

        return (x >= this.x && x < this.x + this.width) && (y >= this.y && y < this.y + this.height);
    }
}

/**
 * @public
 * @static
 * @readonly
 * @member {Exo.Rectangle}
 */
Rectangle.Empty = new Rectangle(0, 0, 0, 0);
