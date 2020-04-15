import { Sprite } from './sprite/Sprite';
import { Texture } from './texture/Texture';
import { TextStyle, TextStyleOptions } from './TextStyle';
import { Rectangle } from '../math/Rectangle';
import { SamplerOptions } from "./texture/Sampler";
import { RenderManager } from './RenderManager';

const heightCache: Map<string, number> = new Map<string, number>();
const NewLinePattern = /(?:\r\n|\r|\n)/;

export class Text extends Sprite {

    private _text: string;
    private _style: TextStyle;
    private _canvas: HTMLCanvasElement;
    private _context: CanvasRenderingContext2D;
    private _dirty = true;

    constructor(text: string, style?: TextStyle | TextStyleOptions, samplerOptions?: Partial<SamplerOptions>, canvas: HTMLCanvasElement = document.createElement('canvas')) {
        super(new Texture(canvas, samplerOptions));

        this._text = text;
        this._style = (style instanceof TextStyle) ? style : new TextStyle(style);
        this._canvas = canvas;
        this._context = canvas.getContext('2d') as CanvasRenderingContext2D;

        this.updateTexture();
    }

    get text() {
        return this._text;
    }

    set text(text) {
        this.setText(text);
    }

    get style() {
        return this._style;
    }

    set style(style) {
        this.setStyle(style);
    }

    get canvas() {
        return this._canvas;
    }

    set canvas(canvas) {
        this.setCanvas(canvas);
    }

    setText(text: string) {
        if (this._text !== text) {
            this._text = text;
            this._dirty = true;
        }

        return this;
    }

    setStyle(style: TextStyle | TextStyleOptions) {
        this._style = (style instanceof TextStyle) ? style : new TextStyle(style);
        this._dirty = true;

        return this;
    }

    setCanvas(canvas: HTMLCanvasElement) {
        if (this._canvas !== canvas) {
            this._canvas = canvas;
            this._context = canvas.getContext('2d') as CanvasRenderingContext2D;
            this._dirty = true;

            this.setTextureFrame(Rectangle.Temp.set(0, 0, canvas.width, canvas.height));
        }

        return this;
    }

    updateTexture() {
        if (this._style && (this._dirty || this._style.dirty)) {
            const canvas = this._canvas,
                context = this._context,
                style = this._style.apply(context),
                text = style.wordWrap ? this.getWordWrappedText() : this._text,
                lineHeight = Text.determineFontHeight(context.font) + style.strokeThickness,
                lines = text.split(NewLinePattern),
                lineMetrics = lines.map((line) => context.measureText(line)),
                maxLineWidth = lineMetrics.reduce((max, measure) => Math.max(max, measure.width), 0),
                canvasWidth = Math.ceil((maxLineWidth + style.strokeThickness) + (style.padding * 2)),
                canvasHeight = Math.ceil((lineHeight * lines.length) + (style.padding * 2));

            if (canvasWidth !== canvas.width || canvasHeight !== canvas.height) {
                canvas.width = canvasWidth;
                canvas.height = canvasHeight;

                this.setTextureFrame(Rectangle.Temp.set(0, 0, canvasWidth, canvasHeight));
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

            this.texture!.updateSource();

            this._dirty = false;
            this._style.dirty = false;
        }

        return this;
    }

    getWordWrappedText(): string {
        const context = this._context,
            wrapWidth = this._style.wordWrapWidth,
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

    render(renderManager: RenderManager): this {
        if (this.visible) {
            this.updateTexture();

            super.render(renderManager);
        }

        return this;
    }

    destroy() {
        super.destroy();
    }

    static determineFontHeight(font: string): number {
        if (!heightCache.has(font)) {
            const body = document.body;
            const dummy = document.createElement('div');

            dummy.appendChild(document.createTextNode('M'));
            dummy.setAttribute('style', `font: ${font};position:absolute;top:0;left:0`);

            body.appendChild(dummy);
            heightCache.set(font, dummy.offsetHeight);
            body.removeChild(dummy);
        }

        return heightCache.get(font)!;
    }
}
