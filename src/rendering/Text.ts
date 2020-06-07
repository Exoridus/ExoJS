import { Sprite } from 'rendering/sprite/Sprite';
import { Texture } from 'rendering/texture/Texture';
import { TextStyle, ITextStyleOptions } from 'rendering/TextStyle';
import { Rectangle } from 'math/Rectangle';
import type { ISamplerOptions } from 'rendering/texture/Sampler';
import type { RenderManager } from 'rendering/RenderManager';
import { determineFontHeight } from '../utils/rendering';

const newLinePattern = /(?:\r\n|\r|\n)/;

export class Text extends Sprite {

    private _text: string;
    private _style: TextStyle;
    private _canvas: HTMLCanvasElement;
    private _context: CanvasRenderingContext2D;
    private _dirty = true;

    public constructor(text: string, style?: TextStyle | ITextStyleOptions, samplerOptions?: Partial<ISamplerOptions>, canvas: HTMLCanvasElement = document.createElement('canvas')) {
        super(new Texture(canvas, samplerOptions));

        this._text = text;
        this._style = (style && style instanceof TextStyle) ? style : new TextStyle(style);
        this._canvas = canvas;
        this._context = canvas.getContext('2d') as CanvasRenderingContext2D;

        this.updateTexture();
    }

    public get text(): string {
        return this._text;
    }

    public set text(text: string) {
        this.setText(text);
    }

    public get style(): TextStyle {
        return this._style;
    }

    public set style(style: TextStyle) {
        this.setStyle(style);
    }

    public get canvas(): HTMLCanvasElement {
        return this._canvas;
    }

    public set canvas(canvas: HTMLCanvasElement) {
        this.setCanvas(canvas);
    }

    public setText(text: string): this {
        if (this._text !== text) {
            this._text = text;
            this._dirty = true;
        }

        return this;
    }

    public setStyle(style: TextStyle | ITextStyleOptions): this {
        this._style = (style instanceof TextStyle) ? style : new TextStyle(style);
        this._dirty = true;

        return this;
    }

    public setCanvas(canvas: HTMLCanvasElement): this {
        if (this._canvas !== canvas) {
            this._canvas = canvas;
            this._context = canvas.getContext('2d') as CanvasRenderingContext2D;
            this._dirty = true;

            this.setTextureFrame(Rectangle.temp.set(0, 0, canvas.width, canvas.height));
        }

        return this;
    }

    public updateTexture(): this {
        if (this._style && (this._dirty || this._style.dirty)) {
            const canvas = this._canvas,
                context = this._context,
                style = this._style.apply(context),
                text = style.wordWrap ? this.getWordWrappedText() : this._text,
                lineHeight = determineFontHeight(context.font) + style.strokeThickness,
                lines = text.split(newLinePattern),
                lineMetrics = lines.map((line) => context.measureText(line)),
                maxLineWidth = lineMetrics.reduce((max, measure) => Math.max(max, measure.width), 0),
                canvasWidth = Math.ceil((maxLineWidth + style.strokeThickness) + (style.padding * 2)),
                canvasHeight = Math.ceil((lineHeight * lines.length) + (style.padding * 2));

            if (canvasWidth !== canvas.width || canvasHeight !== canvas.height) {
                canvas.width = canvasWidth;
                canvas.height = canvasHeight;

                this.setTextureFrame(Rectangle.temp.set(0, 0, canvasWidth, canvasHeight));
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
                    lineY = metrics.actualBoundingBoxAscent + (lineHeight * i) + padding;

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

    public getWordWrappedText(): string {
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

    public render(renderManager: RenderManager): this {
        if (this.visible) {
            this.updateTexture();
            super.render(renderManager);
        }

        return this;
    }
}
