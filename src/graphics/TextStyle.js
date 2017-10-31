/**
 * @class TextStyle
 */
export default class TextStyle {

    /**
     * @constructs TextStyle
     * @param {TextStyle|Object} [style = {}]
     * @param {String} [style.align='left']
     * @param {String} [style.fill='black']
     * @param {String} [style.stroke='black']
     * @param {Number} [style.strokeThickness=0]
     * @param {Number} [style.fontSize=20]
     * @param {String} [style.fontWeight='bold']
     * @param {String} [style.fontFamily='Arial']
     * @param {Boolean} [style.wordWrap=false]
     * @param {Number} [style.wordWrapWidth=100]
     * @param {String} [style.baseline='alphabetic']
     * @param {String} [style.lineJoin='miter']
     * @param {Number} [style.miterLimit=10]
     * @param {Number} [style.padding=0]
     */
    constructor({
        align = 'left',
        fill = 'black',
        stroke = 'black',
        strokeThickness = 0,
        fontSize = 20,
        fontWeight = 'bold',
        fontFamily = 'Arial',
        wordWrap = false,
        wordWrapWidth = 100,
        baseline = 'alphabetic',
        lineJoin = 'miter',
        miterLimit = 10,
        padding = 0,
    } = {}) {

        /**
         * @private
         * @member {String}
         */
        this._align = align;

        /**
         * @private
         * @member {String}
         */
        this._fill = fill;

        /**
         * @private
         * @member {String}
         */
        this._stroke = stroke;

        /**
         * @private
         * @member {Number}
         */
        this._strokeThickness = strokeThickness;

        /**
         * @private
         * @member {Number}
         */
        this._fontSize = fontSize;

        /**
         * @private
         * @member {String}
         */
        this._fontWeight = fontWeight;

        /**
         * @private
         * @member {String}
         */
        this._fontFamily = fontFamily;

        /**
         * @private
         * @member {Boolean}
         */
        this._wordWrap = wordWrap;

        /**
         * @private
         * @member {Number}
         */
        this._wordWrapWidth = wordWrapWidth;

        /**
         * @private
         * @member {String}
         */
        this._baseline = baseline;

        /**
         * @private
         * @member {String}
         */
        this._lineJoin = lineJoin;

        /**
         * @private
         * @member {Number}
         */
        this._miterLimit = miterLimit;

        /**
         * @private
         * @member {Number}
         */
        this._padding = padding;

        /**
         * @private
         * @member {Boolean}
         */
        this._dirty = true;
    }

    /**
     * @public
     * @member {String}
     */
    get align() {
        return this._align;
    }

    set align(align) {
        if (this._align !== align) {
            this._align = align;
            this._dirty = true;
        }
    }

    /**
     * @public
     * @member {String}
     */
    get fill() {
        return this._fill;
    }

    set fill(fill) {
        if (this._fill !== fill) {
            this._fill = fill;
            this._dirty = true;
        }
    }

    /**
     * @public
     * @member {String}
     */
    get stroke() {
        return this._stroke;
    }

    set stroke(stroke) {
        if (this._stroke !== stroke) {
            this._stroke = stroke;
            this._dirty = true;
        }
    }

    /**
     * @public
     * @member {Number}
     */
    get strokeThickness() {
        return this._strokeThickness;
    }

    set strokeThickness(strokeThickness) {
        if (this._strokeThickness !== strokeThickness) {
            this._strokeThickness = strokeThickness;
            this._dirty = true;
        }
    }

    /**
     * @public
     * @member {Number}
     */
    get fontSize() {
        return this._fontSize;
    }

    set fontSize(fontSize) {
        if (this._fontSize !== fontSize) {
            this._fontSize = fontSize;
            this._dirty = true;
        }
    }

    /**
     * @public
     * @member {String}
     */
    get fontWeight() {
        return this._fontWeight;
    }

    set fontWeight(fontWeight) {
        if (this._fontWeight !== fontWeight) {
            this._fontWeight = fontWeight;
            this._dirty = true;
        }
    }

    /**
     * @public
     * @member {String}
     */
    get fontFamily() {
        return this._fontFamily;
    }

    set fontFamily(fontFamily) {
        if (this._fontFamily !== fontFamily) {
            this._fontFamily = fontFamily;
            this._dirty = true;
        }
    }

    /**
     * @public
     * @member {Boolean}
     */
    get wordWrap() {
        return this._wordWrap;
    }

    set wordWrap(wordWrap) {
        if (this._wordWrap !== wordWrap) {
            this._wordWrap = wordWrap;
            this._dirty = true;
        }
    }

    /**
     * @public
     * @member {Number}
     */
    get wordWrapWidth() {
        return this._wordWrapWidth;
    }

    set wordWrapWidth(wordWrapWidth) {
        if (this._wordWrapWidth !== wordWrapWidth) {
            this._wordWrapWidth = wordWrapWidth;
            this._dirty = true;
        }
    }

    /**
     * @public
     * @member {String}
     */
    get baseline() {
        return this._baseline;
    }

    set baseline(baseline) {
        if (this._baseline !== baseline) {
            this._baseline = baseline;
            this._dirty = true;
        }
    }

    /**
     * @public
     * @member {String}
     */
    get lineJoin() {
        return this._lineJoin;
    }

    set lineJoin(lineJoin) {
        if (this._lineJoin !== lineJoin) {
            this._lineJoin = lineJoin;
            this._dirty = true;
        }
    }

    /**
     * @public
     * @member {Number}
     */
    get miterLimit() {
        return this._miterLimit;
    }

    set miterLimit(miterLimit) {
        if (this._miterLimit !== miterLimit) {
            this._miterLimit = miterLimit;
            this._dirty = true;
        }
    }

    /**
     * @public
     * @member {Number}
     */
    get padding() {
        return this._padding;
    }

    set padding(padding) {
        if (this._padding !== padding) {
            this._padding = padding;
            this._dirty = true;
        }
    }

    /**
     * @public
     * @member {Boolean}
     */
    get dirty() {
        return this._dirty;
    }

    set dirty(dirty) {
        this._dirty = dirty;
    }

    /**
     * @public
     * @readonly
     * @member {String}
     */
    get font() {
        return `${this._fontWeight} ${this._fontSize}px ${this._fontFamily}`;
    }

    /**
     * @public
     * @chainable
     * @param {CanvasRenderingContext2D} context
     * @returns {TextStyle}
     */
    apply(context) {
        context.font = this.font;
        context.fillStyle = this.fill;
        context.strokeStyle = this.stroke;
        context.lineWidth = this.strokeThickness;
        context.textBaseline = this.baseline;
        context.lineJoin = this.lineJoin;
        context.miterLimit = this.miterLimit;

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {TextStyle} style
     * @returns {TextStyle}
     */
    copy(style) {
        if (style !== this) {
            this.align = style.align;
            this.fill = style.fill;
            this.stroke = style.stroke;
            this.strokeThickness = style.strokeThickness;
            this.fontSize = style.fontSize;
            this.fontWeight = style.fontWeight;
            this.fontFamily = style.fontFamily;
            this.wordWrap = style.wordWrap;
            this.wordWrapWidth = style.wordWrapWidth;
            this.baseline = style.baseline;
            this.lineJoin = style.lineJoin;
            this.miterLimit = style.miterLimit;
            this.padding = style.padding;
            this.dirty = style.dirty;
        }

        return this;
    }

    /**
     * @public
     * @returns {TextStyle}
     */
    clone() {
        return new TextStyle().copy(this);
    }

    /**
     * @public
     */
    destroy() {
        this._align = null;
        this._fill = null;
        this._stroke = null;
        this._strokeThickness = null;
        this._fontSize = null;
        this._fontWeight = null;
        this._fontFamily = null;
        this._wordWrap = null;
        this._wordWrapWidth = null;
        this._baseline = null;
        this._lineJoin = null;
        this._miterLimit = null;
        this._padding = null;
        this._dirty = null;
    }
}
