import Sprite from './Sprite';
import Texture from './Texture';
import settings from '../settings';
import { NEWLINE } from '../const';

const heightCache = new Map(),
    body = document.querySelector('body'),
    dummy = ((element) => {
        element.appendChild(document.createTextNode('M'));

        Object.assign(element.style, {
            position: 'absolute',
            top: 0,
            left: 0,
        });

        return element;
    })(document.createElement('div'));

/**
 * @class Text
 * @extends {Sprite}
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
        this._text = null;

        /**
         * @private
         * @member {Object}
         */
        this._style = null;

        /**
         * @private
         * @type {Boolean}
         */
        this._dirty = false;

        this.text = text;
        this.style = style;
    }

    /**
     * @public
     * @member {String}
     */
    get text() {
        return this._text;
    }

    set text(text) {
        const newText = text || ' ';

        if (this._text !== newText) {
            this._text = newText;
            this._dirty = true;
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
        this._dirty = true;
    }

    /**
     * @public
     */
    updatateText() {
        if (!this._dirty) {
            return;
        }

        const canvas = this._canvas,
            context = this._context,
            style = this._style,
            font = context.font = `${style.fontWeight} ${style.fontSize}px ${style.fontFamily}`,
            strokeThickness = style.strokeThickness,
            text = style.wordWrap ? this._getWordWrappedText() : this._text,
            lines = text.split(NEWLINE),
            lineWidths = lines.map((line) => context.measureText(line).width),
            maxLineWidth = lineWidths.reduce((max, width) => Math.max(max, width), 0),
            lineHeight = this._determineFontHeight(font) + strokeThickness,
            width = Math.ceil(maxLineWidth + strokeThickness + style.padding * 2),
            height = Math.ceil(lineHeight * lines.length + style.padding * 2);

        canvas.width = width;
        canvas.height = height;

        context.clearRect(0, 0, width, height);

        context.font = font;

        context.strokeStyle = style.stroke;
        context.lineWidth = style.strokeThickness;
        context.fillStyle = style.fill;
        context.textBaseline = style.baseline;
        context.lineJoin = style.lineJoin;
        context.miterLimit = style.miterLimit;

        lines.forEach((line, index) => {
            const lineWidth = (maxLineWidth - lineWidths[index]),
                offset = (style.align === 'right') ? lineWidth : (style.align === 'center') ? lineWidth / 2 : 0,
                lineX = (strokeThickness / 2) + (style.align === 'left' ? 0 : offset),
                lineY = (strokeThickness / 2) + (lineHeight * index);

            if (style.stroke && strokeThickness) {
                context.strokeText(line, lineX, lineY);
            }

            if (style.fill) {
                context.fillText(line, lineX, lineY);
            }
        });

        this.setTexture(this.texture.setSource(this._canvas));

        this._dirty = false;
    }

    /**
     * @override
     */
    render(displayManager, parentTransform) {
        this.updatateText();

        super.render(displayManager, parentTransform);

        return this;
    }

    /**
     * @public
     */
    destroy() {
        super.destroy();

        this._context = null;
        this._canvas = null;
        this._text = null;
        this._style = null;
        this._dirty = null;
    }

    /**
     * Greedy wrapping algorithm that will wrap words as the line grows longer
     * than its horizontal bounds.
     *
     * @private
     * @returns {String}
     */
    _getWordWrappedText() {
        const context = this._context;

        let spaceLeft = this._style.wordWrapWidth,
            result = '';

        this._text.split('\n').forEach((line, index) => {
            if (index > 0) {
                result += '\n';
            }

            line.split(' ').forEach((word, index) => {
                const wordWidth = context.measureText(word).width,
                    spaceWidth = context.measureText(' ').width;

                if (wordWidth + spaceWidth > spaceLeft) {
                    if (index > 0) {
                        result += '\n';
                    }

                    spaceLeft -= wordWidth;
                } else {
                    spaceLeft -= wordWidth + spaceWidth;
                }

                result += `${word} `;
            });
        });

        return result;
    }

    /**
     * @private
     * @param {String} font
     * @returns {Number}
     */
    _determineFontHeight(font) {
        if (!heightCache.has(font)) {
            dummy.style.font = font;

            body.appendChild(dummy);
            heightCache.set(font, dummy.offsetHeight);
            body.removeChild(dummy);
        }

        return heightCache.get(font);
    }
}
