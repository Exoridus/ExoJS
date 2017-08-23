/**
 * @class AutoTile
 */
export default class AutoTile {

    /**
     * @constructor
     * @param {Number} x
     * @param {Number} y
     * @param {Number} tileSize
     */
    constructor(x, y, tileSize) {

        /**
         * @private
         * @member {Number}
         */
        this._width = tileSize * 2;

        /**
         * @private
         * @member {Number}
         */
        this._height = tileSize * 3;

        /**
         * @private
         * @member {Number}
         */
        this._tileSize = tileSize;

        /**
         * @private
         * @member {Exo.Rectangle}
         */
        this._fullRect = new Exo.Rectangle(
            x * this._width,
            y * this._height,
            this._width,
            this._height
        );

        /**
         * @private
         * @member {Exo.Rectangle}
         */
        this._tileRect = new Exo.Rectangle(
            this._fullRect.x + (tileSize * 0.5),
            this._fullRect.y + (tileSize * 1.5),
            tileSize,
            tileSize
        );
    }

    /**
     * @public
     * @member {Number}
     */
    get width() {
        return this._width;
    }

    set width(value) {
        this._width = value;
    }

    /**
     * @public
     * @member {Number}
     */
    get height() {
        return this._height;
    }

    set height(value) {
        this._height = value;
    }

    /**
     * @public
     * @member {Number}
     */
    get tileSize() {
        return this._tileSize;
    }

    set tileSize(value) {
        this._tileSize = value;
    }

    /**
     * @public
     * @member {Exo.Rectangle}
     */
    get fullRect() {
        return this._fullRect;
    }

    set fullRect(value) {
        this._fullRect.copy(value);
    }

    /**
     * @public
     * @member {Exo.Rectangle}
     */
    get tileRect() {
        return this._tileRect;
    }

    set tileRect(value) {
        this._tileRect.copy(value);
    }
}
