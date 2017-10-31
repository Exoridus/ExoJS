import Size from './Size';

/**
 * @class ObservableSize
 * @extends {Size]
 */
export default class ObservableSize extends Size {

    /**
     * @constructs ObservableSize
     * @param {Function} callback
     * @param {*} scope
     * @param {Number} [width=0]
     * @param {Number} [height=0]
     */
    constructor(callback, scope, width = 0, height = 0) {
        super(width, height);

        /**
         * @private
         * @member {Function}
         */
        this._callback = callback;

        /**
         * @private
         * @member {*}
         */
        this._scope = scope || this;
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
            this._callback.call(this._scope);
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
            this._callback.call(this._scope);
        }
    }

    /**
     * @override
     */
    set(width = this._width, height = this._height) {
        if (this._width !== width || this._height !== height) {
            this._width = width;
            this._height = height;
            this._callback.call(this._scope);
        }

        return this;
    }

    /**
     * @override
     */
    add(width, height = width) {
        return this.set(this._width + width, this._height + height);
    }

    /**
     * @override
     */
    subtract(width, height = width) {
        return this.set(this._width - width, this._height - height);
    }

    /**
     * @override
     */
    multiply(width, height = width) {
        return this.set(this._width * width, this._height * height);
    }

    /**
     * @override
     */
    divide(width, height = width) {
        return this.set(this._width / width, this._height / height);
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
        return new ObservableSize(this._callback, this._scope, this._width, this._height);
    }

    /**
     * @override
     */
    destroy() {
        super.destroy();

        this._callback = null;
        this._scope = null;
    }
}
