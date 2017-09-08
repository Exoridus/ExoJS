import Sprite from './Sprite';
import Texture from '../Texture';
import settings from '../../settings';

const heightCache = new Map();

/**
 * @class Text
 * @extends {Exo.Sprite}
 * @memberof Exo
 */
export default class Text extends Sprite {

    /**
     * @constructor
     * @param {String} text
     * @param {Object} [style]
     * @param {HTMLCanvasElement} [canvas=document.createElement('canvas')]
     */
    constructor(text, style, canvas = document.createElement('canvas')) {
        super(new Texture(canvas));

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
        this._text = text || ' ';

        /**
         * @private
         * @member {Object}
         */
        this._style = Object.assign({}, settings.TEXT_STYLE, style);

        this.updateTexture();
    }

    /**
     * @public
     * @member {HTMLCanvasElement}
     */
    get canvas() {
        return this._canvas;
    }

    set canvas(value) {
        this._canvas = value;
        this.updateTexture();
    }

    /**
     * @public
     * @member {String}
     */
    get text() {
        return this._text;
    }

    set text(value) {
        const text = value || ' ';

        if (this._text !== text) {
            this._text = text;
            this.updateTexture();
        }
    }

    /**
     * @public
     * @member {Object}
     */
    get style() {
        return this._style;
    }

    set style(style) {
        this._style = Object.assign({}, settings.TEXT_STYLE, style);
        this.updateTexture();
    }

    /**
     * @public
     */
    updateTexture() {
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

        this.setTexture(this.texture.setSource(canvas));
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
