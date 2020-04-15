
export interface TextStyleOptions {
    align?: string;
    fill?: string | CanvasGradient | CanvasPattern;
    stroke?: string | CanvasGradient | CanvasPattern;
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
    private _fill: string | CanvasGradient | CanvasPattern;
    private _stroke: string | CanvasGradient | CanvasPattern;
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
        this._strokeThickness = options.strokeThickness ?? 0;
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

    get align() {
        return this._align;
    }

    set align(align) {
        if (this._align !== align) {
            this._align = align;
            this._dirty = true;
        }
    }

    get fill() {
        return this._fill;
    }

    set fill(fill) {
        if (this._fill !== fill) {
            this._fill = fill;
            this._dirty = true;
        }
    }

    get stroke() {
        return this._stroke;
    }

    set stroke(stroke) {
        if (this._stroke !== stroke) {
            this._stroke = stroke;
            this._dirty = true;
        }
    }

    get strokeThickness() {
        return this._strokeThickness;
    }

    set strokeThickness(strokeThickness) {
        if (this._strokeThickness !== strokeThickness) {
            this._strokeThickness = strokeThickness;
            this._dirty = true;
        }
    }

    get fontSize() {
        return this._fontSize;
    }

    set fontSize(fontSize) {
        if (this._fontSize !== fontSize) {
            this._fontSize = fontSize;
            this._dirty = true;
        }
    }

    get fontWeight() {
        return this._fontWeight;
    }

    set fontWeight(fontWeight) {
        if (this._fontWeight !== fontWeight) {
            this._fontWeight = fontWeight;
            this._dirty = true;
        }
    }

    get fontFamily() {
        return this._fontFamily;
    }

    set fontFamily(fontFamily) {
        if (this._fontFamily !== fontFamily) {
            this._fontFamily = fontFamily;
            this._dirty = true;
        }
    }

    get wordWrap() {
        return this._wordWrap;
    }

    set wordWrap(wordWrap) {
        if (this._wordWrap !== wordWrap) {
            this._wordWrap = wordWrap;
            this._dirty = true;
        }
    }

    get wordWrapWidth() {
        return this._wordWrapWidth;
    }

    set wordWrapWidth(wordWrapWidth) {
        if (this._wordWrapWidth !== wordWrapWidth) {
            this._wordWrapWidth = wordWrapWidth;
            this._dirty = true;
        }
    }

    get baseline() {
        return this._baseline;
    }

    set baseline(baseline) {
        if (this._baseline !== baseline) {
            this._baseline = baseline;
            this._dirty = true;
        }
    }

    get lineJoin() {
        return this._lineJoin;
    }

    set lineJoin(lineJoin) {
        if (this._lineJoin !== lineJoin) {
            this._lineJoin = lineJoin;
            this._dirty = true;
        }
    }

    get miterLimit() {
        return this._miterLimit;
    }

    set miterLimit(miterLimit) {
        if (this._miterLimit !== miterLimit) {
            this._miterLimit = miterLimit;
            this._dirty = true;
        }
    }

    get padding() {
        return this._padding;
    }

    set padding(padding) {
        if (this._padding !== padding) {
            this._padding = padding;
            this._dirty = true;
        }
    }

    get dirty() {
        return this._dirty;
    }

    set dirty(dirty) {
        this._dirty = dirty;
    }

    get font() {
        return `${this._fontWeight} ${this._fontSize}px ${this._fontFamily}`;
    }

    apply(context: CanvasRenderingContext2D) {
        context.font = this.font;
        context.fillStyle = this.fill;
        context.strokeStyle = this.stroke;
        context.lineWidth = this.strokeThickness;
        context.textBaseline = this.baseline;
        context.lineJoin = this.lineJoin;
        context.miterLimit = this.miterLimit;

        return this;
    }

    copy(style: TextStyle) {
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

    clone() {
        return new TextStyle().copy(this);
    }
}
