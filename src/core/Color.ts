import { clamp } from 'utils/math';
import { Cloneable } from "types/types";

export class Color implements Cloneable {

    private _r: number;
    private _g: number;
    private _b: number;
    private _a: number;
    private _rgba: number | null = null;
    private _array: Float32Array | null = null;

    constructor(r = 0, g = 0, b = 0, a = 1) {
        this._r = r & 255;
        this._g = g & 255;
        this._b = b & 255;
        this._a = clamp(a, 0, 1);
    }

    public get r(): number {
        return this._r;
    }

    public set r(red: number) {
        this._r = red & 255;
        this._rgba = null;
    }

    public get g(): number {
        return this._g;
    }

    public set g(green: number) {
        this._g = green & 255;
        this._rgba = null;
    }

    public get b(): number {
        return this._b;
    }

    public set b(blue: number) {
        this._b = blue & 255;
        this._rgba = null;
    }

    public get a(): number {
        return this._a;
    }

    public set a(alpha: number) {
        this._a = clamp(alpha, 0, 1);
        this._rgba = null;
    }

    public get red(): number {
        return this.r;
    }

    public set red(red: number) {
        this.r = red;
    }

    public get green(): number {
        return this.g;
    }

    public set green(green: number) {
        this.g = green;
    }

    public get blue(): number {
        return this.b;
    }

    public set blue(blue: number) {
        this.b = blue;
    }

    public get alpha(): number {
        return this.a;
    }

    public set alpha(alpha: number) {
        this.a = alpha;
    }

    public set(r: number = this._r, g: number = this._g, b: number = this._b, a: number = this._a): this {
        this._r = r & 255;
        this._g = g & 255;
        this._b = b & 255;
        this._a = clamp(a, 0, 1);

        this._rgba = null;

        return this;
    }

    public copy(color: Color): this {
        return this.set(color.r, color.g, color.b, color.a);
    }

    public clone(): this {
        return new (this.constructor as any)(this._r, this._g, this._b, this._a);
    }

    public equals({ r, g, b, a }: Partial<Color> = {}): boolean {
        return (r === undefined || this.r === r)
            && (g === undefined || this.g === g)
            && (b === undefined || this.b === b)
            && (a === undefined || this.a === a);
    }

    public toArray(normalized = false): Float32Array {
        if (!this._array) {
            this._array = new Float32Array(4);
        }

        if (normalized) {
            this._array[0] = this._r / 255;
            this._array[1] = this._g / 255;
            this._array[2] = this._b / 255;
            this._array[3] = this._a;
        } else {
            this._array[0] = this._r;
            this._array[1] = this._g;
            this._array[2] = this._b;
            this._array[3] = this._a;
        }

        return this._array;
    }

    public toString(prefixed = true): string {
        return `${prefixed ? '#' : ''}${((1 << 24) + (this._r << 16) + (this._g << 8) + this._b).toString(16).substr(1)}`;
    }

    public toRGBA(): number {
        if (this._rgba === null) {
            this._rgba = this._a && (((this._a * 255 | 0) << 24) + (this._b << 16) + (this._g << 8) + this._r) >>> 0;
        }

        return this._rgba;
    }

    public destroy() {
        if (this._array) {
            this._array = null;
        }
    }

    public static readonly AliceBlue = new Color(240, 248, 255, 1);
    public static readonly AntiqueWhite = new Color(250, 235, 215, 1);
    public static readonly Aqua = new Color(0, 255, 255, 1);
    public static readonly Aquamarine = new Color(127, 255, 212, 1);
    public static readonly Azure = new Color(240, 255, 255, 1);
    public static readonly Beige = new Color(245, 245, 220, 1);
    public static readonly Bisque = new Color(255, 228, 196, 1);
    public static readonly Black = new Color(0, 0, 0, 1);
    public static readonly BlanchedAlmond = new Color(255, 235, 205, 1);
    public static readonly Blue = new Color(0, 0, 255, 1);
    public static readonly BlueViolet = new Color(138, 43, 226, 1);
    public static readonly Brown = new Color(165, 42, 42, 1);
    public static readonly BurlyWood = new Color(222, 184, 135, 1);
    public static readonly CadetBlue = new Color(95, 158, 160, 1);
    public static readonly Chartreuse = new Color(127, 255, 0, 1);
    public static readonly Chocolate = new Color(210, 105, 30, 1);
    public static readonly Coral = new Color(255, 127, 80, 1);
    public static readonly CornflowerBlue = new Color(100, 149, 237, 1);
    public static readonly Cornsilk = new Color(255, 248, 220, 1);
    public static readonly Crimson = new Color(220, 20, 60, 1);
    public static readonly Cyan = new Color(0, 255, 255, 1);
    public static readonly DarkBlue = new Color(0, 0, 139, 1);
    public static readonly DarkCyan = new Color(0, 139, 139, 1);
    public static readonly DarkGoldenrod = new Color(184, 134, 11, 1);
    public static readonly DarkGray = new Color(169, 169, 169, 1);
    public static readonly DarkGreen = new Color(0, 100, 0, 1);
    public static readonly DarkKhaki = new Color(189, 183, 107, 1);
    public static readonly DarkMagenta = new Color(139, 0, 139, 1);
    public static readonly DarkOliveGreen = new Color(85, 107, 47, 1);
    public static readonly DarkOrange = new Color(255, 140, 0, 1);
    public static readonly DarkOrchid = new Color(153, 50, 204, 1);
    public static readonly DarkRed = new Color(139, 0, 0, 1);
    public static readonly DarkSalmon = new Color(233, 150, 122, 1);
    public static readonly DarkSeaGreen = new Color(143, 188, 139, 1);
    public static readonly DarkSlateBlue = new Color(72, 61, 139, 1);
    public static readonly DarkSlateGray = new Color(47, 79, 79, 1);
    public static readonly DarkTurquoise = new Color(0, 206, 209, 1);
    public static readonly DarkViolet = new Color(148, 0, 211, 1);
    public static readonly DeepPink = new Color(255, 20, 147, 1);
    public static readonly DeepSkyBlue = new Color(0, 191, 255, 1);
    public static readonly DimGray = new Color(105, 105, 105, 1);
    public static readonly DodgerBlue = new Color(30, 144, 255, 1);
    public static readonly Firebrick = new Color(178, 34, 34, 1);
    public static readonly FloralWhite = new Color(255, 250, 240, 1);
    public static readonly ForestGreen = new Color(34, 139, 34, 1);
    public static readonly Fuchsia = new Color(255, 0, 255, 1);
    public static readonly Gainsboro = new Color(220, 220, 220, 1);
    public static readonly GhostWhite = new Color(248, 248, 255, 1);
    public static readonly Gold = new Color(255, 215, 0, 1);
    public static readonly Goldenrod = new Color(218, 165, 32, 1);
    public static readonly Gray = new Color(128, 128, 128, 1);
    public static readonly Green = new Color(0, 128, 0, 1);
    public static readonly GreenYellow = new Color(173, 255, 47, 1);
    public static readonly Honeydew = new Color(240, 255, 240, 1);
    public static readonly HotPink = new Color(255, 105, 180, 1);
    public static readonly IndianRed = new Color(205, 92, 92, 1);
    public static readonly Indigo = new Color(75, 0, 130, 1);
    public static readonly Ivory = new Color(255, 255, 240, 1);
    public static readonly Khaki = new Color(240, 230, 140, 1);
    public static readonly Lavender = new Color(230, 230, 250, 1);
    public static readonly LavenderBlush = new Color(255, 240, 245, 1);
    public static readonly LawnGreen = new Color(124, 252, 0, 1);
    public static readonly LemonChiffon = new Color(255, 250, 205, 1);
    public static readonly LightBlue = new Color(173, 216, 230, 1);
    public static readonly LightCoral = new Color(240, 128, 128, 1);
    public static readonly LightCyan = new Color(224, 255, 255, 1);
    public static readonly LightGoldenrodYellow = new Color(250, 250, 210, 1);
    public static readonly LightGray = new Color(211, 211, 211, 1);
    public static readonly LightGreen = new Color(144, 238, 144, 1);
    public static readonly LightPink = new Color(255, 182, 193, 1);
    public static readonly LightSalmon = new Color(255, 160, 122, 1);
    public static readonly LightSeaGreen = new Color(32, 178, 170, 1);
    public static readonly LightSkyBlue = new Color(135, 206, 250, 1);
    public static readonly LightSlateGray = new Color(119, 136, 153, 1);
    public static readonly LightSteelBlue = new Color(176, 196, 222, 1);
    public static readonly LightYellow = new Color(255, 255, 224, 1);
    public static readonly Lime = new Color(0, 255, 0, 1);
    public static readonly LimeGreen = new Color(50, 205, 50, 1);
    public static readonly Linen = new Color(250, 240, 230, 1);
    public static readonly Magenta = new Color(255, 0, 255, 1);
    public static readonly Maroon = new Color(128, 0, 0, 1);
    public static readonly MediumAquamarine = new Color(102, 205, 170, 1);
    public static readonly MediumBlue = new Color(0, 0, 205, 1);
    public static readonly MediumOrchid = new Color(186, 85, 211, 1);
    public static readonly MediumPurple = new Color(147, 112, 219, 1);
    public static readonly MediumSeaGreen = new Color(60, 179, 113, 1);
    public static readonly MediumSlateBlue = new Color(123, 104, 238, 1);
    public static readonly MediumSpringGreen = new Color(0, 250, 154, 1);
    public static readonly MediumTurquoise = new Color(72, 209, 204, 1);
    public static readonly MediumVioletRed = new Color(199, 21, 133, 1);
    public static readonly MidnightBlue = new Color(25, 25, 112, 1);
    public static readonly MintCream = new Color(245, 255, 250, 1);
    public static readonly MistyRose = new Color(255, 228, 225, 1);
    public static readonly Moccasin = new Color(255, 228, 181, 1);
    public static readonly NavajoWhite = new Color(255, 222, 173, 1);
    public static readonly Navy = new Color(0, 0, 128, 1);
    public static readonly OldLace = new Color(253, 245, 230, 1);
    public static readonly Olive = new Color(128, 128, 0, 1);
    public static readonly OliveDrab = new Color(107, 142, 35, 1);
    public static readonly Orange = new Color(255, 165, 0, 1);
    public static readonly OrangeRed = new Color(255, 69, 0, 1);
    public static readonly Orchid = new Color(218, 112, 214, 1);
    public static readonly PaleGoldenrod = new Color(238, 232, 170, 1);
    public static readonly PaleGreen = new Color(152, 251, 152, 1);
    public static readonly PaleTurquoise = new Color(175, 238, 238, 1);
    public static readonly PaleVioletRed = new Color(219, 112, 147, 1);
    public static readonly PapayaWhip = new Color(255, 239, 213, 1);
    public static readonly PeachPuff = new Color(255, 218, 185, 1);
    public static readonly Peru = new Color(205, 133, 63, 1);
    public static readonly Pink = new Color(255, 192, 203, 1);
    public static readonly Plum = new Color(221, 160, 221, 1);
    public static readonly PowderBlue = new Color(176, 224, 230, 1);
    public static readonly Purple = new Color(128, 0, 128, 1);
    public static readonly Red = new Color(255, 0, 0, 1);
    public static readonly RosyBrown = new Color(188, 143, 143, 1);
    public static readonly RoyalBlue = new Color(65, 105, 225, 1);
    public static readonly SaddleBrown = new Color(139, 69, 19, 1);
    public static readonly Salmon = new Color(250, 128, 114, 1);
    public static readonly SandyBrown = new Color(244, 164, 96, 1);
    public static readonly SeaGreen = new Color(46, 139, 87, 1);
    public static readonly SeaShell = new Color(255, 245, 238, 1);
    public static readonly Sienna = new Color(160, 82, 45, 1);
    public static readonly Silver = new Color(192, 192, 192, 1);
    public static readonly SkyBlue = new Color(135, 206, 235, 1);
    public static readonly SlateBlue = new Color(106, 90, 205, 1);
    public static readonly SlateGray = new Color(112, 128, 144, 1);
    public static readonly Snow = new Color(255, 250, 250, 1);
    public static readonly SpringGreen = new Color(0, 255, 127, 1);
    public static readonly SteelBlue = new Color(70, 130, 180, 1);
    public static readonly Tan = new Color(210, 180, 140, 1);
    public static readonly Teal = new Color(0, 128, 128, 1);
    public static readonly Thistle = new Color(216, 191, 216, 1);
    public static readonly Tomato = new Color(255, 99, 71, 1);
    public static readonly TransparentBlack = new Color(0, 0, 0, 0);
    public static readonly TransparentWhite = new Color(255, 255, 255, 0);
    public static readonly Turquoise = new Color(64, 224, 208, 1);
    public static readonly Violet = new Color(238, 130, 238, 1);
    public static readonly Wheat = new Color(245, 222, 179, 1);
    public static readonly White = new Color(255, 255, 255, 1);
    public static readonly WhiteSmoke = new Color(245, 245, 245, 1);
    public static readonly Yellow = new Color(255, 255, 0, 1);
    public static readonly YellowGreen = new Color(154, 205, 50, 1);
}