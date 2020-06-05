
export type TextStyleColor = string | CanvasGradient | CanvasPattern;

export interface TextStyleOptions {
    align?: string;
    fill?: TextStyleColor;
    stroke?: TextStyleColor;
    strokeThickness?: number;
    fontSize?: number;
    fontWeight?: string;
    fontFamily?: string;
    wordWrap?: boolean;
    wordWrapWidth?: number;
    baseline?: CanvasTextBaseline;
    lineJoin?: CanvasLineJoin;
    miterLimit?: number;
    padding?: number;
}

export class TextStyle {
    private _align: string;
    private _fill: TextStyleColor;
    private _stroke: TextStyleColor;
    private _strokeThickness: number;
    private _fontSize: number;
    private _fontWeight: string;
    private _fontFamily: string;
    private _wordWrap: boolean;
    private _wordWrapWidth: number;
    private _baseline: CanvasTextBaseline;
    private _lineJoin: CanvasLineJoin;
    private _miterLimit: number;
    private _padding: number;
    private _dirty = true;

    constructor(options: TextStyleOptions = {}) {
        this._align = options.align ?? 'left';
        this._fill = options.fill ?? 'black';
        this._stroke = options.stroke ?? 'black';
        this._strokeThickness = options.strokeThickness ?? 1;
        this._fontSize = options.fontSize ?? 20;
        this._fontWeight = options.fontWeight ?? 'bold';
        this._fontFamily = options.fontFamily ?? 'Arial';
        this._wordWrap = options.wordWrap ?? false;
        this._wordWrapWidth = options.wordWrapWidth ?? 100;
        this._baseline = options.baseline ?? 'alphabetic';
        this._lineJoin = options.lineJoin ?? 'miter';
        this._miterLimit = options.miterLimit ?? 10;
        this._padding = options.padding ?? 0;
    }

    get align(): string {
        return this._align;
    }

    set align(align: string) {
        if (this._align !== align) {
            this._align = align;
            this._dirty = true;
        }
    }

    get fill(): TextStyleColor {
        return this._fill;
    }

    set fill(fill: TextStyleColor) {
        if (this._fill !== fill) {
            this._fill = fill;
            this._dirty = true;
        }
    }

    get stroke(): TextStyleColor {
        return this._stroke;
    }

    set stroke(stroke: TextStyleColor) {
        if (this._stroke !== stroke) {
            this._stroke = stroke;
            this._dirty = true;
        }
    }

    get strokeThickness(): number {
        return this._strokeThickness;
    }

    set strokeThickness(strokeThickness: number) {
        if (this._strokeThickness !== strokeThickness) {
            this._strokeThickness = strokeThickness;
            this._dirty = true;
        }
    }

    get fontSize(): number {
        return this._fontSize;
    }

    set fontSize(fontSize: number) {
        if (this._fontSize !== fontSize) {
            this._fontSize = fontSize;
            this._dirty = true;
        }
    }

    get fontWeight(): string {
        return this._fontWeight;
    }

    set fontWeight(fontWeight: string) {
        if (this._fontWeight !== fontWeight) {
            this._fontWeight = fontWeight;
            this._dirty = true;
        }
    }

    get fontFamily(): string {
        return this._fontFamily;
    }

    set fontFamily(fontFamily: string) {
        if (this._fontFamily !== fontFamily) {
            this._fontFamily = fontFamily;
            this._dirty = true;
        }
    }

    get wordWrap(): boolean {
        return this._wordWrap;
    }

    set wordWrap(wordWrap: boolean) {
        if (this._wordWrap !== wordWrap) {
            this._wordWrap = wordWrap;
            this._dirty = true;
        }
    }

    get wordWrapWidth(): number {
        return this._wordWrapWidth;
    }

    set wordWrapWidth(wordWrapWidth: number) {
        if (this._wordWrapWidth !== wordWrapWidth) {
            this._wordWrapWidth = wordWrapWidth;
            this._dirty = true;
        }
    }

    get baseline(): CanvasTextBaseline {
        return this._baseline;
    }

    set baseline(baseline: CanvasTextBaseline) {
        if (this._baseline !== baseline) {
            this._baseline = baseline;
            this._dirty = true;
        }
    }

    get lineJoin(): CanvasLineJoin {
        return this._lineJoin;
    }

    set lineJoin(lineJoin: CanvasLineJoin) {
        if (this._lineJoin !== lineJoin) {
            this._lineJoin = lineJoin;
            this._dirty = true;
        }
    }

    get miterLimit(): number {
        return this._miterLimit;
    }

    set miterLimit(miterLimit: number) {
        if (this._miterLimit !== miterLimit) {
            this._miterLimit = miterLimit;
            this._dirty = true;
        }
    }

    get padding(): number {
        return this._padding;
    }

    set padding(padding: number) {
        if (this._padding !== padding) {
            this._padding = padding;
            this._dirty = true;
        }
    }

    get dirty(): boolean {
        return this._dirty;
    }

    set dirty(dirty: boolean) {
        this._dirty = dirty;
    }

    get font(): string {
        return `${this._fontWeight} ${this._fontSize}px ${this._fontFamily}`;
    }

    apply(context: CanvasRenderingContext2D): this {
        context.font = this.font;
        context.fillStyle = this.fill;
        context.strokeStyle = this.stroke;
        context.lineWidth = this.strokeThickness;
        context.textBaseline = this.baseline;
        context.lineJoin = this.lineJoin;
        context.miterLimit = this.miterLimit;

        return this;
    }

    copy(style: TextStyle): this {
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

    clone(): TextStyle {
        return new TextStyle().copy(this);
    }
}
