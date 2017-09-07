import Sprite from './Sprite';
import Texture from '../Texture';
import Color from '../../core/Color';
import {SCALE_MODE, WRAP_MODE} from '../../const';

const defaultStyle = {
        align: 'left',
        color: 'black',
        outlineColor: 'black',
        outlineWidth: 0,
        fontSize: 20,
        fontWeight: 'bold',
        fontFamily: 'Arial',
        wordWrap: false,
        wordWrapWidth: 100,
        baseline: 'top',
    },
    heightCache = new Map();

/**
 * @class Text
 * @extends {Exo.Sprite}
 * @memberof Exo
 */
export default class Text extends Sprite {

    /**
     * @constructor
     * @param {String} [text='']
     * @param {?Object} [style=null]
     * @param {Number} [scaleMode=SCALE_MODE.NEAREST]
     * @param {Number} [wrapMode=WRAP_MODE.CLAMP_TO_EDGE]
     */
    constructor(text = '', style = null, scaleMode = SCALE_MODE.NEAREST, wrapMode = WRAP_MODE.CLAMP_TO_EDGE) {
        super(new Texture(document.createElement('canvas'), scaleMode, wrapMode));

        /**
         * @private
         * @member {HTMLCanvasElement}
         */
        this._canvas = this._texture.source;

        /**
         * @private
         * @member {CanvasRenderingContext2D}
         */
        this._context = this._canvas.getContext('2d');

        /**
         * @private
         * @member {Number}
         */
        this._scaleMode = scaleMode;

        /**
         * @private
         * @member {Number}
         */
        this._wrapMode = wrapMode;

        /**
         * @private
         * @member {String}
         */
        this._text = text;

        /**
         * @private
         * @member {Object}
         */
        this._style = Object.assign(Object.create(defaultStyle), style);

        this._updateCanvas();
    }

    /**
     * @public
     * @readonly
     * @member {HTMLCanvasElement}
     */
    get canvas() {
        return this._canvas;
    }

    /**
     * @public
     * @member {Number}
     */
    get scaleMode() {
        return this._scaleMode;
    }

    set scaleMode(scaleMode) {
        this._scaleMode = scaleMode;
        this._updateCanvas();
    }

    /**
     * @public
     * @member {Number}
     */
    get wrapMode() {
        return this._wrapMode;
    }

    set wrapMode(scaleMode) {
        this._wrapMode = scaleMode;
        this._updateCanvas();
    }

    /**
     * @public
     * @member {String}
     */
    get text() {
        return this._text;
    }

    set text(text) {
        this._text = text || '';
        this._updateCanvas();
    }

    /**
     * @public
     * @member {Object}
     */
    get style() {
        return this._style;
    }

    set style(style) {
        this._style = Object.assign(Object.create(defaultStyle), style || null);
        this._updateCanvas();
    }

    /**
     * @public
     * @member {String}
     */
    get align() {
        return this._style.align;
    }

    set align(align) {
        this._style.align = align || 'left';
        this._updateCanvas();
    }

    /**
     * @public
     * @member {Exo.Color|String}
     */
    get color() {
        return this._style.color;
    }

    set color(color) {
        this._style.color = (color instanceof Color) ? color.getHexCode(true) : (color || '');
        this._updateCanvas();
    }

    /**
     * @public
     * @member {Exo.Color|String}
     */
    get outlineColor() {
        return this._style.outlineColor;
    }

    set outlineColor(color) {
        this._style.outlineColor = (color instanceof Color) ? color.getHexCode(true) : (color || '');
        this._updateCanvas();
    }

    /**
     * @public
     * @member {Number}
     */
    get outlineWidth() {
        return this._style.outlineWidth;
    }

    set outlineWidth(outlineWidth) {
        this._style.outlineWidth = outlineWidth || 0;
        this._updateCanvas();
    }

    /**
     * @public
     * @member {Number}
     */
    get fontSize() {
        return this._style.fontSize;
    }

    set fontSize(fontSize) {
        this._style.fontSize = fontSize || 0;
        this._updateCanvas();
    }

    /**
     * @public
     * @member {String}
     */
    get fontWeight() {
        return this._style.fontWeight;
    }

    set fontWeight(fontWeight) {
        this._style.fontWeight = fontWeight || 'normal';
        this._updateCanvas();
    }

    /**
     * @public
     * @member {String}
     */
    get fontFamily() {
        return this._style.fontFamily;
    }

    set fontFamily(fontFamily) {
        this._style.fontFamily = fontFamily || 'Arial';
        this._updateCanvas();
    }

    /**
     * @public
     * @member {Boolean}
     */
    get wordWrap() {
        return this._style.wordWrap;
    }

    set wordWrap(wordWrap) {
        this._style.wordWrap = !!wordWrap;
        this._updateCanvas();
    }

    /**
     * @public
     * @member {Number}
     */
    get wordWrapWidth() {
        return this._style.wordWrapWidth;
    }

    set wordWrapWidth(wordWrapWidth) {
        this._style.wordWrapWidth = wordWrapWidth;
        this._updateCanvas();
    }

    /**
     * @public
     * @member {String}
     */
    get baseline() {
        return this._style.baseline;
    }

    set baseline(baseline) {
        this._style.baseline = baseline || 'top';
        this._updateCanvas();
    }

    /**
     * @private
     */
    _updateCanvas() {
        const canvas = this._canvas,
            context = this._context,
            style = this._style,
            text = style.wordWrap ? this._getWordWrappedText() : this._text,
            font = `${style.fontWeight} ${style.fontSize}px ${style.fontFamily}`,
            outlineWidth = style.outlineWidth,
            lines = text.split(/(?:\r\n|\r|\n)/),
            linesLen = lines.length,
            lineWidths = [],
            lineHeight = this._determineFontHeight(font) + outlineWidth;

        let maxLineWidth = 0;

        // set canvas text styles
        context.font = font;

        for (let i = 0; i < linesLen; i++) {
            const lineWidth = context.measureText(lines[i]).width;

            lineWidths[i] = lineWidth;
            maxLineWidth = Math.max(maxLineWidth, lineWidth);
        }

        canvas.width = maxLineWidth + outlineWidth;
        canvas.height = lineHeight * lines.length;

        // set canvas text styles
        context.fillStyle = style.color;
        context.font = font;
        context.strokeStyle = style.outlineColor;
        context.lineWidth = outlineWidth;
        context.textBaseline = style.baseline;

        // draw lines line by line
        for (let i = 0; i < linesLen; i++) {
            const linePositionY = (outlineWidth / 2) + (i * lineHeight);
            let linePositionX = outlineWidth / 2;

            if (style.align === 'right') {
                linePositionX += maxLineWidth - lineWidths[i];
            } else if (style.align === 'center') {
                linePositionX += (maxLineWidth - lineWidths[i]) / 2;
            }

            if (style.outlineColor && style.outlineWidth) {
                context.strokeText(lines[i], linePositionX, linePositionY);
            }

            if (style.color) {
                context.fillText(lines[i], linePositionX, linePositionY);
            }
        }

        // this.setTexture(this.texture);
        this.texture = new Texture(canvas, this._scaleMode);
    }

    /**
     * @private
     * @returns {String}
     */
    _getWordWrappedText() {
        // Greedy wrapping algorithm that will wrap words as the line grows longer
        // than its horizontal bounds.
        const context = this._context,
            lines = this._text.split('\n'),
            linesLen = lines.length;

        let spaceLeft = this._style.wordWrapWidth,
            result = '';

        for (let i = 0; i < linesLen; i++) {
            const words = lines[i].split(' '),
                wordsLen = words.length;

            for (let j = 0; j < wordsLen; j++) {
                const wordWidth = context.measureText(words[j]).width,
                    wordWidthWithSpace = wordWidth + context.measureText(' ').width;

                if (wordWidthWithSpace > spaceLeft) {
                    // Skip printing the newline if it's the first word of the line that is
                    // greater than the word wrap width.
                    if (j > 0) {
                        result += '\n';
                    }

                    spaceLeft -= wordWidth;
                } else {
                    spaceLeft -= wordWidthWithSpace;
                }

                result += `${words[j]} `;
            }

            if (i < linesLen - 1) {
                result += '\n';
            }
        }

        return result;
    }

    /**
     * @private
     * @param {String} font
     * @returns {Number}
     */
    _determineFontHeight(font) {
        if (!heightCache.has(font)) {
            const body = document.getElementsByTagName('body')[0],
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
