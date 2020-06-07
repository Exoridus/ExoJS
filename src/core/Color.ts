import { clamp } from 'utils/math';
import type { ICloneable } from 'types/types';

export class Color implements ICloneable {

    private _r: number;
    private _g: number;
    private _b: number;
    private _a: number;
    private _rgba: number | null = null;
    private _array: Float32Array | null = null;

    public constructor(r = 0, g = 0, b = 0, a = 1) {
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

    public toRgba(): number {
        if (this._rgba === null) {
            this._rgba = this._a && (((this._a * 255 | 0) << 24) + (this._b << 16) + (this._g << 8) + this._r) >>> 0;
        }

        return this._rgba;
    }

    public destroy(): void {
        if (this._array) {
            this._array = null;
        }
    }

    public static readonly aliceBlue = new Color(240, 248, 255, 1);
    public static readonly antiqueWhite = new Color(250, 235, 215, 1);
    public static readonly aqua = new Color(0, 255, 255, 1);
    public static readonly aquamarine = new Color(127, 255, 212, 1);
    public static readonly azure = new Color(240, 255, 255, 1);
    public static readonly beige = new Color(245, 245, 220, 1);
    public static readonly bisque = new Color(255, 228, 196, 1);
    public static readonly black = new Color(0, 0, 0, 1);
    public static readonly blanchedAlmond = new Color(255, 235, 205, 1);
    public static readonly blue = new Color(0, 0, 255, 1);
    public static readonly blueViolet = new Color(138, 43, 226, 1);
    public static readonly brown = new Color(165, 42, 42, 1);
    public static readonly burlyWood = new Color(222, 184, 135, 1);
    public static readonly cadetBlue = new Color(95, 158, 160, 1);
    public static readonly chartreuse = new Color(127, 255, 0, 1);
    public static readonly chocolate = new Color(210, 105, 30, 1);
    public static readonly coral = new Color(255, 127, 80, 1);
    public static readonly cornflowerBlue = new Color(100, 149, 237, 1);
    public static readonly cornsilk = new Color(255, 248, 220, 1);
    public static readonly crimson = new Color(220, 20, 60, 1);
    public static readonly cyan = new Color(0, 255, 255, 1);
    public static readonly darkBlue = new Color(0, 0, 139, 1);
    public static readonly darkCyan = new Color(0, 139, 139, 1);
    public static readonly darkGoldenrod = new Color(184, 134, 11, 1);
    public static readonly darkGray = new Color(169, 169, 169, 1);
    public static readonly darkGreen = new Color(0, 100, 0, 1);
    public static readonly darkKhaki = new Color(189, 183, 107, 1);
    public static readonly darkMagenta = new Color(139, 0, 139, 1);
    public static readonly darkOliveGreen = new Color(85, 107, 47, 1);
    public static readonly darkOrange = new Color(255, 140, 0, 1);
    public static readonly darkOrchid = new Color(153, 50, 204, 1);
    public static readonly darkRed = new Color(139, 0, 0, 1);
    public static readonly darkSalmon = new Color(233, 150, 122, 1);
    public static readonly darkSeaGreen = new Color(143, 188, 139, 1);
    public static readonly darkSlateBlue = new Color(72, 61, 139, 1);
    public static readonly darkSlateGray = new Color(47, 79, 79, 1);
    public static readonly darkTurquoise = new Color(0, 206, 209, 1);
    public static readonly darkViolet = new Color(148, 0, 211, 1);
    public static readonly deepPink = new Color(255, 20, 147, 1);
    public static readonly deepSkyBlue = new Color(0, 191, 255, 1);
    public static readonly dimGray = new Color(105, 105, 105, 1);
    public static readonly dodgerBlue = new Color(30, 144, 255, 1);
    public static readonly firebrick = new Color(178, 34, 34, 1);
    public static readonly floralWhite = new Color(255, 250, 240, 1);
    public static readonly forestGreen = new Color(34, 139, 34, 1);
    public static readonly fuchsia = new Color(255, 0, 255, 1);
    public static readonly gainsboro = new Color(220, 220, 220, 1);
    public static readonly ghostWhite = new Color(248, 248, 255, 1);
    public static readonly gold = new Color(255, 215, 0, 1);
    public static readonly goldenrod = new Color(218, 165, 32, 1);
    public static readonly gray = new Color(128, 128, 128, 1);
    public static readonly green = new Color(0, 128, 0, 1);
    public static readonly greenYellow = new Color(173, 255, 47, 1);
    public static readonly honeydew = new Color(240, 255, 240, 1);
    public static readonly hotPink = new Color(255, 105, 180, 1);
    public static readonly indianRed = new Color(205, 92, 92, 1);
    public static readonly indigo = new Color(75, 0, 130, 1);
    public static readonly ivory = new Color(255, 255, 240, 1);
    public static readonly khaki = new Color(240, 230, 140, 1);
    public static readonly lavender = new Color(230, 230, 250, 1);
    public static readonly lavenderBlush = new Color(255, 240, 245, 1);
    public static readonly lawnGreen = new Color(124, 252, 0, 1);
    public static readonly lemonChiffon = new Color(255, 250, 205, 1);
    public static readonly lightBlue = new Color(173, 216, 230, 1);
    public static readonly lightCoral = new Color(240, 128, 128, 1);
    public static readonly lightCyan = new Color(224, 255, 255, 1);
    public static readonly lightGoldenrodYellow = new Color(250, 250, 210, 1);
    public static readonly lightGray = new Color(211, 211, 211, 1);
    public static readonly lightGreen = new Color(144, 238, 144, 1);
    public static readonly lightPink = new Color(255, 182, 193, 1);
    public static readonly lightSalmon = new Color(255, 160, 122, 1);
    public static readonly lightSeaGreen = new Color(32, 178, 170, 1);
    public static readonly lightSkyBlue = new Color(135, 206, 250, 1);
    public static readonly lightSlateGray = new Color(119, 136, 153, 1);
    public static readonly lightSteelBlue = new Color(176, 196, 222, 1);
    public static readonly lightYellow = new Color(255, 255, 224, 1);
    public static readonly lime = new Color(0, 255, 0, 1);
    public static readonly limeGreen = new Color(50, 205, 50, 1);
    public static readonly linen = new Color(250, 240, 230, 1);
    public static readonly magenta = new Color(255, 0, 255, 1);
    public static readonly maroon = new Color(128, 0, 0, 1);
    public static readonly mediumAquamarine = new Color(102, 205, 170, 1);
    public static readonly mediumBlue = new Color(0, 0, 205, 1);
    public static readonly mediumOrchid = new Color(186, 85, 211, 1);
    public static readonly mediumPurple = new Color(147, 112, 219, 1);
    public static readonly mediumSeaGreen = new Color(60, 179, 113, 1);
    public static readonly mediumSlateBlue = new Color(123, 104, 238, 1);
    public static readonly mediumSpringGreen = new Color(0, 250, 154, 1);
    public static readonly mediumTurquoise = new Color(72, 209, 204, 1);
    public static readonly mediumVioletRed = new Color(199, 21, 133, 1);
    public static readonly midnightBlue = new Color(25, 25, 112, 1);
    public static readonly mintCream = new Color(245, 255, 250, 1);
    public static readonly mistyRose = new Color(255, 228, 225, 1);
    public static readonly moccasin = new Color(255, 228, 181, 1);
    public static readonly navajoWhite = new Color(255, 222, 173, 1);
    public static readonly navy = new Color(0, 0, 128, 1);
    public static readonly oldLace = new Color(253, 245, 230, 1);
    public static readonly olive = new Color(128, 128, 0, 1);
    public static readonly oliveDrab = new Color(107, 142, 35, 1);
    public static readonly orange = new Color(255, 165, 0, 1);
    public static readonly orangeRed = new Color(255, 69, 0, 1);
    public static readonly orchid = new Color(218, 112, 214, 1);
    public static readonly paleGoldenrod = new Color(238, 232, 170, 1);
    public static readonly paleGreen = new Color(152, 251, 152, 1);
    public static readonly paleTurquoise = new Color(175, 238, 238, 1);
    public static readonly paleVioletRed = new Color(219, 112, 147, 1);
    public static readonly papayaWhip = new Color(255, 239, 213, 1);
    public static readonly peachPuff = new Color(255, 218, 185, 1);
    public static readonly peru = new Color(205, 133, 63, 1);
    public static readonly pink = new Color(255, 192, 203, 1);
    public static readonly plum = new Color(221, 160, 221, 1);
    public static readonly powderBlue = new Color(176, 224, 230, 1);
    public static readonly purple = new Color(128, 0, 128, 1);
    public static readonly red = new Color(255, 0, 0, 1);
    public static readonly rosyBrown = new Color(188, 143, 143, 1);
    public static readonly royalBlue = new Color(65, 105, 225, 1);
    public static readonly saddleBrown = new Color(139, 69, 19, 1);
    public static readonly salmon = new Color(250, 128, 114, 1);
    public static readonly sandyBrown = new Color(244, 164, 96, 1);
    public static readonly seaGreen = new Color(46, 139, 87, 1);
    public static readonly seaShell = new Color(255, 245, 238, 1);
    public static readonly sienna = new Color(160, 82, 45, 1);
    public static readonly silver = new Color(192, 192, 192, 1);
    public static readonly skyBlue = new Color(135, 206, 235, 1);
    public static readonly slateBlue = new Color(106, 90, 205, 1);
    public static readonly slateGray = new Color(112, 128, 144, 1);
    public static readonly snow = new Color(255, 250, 250, 1);
    public static readonly springGreen = new Color(0, 255, 127, 1);
    public static readonly steelBlue = new Color(70, 130, 180, 1);
    public static readonly tan = new Color(210, 180, 140, 1);
    public static readonly teal = new Color(0, 128, 128, 1);
    public static readonly thistle = new Color(216, 191, 216, 1);
    public static readonly tomato = new Color(255, 99, 71, 1);
    public static readonly transparentBlack = new Color(0, 0, 0, 0);
    public static readonly transparentWhite = new Color(255, 255, 255, 0);
    public static readonly turquoise = new Color(64, 224, 208, 1);
    public static readonly violet = new Color(238, 130, 238, 1);
    public static readonly wheat = new Color(245, 222, 179, 1);
    public static readonly white = new Color(255, 255, 255, 1);
    public static readonly whiteSmoke = new Color(245, 245, 245, 1);
    public static readonly yellow = new Color(255, 255, 0, 1);
    public static readonly yellowGreen = new Color(154, 205, 50, 1);
}