import Sprite from './Sprite';
import Texture from '../Texture';
import Rectangle from '../../types/Rectangle';

const

    /**
     * @private
     * @type {Map<String, Number>}
     */
    heightCache = new Map(),

    /**
     * @private
     * @type {RegExp}
     */
    NEWLINE = /(?:\r\n|\r|\n)/;

/**
 * @class Text
 * @extends Sprite
 */
export default class Text extends Sprite {

    /**
     * @constructor
     * @param {String} text
     * @param {Object} [options={}]
     * @param {String} [options.align='left']
     * @param {String} [options.fill='black']
     * @param {String} [options.stroke='black']
     * @param {Number} [options.strokeThickness=0]
     * @param {Number} [options.fontSize=20]
     * @param {String} [options.fontWeight='bold']
     * @param {String} [options.fontFamily='Arial']
     * @param {Boolean} [options.wordWrap=false]
     * @param {Number} [options.wordWrapWidth=100]
     * @param {String} [options.baseline='alphabetic']
     * @param {String} [options.lineJoin='miter']
     * @param {Number} [options.miterLimit=10]
     * @param {Number} [options.padding=0]
     * @param {HTMLCanvasElement} [options.canvas=document.createElement('canvas')]
     * @param {Object} [textureOptions]
     * @param {Number} [textureOptions.scaleMode]
     * @param {Number} [textureOptions.wrapMode]
     * @param {Boolean} [textureOptions.premultiplyAlpha]
     * @param {Boolean} [textureOptions.generateMipMap]
     */
    constructor(text, {
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
        canvas = document.createElement('canvas'),
    } = {}, textureOptions) {
        super(new Texture(canvas, textureOptions));

        /**
         * @private
         * @member {String}
         */
        this._text = null;

        /**
         * @private
         * @member {HTMLCanvasElement}
         */
        this._canvas = canvas;

        /**
         * @private
         * @member {CanvasRenderingContext2D}
         */
        this._context = canvas.getContext('2d');

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

        this.setText(text);
        this.updateTexture();
    }

    /**
     * @public
     * @member {String}
     */
    get text() {
        return this._text;
    }

    set text(text) {
        this.setText(text);
    }

    /**
     * @public
     * @member {HTMLCanvasElement}
     */
    get canvas() {
        return this._canvas;
    }

    set canvas(canvas) {
        this.setCanvas(canvas);
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
     * @readonly
     * @member {String}
     */
    get font() {
        return `${this._fontWeight} ${this._fontSize}px ${this._fontFamily}`;
    }

    /**
     * @public
     * @chainable
     * @param {String} text
     * @returns {Text}
     */
    setText(text) {
        if (this._text !== text) {
            this._text = text;
            this._dirty = true;
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {HTMLCanvasElement} canvas
     * @returns {Text}
     */
    setCanvas(canvas) {
        if (this._canvas !== canvas) {
            this._canvas = canvas;
            this._context = canvas.getContext('2d');
            this._dirty = true;

            this.setTextureFrame(Rectangle.Temp.set(0, 0, canvas.width, canvas.height));
        }

        return this;
    }

    /**
     * @override
     */
    updateTexture() {
        if (this._dirty) {
            this.applyStyle();

            const text = this.wordWrap ? this.getWordWrappedText() : this._text,
                lineHeight = Text.determineFontHeight(this._context.font) + this.strokeThickness,
                lines = text.split(NEWLINE),
                lineMetrics = lines.map((line) => this._context.measureText(line)),
                maxLineWidth = lineMetrics.reduce((max, measure) => Math.max(max, measure.width), 0),
                canvasWidth = Math.ceil((maxLineWidth + this.strokeThickness) + (this.padding * 2)),
                canvasHeight = Math.ceil((lineHeight * lines.length) + (this.padding * 2));

            if (canvasWidth !== this._canvas.width || canvasHeight !== this._canvas.height) {
                this._canvas.width = canvasWidth;
                this._canvas.height = canvasHeight;

                this.setTextureFrame(Rectangle.Temp.set(0, 0, canvasWidth, canvasHeight));
            } else {
                this._context.clearRect(0, 0, canvasWidth, canvasHeight);
            }

            this.applyStyle();

            for (let i = 0; i < lines.length; i++) {
                const metrics = lineMetrics[i],
                    lineWidth = (maxLineWidth - metrics.width),
                    offset = (this.align === 'right') ? lineWidth : lineWidth / 2,
                    padding = this.padding + (this.strokeThickness / 2),
                    lineX = metrics.actualBoundingBoxLeft + (this.align === 'left' ? 0 : offset) + padding,
                    lineY = metrics.fontBoundingBoxAscent + (lineHeight * i) + padding;

                if (this.stroke && this.strokeThickness) {
                    this._context.strokeText(lines[i], lineX, lineY);
                }

                if (this.fill) {
                    this._context.fillText(lines[i], lineX, lineY);
                }
            }

            this.texture.updateSource();
            this._dirty = false;
        }

        return this;
    }

    /**
     * @public
     * @returns {String}
     */
    getWordWrappedText() {
        const context = this._context,
            wrapWidth = this.wordWrapWidth,
            lines = this._text.split('\n'),
            spaceWidth = context.measureText(' ').width;

        let spaceLeft = wrapWidth,
            result = '';

        for (let y = 0; y < lines.length; y++) {
            const words = lines[y].split(' ');

            if (y > 0) {
                result += '\n';
            }

            for (let x = 0; x < words.length; x++) {
                const word = words[x],
                    wordWidth = context.measureText(word).width,
                    pairWidth = wordWidth + spaceWidth;

                if (pairWidth > spaceLeft) {
                    if (x > 0) {
                        result += '\n';
                    }

                    spaceLeft = wrapWidth;
                } else {
                    spaceLeft -= pairWidth;
                }

                result += `${word} `;
            }
        }

        return result;
    }

    /**
     * @override
     */
    render(renderManager) {
        if (this.visible) {
            this.updateTexture();

            super.render(renderManager);
        }

        return this;
    }
    /**
     * @public
     * @chainable
     * @returns {Text}
     */
    applyStyle() {
        this._context.font = this.font;
        this._context.fillStyle = this.fill;
        this._context.strokeStyle = this.stroke;
        this._context.lineWidth = this.strokeThickness;
        this._context.textBaseline = this.baseline;
        this._context.lineJoin = this.lineJoin;
        this._context.miterLimit = this.miterLimit;

        return this;
    }

    /**
     * @override
     */
    destroy() {
        super.destroy();

        this._text = null;
        this._canvas = null;
        this._context = null;
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

    /**
     * @private
     * @static
     * @param {String} font
     * @returns {Number}
     */
    static determineFontHeight(font) {
        if (!heightCache.has(font)) {
            const body = document.body,
                dummy = document.createElement('div');

            dummy.appendChild(document.createTextNode('M'));
            dummy.setAttribute('style', `font: ${font};position:absolute;top:0;left:0`);

            body.appendChild(dummy);
            heightCache.set(font, dummy.offsetHeight);
            body.removeChild(dummy);
        }

        return heightCache.get(font);
    }
}
