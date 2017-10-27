import { NEWLINE } from '../const';
import settings from '../settings';
import Sprite from './sprite/Sprite';
import Texture from './Texture';

const heightCache = new Map();

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
        this._dirty = true;

        this.text = text;
        this.style = style;
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
        this._dirty = true;
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
     * @override
     */
    updateTexture() {
        if (this._dirty) {
            const camvas = this._canvas,
                context = this._context,
                style = this._style,
                font = `${style.fontWeight} ${style.fontSize}px ${style.fontFamily}`,
                text = style.wordWrap ? this.getWordWrappedText(style.wordWrapWidth) : this._text,
                lines = text.split(NEWLINE),
                lineWidths = lines.map((line) => context.measureText(line).width),
                lineHeight = this.determineFontHeight(font) + style.strokeThickness,
                maxLineWidth = lineWidths.reduce((max, value) => Math.max(max, value), 0);

            camvas.width = Math.ceil((maxLineWidth + style.strokeThickness) + (style.padding * 2));
            camvas.height = Math.ceil((lineHeight * lines.length) + (style.padding * 2));

            context.clearRect(0, 0, camvas.width, camvas.height);

            context.font = font;
            context.fillStyle = style.fill;
            context.strokeStyle = style.stroke;
            context.lineWidth = style.strokeThickness;
            context.textBaseline = style.baseline;
            context.lineJoin = style.lineJoin;
            context.miterLimit = style.miterLimit;

            for (let i = 0; i < lines.length; i++) {
                const lineWidth = (maxLineWidth - lineWidths[i]),
                    offset = (style.align === 'right') ? lineWidth : lineWidth / 2,
                    lineX = (style.strokeThickness / 2) + (style.align === 'left' ? 0 : offset),
                    lineY = (style.strokeThickness / 2) + (lineHeight * i);

                if (style.stroke && style.strokeThickness) {
                    context.strokeText(lines[i], lineX, lineY);
                }

                if (style.fill) {
                    context.fillText(lines[i], lineX, lineY);
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
    getWordWrappedText(wordWrapWidth) {
        const context = this._context,
            spaceWidth = context.measureText(' ').width,
            lines = this._text.split('\n');

        let spaceLeft = wordWrapWidth,
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

                    spaceLeft -= wordWidth;
                } else {
                    spaceLeft -= pairWidth;
                }

                result += `${word} `;
            }
        }

        return result;
    }

    /**
     * @private
     * @param {String} font
     * @returns {Number}
     */
    determineFontHeight(font) {
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

    /**
     * @override
     */
    render(displayManager) {
        if (this.active) {
            this.updateTexture();

            super.render(displayManager);
        }

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
}
