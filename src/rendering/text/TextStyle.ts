import { Color } from '@/core/Color';
import type { TextAlignment } from './types';

export type TextStyleColor = string | CanvasGradient | CanvasPattern;

export interface TextStyleOptions {
    align?: TextAlignment;
    fill?: TextStyleColor;
    fillColor?: Color;
    lineHeight?: number;
    stroke?: TextStyleColor;
    strokeThickness?: number;
    fontSize?: number;
    fontWeight?: string;
    fontFamily?: string;
    fontStyle?: 'normal' | 'italic';
    wordWrap?: boolean;
    wordWrapWidth?: number;
    baseline?: CanvasTextBaseline;
    lineJoin?: CanvasLineJoin;
    miterLimit?: number;
    padding?: number;
}

export class TextStyle {
    private _align: TextAlignment;
    private _fill: TextStyleColor;
    private _fillColor: Color;
    private _lineHeight: number;
    private _stroke: TextStyleColor;
    private _strokeThickness: number;
    private _fontSize: number;
    private _fontWeight: string;
    private _fontFamily: string;
    private _fontStyle: 'normal' | 'italic';
    private _wordWrap: boolean;
    private _wordWrapWidth: number;
    private _baseline: CanvasTextBaseline;
    private _lineJoin: CanvasLineJoin;
    private _miterLimit: number;
    private _padding: number;
    private _dirty = true;

    public constructor(options: TextStyleOptions = {}) {
        this._align = options.align ?? 'left';
        this._fill = options.fill ?? 'black';
        this._fillColor = options.fillColor ?? Color.white.clone();
        this._lineHeight = options.lineHeight ?? 1.2;
        this._stroke = options.stroke ?? 'black';
        this._strokeThickness = options.strokeThickness ?? 1;
        this._fontSize = options.fontSize ?? 20;
        this._fontWeight = options.fontWeight ?? 'bold';
        this._fontFamily = options.fontFamily ?? 'Arial';
        this._fontStyle = options.fontStyle ?? 'normal';
        this._wordWrap = options.wordWrap ?? false;
        this._wordWrapWidth = options.wordWrapWidth ?? 100;
        this._baseline = options.baseline ?? 'alphabetic';
        this._lineJoin = options.lineJoin ?? 'miter';
        this._miterLimit = options.miterLimit ?? 10;
        this._padding = options.padding ?? 0;
    }

    public get align(): TextAlignment {
        return this._align;
    }

    public set align(align: TextAlignment) {
        if (this._align !== align) {
            this._align = align;
            this._dirty = true;
        }
    }

    public get fill(): TextStyleColor {
        return this._fill;
    }

    public set fill(fill: TextStyleColor) {
        if (this._fill !== fill) {
            this._fill = fill;
            this._dirty = true;
        }
    }

    /**
     * Runtime fill color applied via `Mesh.tint`. Glyphs are always
     * rasterized white; this color multiplies them at draw time so that
     * changing the color never requires re-rasterizing cached glyphs.
     */
    public get fillColor(): Color {
        return this._fillColor;
    }

    public set fillColor(color: Color) {
        this._fillColor = color;
        this._dirty = true;
    }

    /**
     * Line-height multiplier applied to `fontSize` when computing vertical
     * spacing between lines. Defaults to 1.2.
     */
    public get lineHeight(): number {
        return this._lineHeight;
    }

    public set lineHeight(lineHeight: number) {
        if (this._lineHeight !== lineHeight) {
            this._lineHeight = lineHeight;
            this._dirty = true;
        }
    }

    public get stroke(): TextStyleColor {
        return this._stroke;
    }

    public set stroke(stroke: TextStyleColor) {
        if (this._stroke !== stroke) {
            this._stroke = stroke;
            this._dirty = true;
        }
    }

    public get strokeThickness(): number {
        return this._strokeThickness;
    }

    public set strokeThickness(strokeThickness: number) {
        if (this._strokeThickness !== strokeThickness) {
            this._strokeThickness = strokeThickness;
            this._dirty = true;
        }
    }

    public get fontSize(): number {
        return this._fontSize;
    }

    public set fontSize(fontSize: number) {
        if (this._fontSize !== fontSize) {
            this._fontSize = fontSize;
            this._dirty = true;
        }
    }

    public get fontWeight(): string {
        return this._fontWeight;
    }

    public set fontWeight(fontWeight: string) {
        if (this._fontWeight !== fontWeight) {
            this._fontWeight = fontWeight;
            this._dirty = true;
        }
    }

    public get fontFamily(): string {
        return this._fontFamily;
    }

    public set fontFamily(fontFamily: string) {
        if (this._fontFamily !== fontFamily) {
            this._fontFamily = fontFamily;
            this._dirty = true;
        }
    }

    public get fontStyle(): 'normal' | 'italic' {
        return this._fontStyle;
    }

    public set fontStyle(fontStyle: 'normal' | 'italic') {
        if (this._fontStyle !== fontStyle) {
            this._fontStyle = fontStyle;
            this._dirty = true;
        }
    }

    public get wordWrap(): boolean {
        return this._wordWrap;
    }

    public set wordWrap(wordWrap: boolean) {
        if (this._wordWrap !== wordWrap) {
            this._wordWrap = wordWrap;
            this._dirty = true;
        }
    }

    public get wordWrapWidth(): number {
        return this._wordWrapWidth;
    }

    public set wordWrapWidth(wordWrapWidth: number) {
        if (this._wordWrapWidth !== wordWrapWidth) {
            this._wordWrapWidth = wordWrapWidth;
            this._dirty = true;
        }
    }

    public get baseline(): CanvasTextBaseline {
        return this._baseline;
    }

    public set baseline(baseline: CanvasTextBaseline) {
        if (this._baseline !== baseline) {
            this._baseline = baseline;
            this._dirty = true;
        }
    }

    public get lineJoin(): CanvasLineJoin {
        return this._lineJoin;
    }

    public set lineJoin(lineJoin: CanvasLineJoin) {
        if (this._lineJoin !== lineJoin) {
            this._lineJoin = lineJoin;
            this._dirty = true;
        }
    }

    public get miterLimit(): number {
        return this._miterLimit;
    }

    public set miterLimit(miterLimit: number) {
        if (this._miterLimit !== miterLimit) {
            this._miterLimit = miterLimit;
            this._dirty = true;
        }
    }

    public get padding(): number {
        return this._padding;
    }

    public set padding(padding: number) {
        if (this._padding !== padding) {
            this._padding = padding;
            this._dirty = true;
        }
    }

    public get dirty(): boolean {
        return this._dirty;
    }

    public set dirty(dirty: boolean) {
        this._dirty = dirty;
    }

    public get font(): string {
        return `${this._fontWeight} ${this._fontSize}px ${this._fontFamily}`;
    }

    public apply(context: CanvasRenderingContext2D): this {
        context.font = this.font;
        context.fillStyle = this.fill;
        context.strokeStyle = this.stroke;
        context.lineWidth = this.strokeThickness;
        context.textBaseline = this.baseline;
        context.lineJoin = this.lineJoin;
        context.miterLimit = this.miterLimit;

        return this;
    }

    public copy(style: TextStyle): this {
        if (style !== this) {
            this.align = style.align;
            this.fill = style.fill;
            this._fillColor = style.fillColor.clone();
            this.lineHeight = style.lineHeight;
            this.stroke = style.stroke;
            this.strokeThickness = style.strokeThickness;
            this.fontSize = style.fontSize;
            this.fontWeight = style.fontWeight;
            this.fontFamily = style.fontFamily;
            this.fontStyle = style.fontStyle;
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

    public clone(): TextStyle {
        return new TextStyle().copy(this);
    }
}
