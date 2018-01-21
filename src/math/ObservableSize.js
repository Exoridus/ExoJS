import Size from './Size';

/**
 * @class ObservableSize
 * @extends Size
 */
export default class ObservableSize extends Size {

    /**
     * @constructor
     * @param {Function} callback
     * @param {?Object} context
     * @param {Number} [width=0]
     * @param {Number} [height=0]
     */
    constructor(callback, context, width = 0, height = 0) {
        super(width, height);

        /**
         * @private
         * @member {Function}
         */
        this._callback = callback;

        /**
         * @private
         * @member {?Object}
         */
        this._context = context || this;
    }

    /**
     * @public
     * @member {Number}
     */
    get width() {
        return this._width;
    }

    set width(width) {
        if (this._width !== width) {
            this._width = width;
            this._callback.call(this._context);
        }
    }

    /**
     * @public
     * @member {Number}
     */
    get height() {
        return this._height;
    }

    set height(height) {
        if (this._height !== height) {
            this._height = height;
            this._callback.call(this._context);
        }
    }

    /**
     * @override
     */
    set(width = this._width, height = this._height) {
        if (this._width !== width || this._height !== height) {
            this._width = width;
            this._height = height;
            this._callback.call(this._context);
        }

        return this;
    }

    /**
     * @override
     */
    add(x, y = x) {
        return this.set(this._width + x, this._height + y);
    }

    /**
     * @override
     */
    subtract(x, y = x) {
        return this.set(this._width - x, this._height - y);
    }

    /**
     * @override
     */
    scale(x, y = x) {
        return this.set(this._width * x, this._height * y);
    }

    /**
     * @override
     */
    divide(x, y = x) {
        return this.set(this._width / x, this._height / y);
    }

    /**
     * @override
     */
    copy(size) {
        return this.set(size.width, size.height);
    }

    /**
     * @override
     */
    clone() {
        return new ObservableSize(this._callback, this._context, this._width, this._height);
    }

    /**
     * @override
     */
    destroy() {
        super.destroy();

        this._callback = null;
        this._context = null;
    }
}
