import { clamp } from '#math/utils';

import { assert } from './dev';
import type { Cloneable } from './types';

/** Clamp a value into the 0..255 integer channel range (saturating, not wrapping). */
const toChannel = (value: number): number => clamp(value, 0, 255) | 0;

/** Largest packed value the numeric colour form can express: `0xRRGGBB`, alpha excluded by design. */
const MAX_PACKED_RGB = 0xffffff;

/**
 * Anything {@link Color.from} accepts.
 *
 * A number is always `0xRRGGBB` and never carries alpha - see {@link Color.from}
 * for why the packed form stops at six digits.
 */
export type ColorInput = Color | number | string | { r: number; g: number; b: number; a?: number };

const HEX_PATTERN = /^#?(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i;

/** Expand a 3- or 4-digit shorthand by doubling each digit (`f0f` becomes `ff00ff`); longer forms pass through. */
const expandShorthand = (digits: string): string => (digits.length > 4 ? digits : [...digits].map(digit => digit + digit).join(''));

/**
 * 32-bit RGBA color value with channel-wise accessors. Red, green, and blue
 * are integers in 0..255; alpha is a float in 0..1. Out-of-range values are
 * saturated on assignment (RGB clamped to 0..255 and truncated to an integer,
 * alpha clamped to 0..1) - values outside the range no longer wrap around.
 *
 * The class predefines the eight corners of the RGB cube plus the two
 * transparent ends as shared static instances (`Color.black`, `Color.magenta`,
 * `Color.transparent`, ...). These instances are shared on purpose - do not
 * mutate them; {@link Color.clone} first if you need a mutable starting point.
 * Development builds freeze them, so writing to one throws there and passes
 * unnoticed in production. Any other color is written as a value:
 * `new Color(0x6495ed)`, `Color.fromHex('#6495ed')`, or channel by channel.
 *
 * Internally caches the packed RGBA32 representation and a normalized
 * `Float32Array` for upload to GPU buffers; both are invalidated on
 * channel writes and rebuilt lazily.
 */
export class Color implements Cloneable<Color> {
  private _r: number;
  private _g: number;
  private _b: number;
  private _a: number;
  private _rgba: number | null = null;
  private _array: Float32Array | null = null;

  /**
   * Build from a packed `0xRRGGBB` value, with alpha as a separate argument.
   *
   * The packed form deliberately stops at six digits: JavaScript numbers carry
   * no leading zeros, so `0x00FF00FF` (opaque green as RGBA) and `0xFF00FF`
   * (magenta as RGB) are the *same* value at runtime and cannot be told apart.
   * Use a string (`'#00ff00ff'`) when alpha belongs in the literal.
   */
  public constructor(rgb?: number, alpha?: number);
  /** Build channel by channel. RGB are 0..255 integers, alpha is a 0..1 float. */
  // Kept separate on purpose: collapsing them into `(r?, g?, b?, a?)` would let
  // the IDE offer `r, g` for a two-argument call, which is exactly the reading
  // this overload pair exists to rule out - two arguments mean a packed value
  // and its alpha, never two channels.
  // eslint-disable-next-line @typescript-eslint/unified-signatures
  public constructor(r: number, g: number, b: number, a?: number);
  public constructor(r = 0, g?: number, b?: number, a = 1) {
    if (b === undefined) {
      assert(r >= 0 && r <= MAX_PACKED_RGB, 'Color: a packed color must be in 0x000000..0xFFFFFF - alpha is a separate argument.');

      this._r = (r >> 16) & 0xff;
      this._g = (r >> 8) & 0xff;
      this._b = r & 0xff;
      this._a = clamp(g ?? 1, 0, 1);

      return;
    }

    this._r = toChannel(r);
    this._g = toChannel(g ?? 0);
    this._b = toChannel(b);
    this._a = clamp(a, 0, 1);
  }

  /**
   * Build from a packed `0xRRGGBB` number, a hex string, another color, or a
   * plain `{ r, g, b, a }` object. `alpha` overrides whatever the value carried.
   *
   * A number never carries alpha here - see the constructor for why six digits
   * is the limit. Hex strings have no such problem, because their length is
   * still there to read: `'#f0f'`, `'#f0fc'`, `'#ff00ff'` and `'#ff00ffcc'` are
   * all accepted, alpha last, as CSS Color 4 spells them.
   */
  public static from(value: ColorInput, alpha?: number): Color {
    if (value instanceof Color) {
      return new Color(value.r, value.g, value.b, alpha ?? value.a);
    }

    if (typeof value === 'object') {
      return new Color(value.r, value.g, value.b, alpha ?? value.a ?? 1);
    }

    return Color.fromHex(value, alpha);
  }

  /**
   * Build from a hex value in either spelling: a `0xRRGGBB` number, or a string
   * in any of the four CSS forms (`#RGB`, `#RGBA`, `#RRGGBB`, `#RRGGBBAA`, with
   * or without the leading `#`). `alpha` overrides an alpha the string carried.
   *
   * Throws on a string that is not one of those forms. The check stays on in
   * production because this is an input parser: a hex value often comes from a
   * document or a theme rather than from source, and quietly returning black
   * would hide the broken input rather than report it.
   */
  public static fromHex(value: string | number, alpha?: number): Color {
    return new Color().setHex(value, alpha);
  }

  public get r(): number {
    return this._r;
  }

  public set r(red: number) {
    this._r = toChannel(red);
    this._rgba = null;
  }

  public get g(): number {
    return this._g;
  }

  public set g(green: number) {
    this._g = toChannel(green);
    this._rgba = null;
  }

  public get b(): number {
    return this._b;
  }

  public set b(blue: number) {
    this._b = toChannel(blue);
    this._rgba = null;
  }

  public get a(): number {
    return this._a;
  }

  public set a(alpha: number) {
    this._a = clamp(alpha, 0, 1);
    this._rgba = null;
  }

  /**
   * Set any subset of channels. Omitted parameters default to the current
   * channel value (use this for "set red, leave the rest"). RGB are clamped
   * to 0..255; alpha is clamped to 0..1.
   */
  public set(r: number = this._r, g: number = this._g, b: number = this._b, a: number = this._a): this {
    this._r = toChannel(r);
    this._g = toChannel(g);
    this._b = toChannel(b);
    this._a = clamp(a, 0, 1);

    this._rgba = null;

    return this;
  }

  /**
   * Overwrite this color from a hex value, in place. Same input forms as
   * {@link Color.fromHex}; use this instead of the factory in a loop, where the
   * factory's allocation would land in the frame budget.
   */
  public setHex(value: string | number, alpha?: number): this {
    if (typeof value === 'number') {
      assert(value >= 0 && value <= MAX_PACKED_RGB, 'Color: a packed color must be in 0x000000..0xFFFFFF - alpha is a separate argument.');

      return this.set((value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff, alpha ?? 1);
    }

    if (!HEX_PATTERN.test(value)) {
      throw new Error(`Color: "${value}" is not a hex color. Expected #RGB, #RGBA, #RRGGBB or #RRGGBBAA.`);
    }

    const digits = expandShorthand(value.startsWith('#') ? value.slice(1) : value);
    const packed = Number.parseInt(digits.slice(0, 6), 16);
    const carried = digits.length === 8 ? Number.parseInt(digits.slice(6), 16) / 255 : 1;

    return this.set((packed >> 16) & 0xff, (packed >> 8) & 0xff, packed & 0xff, alpha ?? carried);
  }

  public copy(color: Color): this {
    return this.set(color.r, color.g, color.b, color.a);
  }

  public clone(): this {
    return new Color(this._r, this._g, this._b, this._a) as this;
  }

  public equals({ r, g, b, a }: Partial<Color> = {}): boolean {
    return (r === undefined || this.r === r) && (g === undefined || this.g === g) && (b === undefined || this.b === b) && (a === undefined || this.a === a);
  }

  /**
   * Return an RGBA `Float32Array` view backed by an internal cache. Pass
   * `normalized = true` to map RGB into 0..1 (typical for shader uploads);
   * default returns 0..255 RGB and 0..1 alpha. The returned array is the
   * same instance across calls - copy it if you need a stable snapshot.
   */
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

  /**
   * Return the RGB channels packed as `0xRRGGBB` - the exact form the
   * constructor and {@link Color.fromHex} accept, so the two round-trip.
   * Alpha is not included; it cannot be, for the reason the constructor gives.
   */
  public toRgb(): number {
    return (this._r << 16) | (this._g << 8) | this._b;
  }

  /**
   * Return the color as a hex string. `alpha = true` appends the alpha pair
   * (`#RRGGBBAA`, CSS order); `prefixed = false` omits the leading `#`.
   *
   * Unlike {@link Color.toRgb}, the alpha form is unambiguous here: a string
   * still carries its own length, so it can be read back by
   * {@link Color.fromHex} exactly as written.
   */
  public toHex(alpha = false, prefixed = true): string {
    const rgb = ((1 << 24) | (this._r << 16) | (this._g << 8) | this._b).toString(16).slice(1);
    const suffix = alpha ? ((this._a * 255) | 0 | (1 << 8)).toString(16).slice(1) : '';

    return `${prefixed ? '#' : ''}${rgb}${suffix}`;
  }

  /** The six-digit hex form, so a color can be handed straight to a CSS or canvas property. */
  public toString(): string {
    return this.toHex();
  }

  /**
   * Return one RGBA8 texel as a little-endian `Uint32` - the value written into
   * a `Uint32Array` row for GPU upload (R in the low byte, A in the high byte),
   * matching `TextureFormat.Rgba8`.
   *
   * This is a pixel format, **not** a color literal: written out it reads
   * `0xAABBGGRR`, the reverse of the `0xRRGGBB` the constructor takes. Do not
   * feed it back into {@link Color.from}; use {@link Color.toRgb} for that.
   * Cached after first call until any channel is written. RGB is preserved at
   * every alpha - a fully transparent red and a fully transparent black pack to
   * different values.
   */
  public toRgba8(): number {
    if (this._rgba === null) {
      this._rgba = ((((this._a * 255) | 0) << 24) | (this._b << 16) | (this._g << 8) | this._r) >>> 0;
    }

    return this._rgba;
  }

  public destroy(): void {
    if (this._array) {
      this._array = null;
    }
  }

  // The eight corners of the RGB cube, plus both transparent ends. A named
  // color that is not a corner is a value, not a vocabulary item: write it as
  // `new Color(0x6495ed)` rather than expecting a name for it.
  public static readonly black = new Color(0, 0, 0, 1);
  public static readonly red = new Color(255, 0, 0, 1);
  public static readonly green = new Color(0, 255, 0, 1);
  public static readonly blue = new Color(0, 0, 255, 1);
  public static readonly cyan = new Color(0, 255, 255, 1);
  public static readonly magenta = new Color(255, 0, 255, 1);
  public static readonly yellow = new Color(255, 255, 0, 1);
  public static readonly white = new Color(255, 255, 255, 1);
  public static readonly transparentBlack = new Color(0, 0, 0, 0);
  public static readonly transparentWhite = new Color(255, 255, 255, 0);
  /** CSS `transparent`, which is defined as `rgba(0, 0, 0, 0)` - the same instance as {@link Color.transparentBlack}. */
  public static readonly transparent = Color.transparentBlack;

  // Dev builds freeze the shared corners so a stray `Color.white.set(...)` fails
  // at the mutation rather than silently repainting every other reader of the
  // same instance. Both lazy caches have to be filled before the freeze: a
  // frozen instance cannot take the `_rgba` / `_array` write that `toRgba8()`
  // and `toArray()` perform on their first call, so an unwarmed corner would
  // throw on a plain read instead. The freeze does not extend to the
  // `Float32Array` that `toArray()` hands out - that array stays shared and
  // writable, as its own documentation says.
  static {
    if (__DEV__) {
      for (const color of [
        Color.black,
        Color.red,
        Color.green,
        Color.blue,
        Color.cyan,
        Color.magenta,
        Color.yellow,
        Color.white,
        Color.transparentBlack,
        Color.transparentWhite,
      ]) {
        color.toRgba8();
        color.toArray();

        Object.freeze(color);
      }
    }
  }
}
