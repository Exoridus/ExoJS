import {
  CallbackRenderPass,
  createFilterShader,
  DataTexture,
  type PassContext,
  type ReadonlyRectangle,
  RenderTexture,
  ScaleModes,
  ShaderFilter,
  TextureFormat,
  UniformType,
} from '@codexo/exojs';

import glslFragment from './shaders/shadow-march.frag';
import wgslFragment from './shaders/shadow-march.wgsl';

const shadowMarchUniforms = {
  uBins: UniformType.Float,
  uRows: UniformType.Float,
  uStep: UniformType.Float,
  uViewMin: UniformType.Vec2,
  uViewSize: UniformType.Vec2,
} as const;

/**
 * The polar shadow march, as a filter source: the occluder mask is the input,
 * the shadow atlas the output, and a fragment's own place in the destination is
 * the `(bin, light)` pair it walks a ray for.
 * @internal
 */
export const shadowMarchShader = createFilterShader({
  glsl: { fragment: glslFragment },
  wgsl: wgslFragment,
  uniforms: shadowMarchUniforms,
});

/** Rows per light in the data texture the march reads its lights from. */
const lightRows = 2;

const createFilter = (lights: DataTexture<TextureFormat.Rgba32F>): ShaderFilter<typeof shadowMarchUniforms> =>
  ShaderFilter.from(shadowMarchShader, { textures: { uLights: lights } });

/**
 * Fills the polar shadow rows by marching the occluder mask on the GPU, in
 * place of walking the collected segments on the CPU.
 *
 * The atlas it writes is the same `bins x lights` field the light shader reads
 * either way, so the two fillers are interchangeable behind one texture
 * binding. What differs is where an occluder comes from: the mask holds what
 * was rasterised for the camera's view, so a caster outside the view casts no
 * shadow here where the segment walk would still find it.
 *
 * The atlas is a float render target, which WebGL2 only has with
 * `EXT_color_buffer_float` - {@link isSupported} is the question to ask before
 * building one.
 * @internal
 */
export class ShadowMarchFiller {
  /** Whether the active backend can render into the float atlas the march needs. */
  public static isSupported(rendering: { supportsColorFormat(format: TextureFormat.Rgba16F): boolean }): boolean {
    return rendering.supportsColorFormat(TextureFormat.Rgba16F);
  }

  /** The march, as one pass. Owned by the caller's pipeline and disabled until the filler is in use. */
  public readonly pass: CallbackRenderPass;

  private readonly _mask: RenderTexture;
  private readonly _bins: number;
  private readonly _atlas: RenderTexture;
  private _lights: DataTexture<TextureFormat.Rgba32F>;
  private _filter: ShaderFilter<typeof shadowMarchUniforms>;
  private _rows = 0;

  public constructor(mask: RenderTexture, bins: number) {
    this._mask = mask;
    this._bins = bins;
    // Half-float rather than the CPU filler's `R32F`: a normalized distance
    // needs the range and not the mantissa, and `Rgba16F` is the only float
    // format both backends render into without a device feature.
    this._atlas = new RenderTexture(bins, 1, { format: TextureFormat.Rgba16F, scaleMode: ScaleModes.Nearest });
    this._lights = new DataTexture({ width: 1, height: lightRows, format: TextureFormat.Rgba32F });
    this._filter = createFilter(this._lights);
    this.pass = new CallbackRenderPass((pass: PassContext) => this._march(pass), { label: 'lighting:shadow-march', enabled: false });
  }

  /** The filled atlas, for the light materials to bind as their shadow rows. */
  public get texture(): RenderTexture {
    return this._atlas;
  }

  /**
   * Make room for `rows` lights and start a new frame's worth of them. Rows the
   * caller does not write are marched as unoccluded rather than left stale.
   */
  public begin(rows: number): void {
    this._rows = rows;

    if (this._lights.width < rows) {
      this._lights.destroy();
      this._lights = new DataTexture({ width: rows, height: lightRows, format: TextureFormat.Rgba32F });
      // The filter copies its texture bindings at construction, so a grown data
      // texture needs a filter of its own; the pass reads this field per frame
      // and never sees the swap.
      this._filter.destroy();
      this._filter = createFilter(this._lights);
    }

    this._atlas.setSize(this._bins, Math.max(1, this._lights.width));
    this._lights.buffer.fill(0);
  }

  /** Describe one light's ray fan: where it stands, how far it reaches, and the axis its bins are measured from. */
  public write(row: number, x: number, y: number, reach: number, axisX: number, axisY: number): void {
    const width = this._lights.width;
    const offset = row * 4;

    this._lights.buffer[offset] = x;
    this._lights.buffer[offset + 1] = y;
    this._lights.buffer[offset + 2] = reach;
    this._lights.buffer[width * 4 + offset] = axisX;
    this._lights.buffer[width * 4 + offset + 1] = axisY;
  }

  /**
   * Close the frame's lights and point the march at the region the mask covers.
   *
   * `texel` is one mask texel in world units and is the march's step, so the
   * walk cannot step over an edge the mask widened to exactly that.
   */
  public end(view: ReadonlyRectangle, texel: number): void {
    this._lights.commit();
    this._filter.uniforms.uBins.set(this._bins);
    this._filter.uniforms.uRows.set(this._atlas.height);
    this._filter.uniforms.uStep.set(texel);
    this._filter.uniforms.uViewMin.set(view.left, view.top);
    this._filter.uniforms.uViewSize.set(Math.max(1, view.width), Math.max(1, view.height));
  }

  public destroy(): void {
    this.pass.destroy();
    this._filter.destroy();
    this._lights.destroy();
    this._atlas.destroy();
    this._rows = 0;
  }

  private _march(pass: PassContext): void {
    if (this._rows === 0) {
      return;
    }

    this._filter.apply(pass.backend, this._mask, this._atlas);
  }
}
