import { Color } from '#core/Color';
import type { ReadonlyRectangle, Rectangle } from '#math/Rectangle';
import { BackendTargetPass } from '#rendering/BackendTargetPass';
import { drawDrawableDirect } from '#rendering/plan/drawDrawableDirect';
import type { RenderBackend } from '#rendering/RenderBackend';
import { Sprite } from '#rendering/sprite/Sprite';
import type { RenderTexture } from '#rendering/texture/RenderTexture';
import { BlendModes } from '#rendering/types';

import { BlurFilter } from './BlurFilter';
import { Filter } from './Filter';
import { createFilterShaderSource, ShaderFilter } from './ShaderFilter';
import glslFragment from './shaders/drop-shadow.frag';
import wgslFragment from './shaders/drop-shadow.wgsl';

/**
 * The silhouette source pair, built once and shared by every instance.
 * @internal
 */
export const dropShadowShaderSource = createFilterShaderSource({ glsl: { fragment: glslFragment }, wgsl: wgslFragment });

/** Construction-time options for a {@link DropShadowFilter}. */
export interface DropShadowFilterOptions {
  /** Shadow offset along x in LOGICAL units. Default `4`. */
  readonly offsetX?: number;
  /** Shadow offset along y in LOGICAL units. Default `4`. */
  readonly offsetY?: number;
  /** Softness: the blur radius applied to the silhouette, in logical units. Default `4`. */
  readonly blur?: number;
  /** Blur smoothness, see {@link BlurFilterOptions.quality}. Default `1`. */
  readonly quality?: number;
  /** Shadow colour; its alpha is the shadow's opacity. Default black at `0.5`. */
  readonly color?: Color;
  /** Draw only the shadow and leave the source out. Default `false`. */
  readonly shadowOnly?: boolean;
}

/**
 * A {@link Filter} that draws a soft, offset silhouette of its input behind
 * the input itself - the classic drop shadow.
 *
 * The shadow is the input's alpha coverage flattened to {@link color}, blurred
 * by {@link blur}, and composited at {@link offsetX}/{@link offsetY} under the
 * unchanged source. All lengths are logical units, so the shadow keeps its
 * on-screen size at every pixel ratio and {@link Filter.resolution}.
 *
 * ```ts
 * label.filters = [new DropShadowFilter({ offsetX: 2, offsetY: 3, blur: 3 })];
 *
 * // A coloured glow: no offset, wide blur, saturated colour.
 * glow.filters = [new DropShadowFilter({ offsetX: 0, offsetY: 0, blur: 12, color: new Color(80, 200, 255, 0.8) })];
 * ```
 *
 * The silhouette pass shifts and recolours in one shader; the blur is the
 * stock {@link BlurFilter}, so the whole effect runs on both backends.
 */
export class DropShadowFilter extends Filter {
  /**
   * Shift and colour, bound live: `uShift` is the offset in UV units of the
   * pass target, `uColor` the straight shadow colour with its opacity in alpha.
   * Insertion order is the WGSL struct order.
   */
  private readonly _shift = new Float32Array(4);
  private readonly _shadowColor = new Float32Array(4);
  private readonly _silhouette: ShaderFilter;
  private readonly _blur: BlurFilter;
  // One sprite per draw: both are batched and resolved at flush, so a single
  // sprite re-pointed between the two draws would sample the same texture twice.
  private readonly _shadowSprite: Sprite = new Sprite(null);
  private readonly _sourceSprite: Sprite = new Sprite(null);
  private readonly _compositePass: BackendTargetPass = new BackendTargetPass(backend => this._drawComposite(backend));
  private readonly _color: Color;
  private _offsetX: number;
  private _offsetY: number;
  private _shadowOnly: boolean;
  /** Staged by {@link apply} for the composite body, which takes no parameters. */
  private _passInput: RenderTexture | null = null;
  private _passShadow: RenderTexture | null = null;

  public constructor(options: DropShadowFilterOptions = {}) {
    super();

    this._offsetX = options.offsetX ?? 4;
    this._offsetY = options.offsetY ?? 4;
    this._shadowOnly = options.shadowOnly ?? false;
    this._color = options.color?.clone() ?? new Color(0, 0, 0, 0.5);
    this._blur = new BlurFilter({ radius: options.blur ?? 4, quality: options.quality ?? 1 });
    this._silhouette = ShaderFilter.from(dropShadowShaderSource, { uniforms: { uShift: this._shift, uColor: this._shadowColor } });
    this._writeColor();
  }

  /** Shadow offset along x in logical units. */
  public get offsetX(): number {
    return this._offsetX;
  }

  public set offsetX(offsetX: number) {
    if (this._offsetX !== offsetX) {
      this._offsetX = offsetX;
      this.invalidate();
    }
  }

  /** Shadow offset along y in logical units. */
  public get offsetY(): number {
    return this._offsetY;
  }

  public set offsetY(offsetY: number) {
    if (this._offsetY !== offsetY) {
      this._offsetY = offsetY;
      this.invalidate();
    }
  }

  /** Blur radius applied to the silhouette, in logical units. `0` gives a hard-edged shadow. */
  public get blur(): number {
    return this._blur.radius;
  }

  public set blur(blur: number) {
    if (this._blur.radius !== Math.max(0, blur)) {
      this._blur.radius = blur;
      this.invalidate();
    }
  }

  /** Blur smoothness, see {@link BlurFilterOptions.quality}. */
  public get quality(): number {
    return this._blur.quality;
  }

  public set quality(quality: number) {
    if (this._blur.quality !== Math.max(1, Math.floor(quality))) {
      this._blur.quality = quality;
      this.invalidate();
    }
  }

  /**
   * Shadow colour; its alpha is the shadow's opacity. Assigning copies the
   * value, so the caller's colour can be reused.
   */
  public get color(): Color {
    return this._color;
  }

  public set color(color: Color) {
    this._color.copy(color);
    this._writeColor();
    this.invalidate();
  }

  /** Draw only the shadow, leaving the source out of the result. */
  public get shadowOnly(): boolean {
    return this._shadowOnly;
  }

  public set shadowOnly(shadowOnly: boolean) {
    if (this._shadowOnly !== shadowOnly) {
      this._shadowOnly = shadowOnly;
      this.invalidate();
    }
  }

  private _writeColor(): void {
    const { r, g, b, a } = this._color;

    this._shadowColor[0] = r / 255;
    this._shadowColor[1] = g / 255;
    this._shadowColor[2] = b / 255;
    this._shadowColor[3] = a;
  }

  /**
   * The shadow reaches `blur` logical units beyond the input, shifted by the
   * offset; the source keeps its own extent, so the result is the union.
   */
  public override getOutputBounds(input: ReadonlyRectangle, output: Rectangle): void {
    const reach = this._blur.radius;
    const shadowLeft = input.x + this._offsetX - reach;
    const shadowTop = input.y + this._offsetY - reach;
    const shadowRight = input.x + input.width + this._offsetX + reach;
    const shadowBottom = input.y + input.height + this._offsetY + reach;
    const left = Math.min(input.x, shadowLeft);
    const top = Math.min(input.y, shadowTop);
    const right = Math.max(input.x + input.width, shadowRight);
    const bottom = Math.max(input.y + input.height, shadowBottom);

    output.set(left, top, right - left, bottom - top);
  }

  public apply(backend: RenderBackend, input: RenderTexture, output: RenderTexture, resolution = 1): void {
    // The silhouette lands in one scratch, the blur reads it into a second;
    // both are borrowed from the pool so a shadowed node allocates nothing per
    // frame.
    const silhouette = backend.acquireRenderTexture(output.width, output.height);
    const shadow = backend.acquireRenderTexture(output.width, output.height);

    try {
      // The offset is applied while the silhouette is read, so every later
      // draw covers its whole target and none has to hang over an edge. It
      // stays a DOWNWARD offset here: the shader turns it into the right v
      // direction for the running backend through `uOrientation`.
      this._shift[0] = (this._offsetX * resolution) / output.width;
      this._shift[1] = (this._offsetY * resolution) / output.height;
      this._silhouette.apply(backend, input, silhouette, resolution);
      this._blur.apply(backend, silhouette, shadow, resolution);

      this._passInput = input;
      this._passShadow = shadow;
      backend.execute(this._compositePass.retarget(output, output.view, Color.transparentBlack));
    } finally {
      this._passInput = null;
      this._passShadow = null;
      backend.releaseRenderTexture(shadow);
      backend.releaseRenderTexture(silhouette);
    }
  }

  private _drawComposite(backend: RenderBackend): void {
    drawDrawableDirect(this._stage(this._shadowSprite, this._passShadow!), backend);

    if (!this._shadowOnly) {
      drawDrawableDirect(this._stage(this._sourceSprite, this._passInput!), backend);
    }
  }

  private _stage(sprite: Sprite, texture: RenderTexture): Sprite {
    sprite.setTexture(texture).setBlendMode(BlendModes.Normal).setTint(Color.white).setPosition(0, 0).setRotation(0).setScale(1, 1);
    sprite.width = texture.width;
    sprite.height = texture.height;

    return sprite;
  }

  public override destroy(): void {
    super.destroy();
    this._silhouette.destroy();
    this._blur.destroy();
    this._shadowSprite.destroy();
    this._sourceSprite.destroy();
    this._color.destroy();
  }
}
