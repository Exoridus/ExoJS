import { NEWLINE } from '../const';
import Sprite from './sprite/Sprite';
import Texture from './Texture';
import TextStyle from './TextStyle';

const heightCache = new Map();

/**
 * @class Text
 * @extends {Sprite}
 */
export default class Text extends Sprite {

    /**
     * @constructor
     * @param {String} text
     * @param {TextStyle|Object} [style=new TextStyle()]
     * @param {HTMLCanvasElement} [canvas=document.createElement('canvas')]
     */
    constructor(text, style = new TextStyle(), canvas = document.createElement('canvas')) {
        super(new Texture(canvas));

        /**
         * @private
         * @member {String}
         */
        this._text = null;

        /**
         * @private
         * @member {TextStyle}
         */
        this._style = null;

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
         * @member {Boolean}
         */
        this._dirty = true;

        this.setText(text)
            .setStyle(style)
            .updateTexture();
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
     * @member {TextStyle}
     */
    get style() {
        return this._style;
    }

    set style(style) {
        this.setStyle(style);
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
     * @param {TextStyle|Object} style
     * @returns {Text}
     */
    setStyle(style) {
        this._style = (style instanceof TextStyle) ? style : new TextStyle(style || {});
        this._dirty = true;

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

            this._updateCanvas();
        }

        return this;
    }

    /**
     * @override
     */
    updateTexture() {
        if (this._dirty || this._style.dirty) {
            const canvas = this._canvas,
                context = this._context,
                style = this._style.apply(context),
                text = style.wordWrap ? this._getWordWrappedText(style.wordWrapWidth) : this._text,
                lineHeight = this._determineFontHeight(context.font) + style.strokeThickness,
                lines = text.split(NEWLINE),
                lineMetrics = lines.map((line) => context.measureText(line)),
                maxLineWidth = lineMetrics.reduce((max, measure) => Math.max(max, measure.width), 0),
                canvasWidth = Math.ceil((maxLineWidth + style.strokeThickness) + (style.padding * 2)),
                canvasHeight = Math.ceil((lineHeight * lines.length) + (style.padding * 2));

            if (canvasWidth !== canvas.width || canvasHeight !== canvas.height) {
                canvas.width = canvasWidth;
                canvas.height = canvasHeight;

                this._updateCanvas();
            } else {
                context.clearRect(0, 0, canvasWidth, canvasHeight);
            }

            style.apply(context);

            for (let i = 0; i < lines.length; i++) {
                const metrics = lineMetrics[i],
                    lineWidth = (maxLineWidth - metrics.width),
                    offset = (style.align === 'right') ? lineWidth : lineWidth / 2,
                    padding = style.padding + (style.strokeThickness / 2),
                    lineX = metrics.actualBoundingBoxLeft + (style.align === 'left' ? 0 : offset) + padding,
                    lineY = metrics.fontBoundingBoxAscent + (lineHeight * i) + padding;

                if (style.stroke && style.strokeThickness) {
                    context.strokeText(lines[i], lineX, lineY);
                }

                if (style.fill) {
                    context.fillText(lines[i], lineX, lineY);
                }
            }

            this.texture.updateSource();

            this._dirty = false;
            this._style.dirty = false;
        }

        return this;
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
     * @override
     */
    destroy() {
        super.destroy();

        this._text = null;
        this._style = null;
        this._canvas = null;
        this._context = null;
        this._dirty = null;
    }

    /**
     * @private
     * @chainable
     * @returns {Text}
     */
    _updateCanvas() {
        const canvas = this._canvas;

        this.localBounds.set(0, 0, canvas.width, canvas.height);
        this.setTextureFrame(this.localBounds);
        this.scale.set(1, 1);

        return this;
    }

    /**
     * @private
     * @returns {String}
     */
    _getWordWrappedText(wordWrapWidth) {
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
    _determineFontHeight(font) {
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
