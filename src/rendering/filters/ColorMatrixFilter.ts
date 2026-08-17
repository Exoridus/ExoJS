import type { Color } from '#core/Color';
import type { RenderBackend } from '#rendering/RenderBackend';
import { RenderBackendType } from '#rendering/RenderBackendType';
import type { RenderTexture } from '#rendering/texture/RenderTexture';

import { Filter } from './Filter';
import { WebGl2ShaderFilter } from './WebGl2ShaderFilter';
import { WebGpuShaderFilter } from './WebGpuShaderFilter';

/** A 4×5 row-major colour matrix: four rows of `[r, g, b, a, offset]`. */
export type ColorMatrixEntries = readonly number[];

const ENTRIES = 20;

/** Rec. 709 luma weights — the same ones the rest of the engine desaturates with. */
const LUMA_R = 0.2126;
const LUMA_G = 0.7152;
const LUMA_B = 0.0722;

const IDENTITY: ColorMatrixEntries = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];

/**
 * Render targets hold PREMULTIPLIED colour (the engine composites with
 * `ONE, ONE_MINUS_SRC_ALPHA`), so a colour transform cannot be applied to the
 * sample as it is stored: an offset added to premultiplied RGB brightens a
 * half-transparent pixel twice as much as an opaque one, and can push RGB above
 * alpha, which is not a representable premultiplied colour at all.
 *
 * Both shaders therefore divide out alpha, transform straight RGBA, clamp, and
 * multiply alpha back in.
 */
const glslFragment = `#version 300 es
precision mediump float;
uniform sampler2D uTexture;
uniform vec4 uRow0;
uniform vec4 uRow1;
uniform vec4 uRow2;
uniform vec4 uRow3;
uniform vec4 uBias;
in vec2 vUv;
out vec4 fragColor;
void main() {
    vec4 premultiplied = texture(uTexture, vUv);
    float alpha = premultiplied.a;
    vec4 straight = vec4(alpha > 0.0 ? premultiplied.rgb / alpha : vec3(0.0), alpha);
    vec4 graded = clamp(vec4(dot(uRow0, straight), dot(uRow1, straight), dot(uRow2, straight), dot(uRow3, straight)) + uBias, 0.0, 1.0);
    fragColor = vec4(graded.rgb * graded.a, graded.a);
}
`;

const wgslFragment = `
struct Uniforms {
    uRow0: vec4<f32>,
    uRow1: vec4<f32>,
    uRow2: vec4<f32>,
    uRow3: vec4<f32>,
    uBias: vec4<f32>,
};

@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;
@group(1) @binding(0) var<uniform> uniforms: Uniforms;

@fragment
fn main(@location(0) vUv: vec2<f32>) -> @location(0) vec4<f32> {
    let premultiplied = textureSample(uTexture, uSampler, vUv);
    let alpha = premultiplied.a;
    let straightRgb = select(vec3<f32>(0.0), premultiplied.rgb / max(alpha, 1e-5), alpha > 0.0);
    let straight = vec4<f32>(straightRgb, alpha);
    let transformed = vec4<f32>(
        dot(uniforms.uRow0, straight),
        dot(uniforms.uRow1, straight),
        dot(uniforms.uRow2, straight),
        dot(uniforms.uRow3, straight),
    ) + uniforms.uBias;
    let graded = clamp(transformed, vec4<f32>(0.0), vec4<f32>(1.0));

    return vec4<f32>(graded.rgb * graded.a, graded.a);
}
`;

/**
 * A {@link Filter} that runs one affine colour transform over everything it is
 * given: `RGBA' = M·RGBA + bias`, carried as a 4×5 row-major matrix of four
 * `[r, g, b, a, offset]` rows.
 *
 * One matrix expresses brightness, contrast, saturation, hue-ish channel
 * mixing, inversion, sepia and flat tinting — so there is one filter class
 * rather than one per operation. The conveniences below CONCATENATE onto the
 * current matrix in call order, and {@link reset} goes back to the identity.
 *
 * ```ts
 * // Desaturate a whole subtree and lift it slightly.
 * subtree.filters = [new ColorMatrixFilter().grayscale().brightness(1.1)];
 *
 * // Damage flash: multiply the subtree by red for a few frames.
 * flash.tint(Color.red);
 * ```
 *
 * For a cheap per-drawable multiply, use {@link Drawable.tint} instead — it
 * costs no render target at all. Reach for this filter when the transform is
 * more than a multiply, or when it has to cover a whole subtree as one image.
 * For non-linear, authored grading use {@link LutFilter}.
 *
 * Colour operations run on STRAIGHT alpha: the shader divides the premultiplied
 * sample by its alpha, transforms, and multiplies back, so a half-transparent
 * edge grades the same way an opaque pixel does.
 *
 * Internally creates a {@link WebGl2ShaderFilter} or {@link WebGpuShaderFilter}
 * on first apply, depending on the active backend.
 */
export class ColorMatrixFilter extends Filter {
  private readonly _matrix = new Float32Array(ENTRIES);
  /**
   * The matrix split the way the shaders bind it: one `vec4` per row plus the
   * offset column. Kept as live buffers so a frame uploads them without
   * marshalling anything, and rewritten whenever the matrix changes.
   */
  private readonly _rows: readonly Float32Array[] = [new Float32Array(4), new Float32Array(4), new Float32Array(4), new Float32Array(4)];
  private readonly _bias = new Float32Array(4);
  private _backendFilter: WebGl2ShaderFilter | WebGpuShaderFilter | null = null;

  public constructor(matrix: ColorMatrixEntries = IDENTITY) {
    super();

    this._write(matrix);
  }

  /** The current 4×5 matrix. Assign a new one, or use the conveniences. */
  public get matrix(): ColorMatrixEntries {
    return this._matrix as unknown as ColorMatrixEntries;
  }

  public set matrix(matrix: ColorMatrixEntries) {
    this.setMatrix(matrix);
  }

  /** Replace the matrix outright. Returns `this` for chaining. */
  public setMatrix(matrix: ColorMatrixEntries): this {
    this._write(matrix);
    this._publish();

    return this;
  }

  /** Back to the identity transform. */
  public reset(): this {
    return this.setMatrix(IDENTITY);
  }

  /** Scale the colour channels by `amount`. `1` changes nothing. */
  public brightness(amount: number): this {
    return this._concat([amount, 0, 0, 0, 0, 0, amount, 0, 0, 0, 0, 0, amount, 0, 0, 0, 0, 0, 1, 0]);
  }

  /** Push the colour channels away from mid grey by `amount`. `1` changes nothing. */
  public contrast(amount: number): this {
    const offset = 0.5 * (1 - amount);

    return this._concat([amount, 0, 0, 0, offset, 0, amount, 0, 0, offset, 0, 0, amount, 0, offset, 0, 0, 0, 1, 0]);
  }

  /**
   * Interpolate between luminance (`0`) and the original colour (`1`). Values
   * above `1` oversaturate.
   */
  public saturate(amount: number): this {
    const inverse = 1 - amount;
    const r = LUMA_R * inverse;
    const g = LUMA_G * inverse;
    const b = LUMA_B * inverse;

    return this._concat([r + amount, g, b, 0, 0, r, g + amount, b, 0, 0, r, g, b + amount, 0, 0, 0, 0, 0, 1, 0]);
  }

  /** Collapse every channel onto its luminance — {@link saturate} at `0`. */
  public grayscale(): this {
    return this.saturate(0);
  }

  /** Replace each colour channel with `1 - channel`, leaving alpha alone. */
  public invert(): this {
    return this._concat([-1, 0, 0, 0, 1, 0, -1, 0, 0, 1, 0, 0, -1, 0, 1, 0, 0, 0, 1, 0]);
  }

  /** The standard warm-brown photographic matrix. */
  public sepia(): this {
    return this._concat([0.393, 0.769, 0.189, 0, 0, 0.349, 0.686, 0.168, 0, 0, 0.272, 0.534, 0.131, 0, 0, 0, 0, 0, 1, 0]);
  }

  /**
   * Multiply by a flat colour, alpha included — the same arithmetic
   * {@link Drawable.tint} applies per drawable, here over the whole subtree the
   * filter is attached to.
   */
  public tint(color: Color): this {
    const r = color.r / 255;
    const g = color.g / 255;
    const b = color.b / 255;

    return this._concat([r, 0, 0, 0, 0, 0, g, 0, 0, 0, 0, 0, b, 0, 0, 0, 0, 0, color.a, 0]);
  }

  public apply(backend: RenderBackend, input: RenderTexture, output: RenderTexture, resolution = 1): void {
    if (this._backendFilter === null) {
      this._backendFilter = this._createBackendFilter(backend);
    }

    this._backendFilter.apply(backend, input, output, resolution);
  }

  public override destroy(): void {
    super.destroy();

    if (this._backendFilter !== null) {
      this._backendFilter.destroy();
      this._backendFilter = null;
    }
  }

  /** Apply `next` AFTER whatever the filter already does, and publish the result. */
  private _concat(next: ColorMatrixEntries): this {
    const current = this._matrix;
    const combined = new Array<number>(ENTRIES);

    for (let row = 0; row < 4; row++) {
      const out = row * 5;

      for (let column = 0; column < 5; column++) {
        let sum = 0;

        for (let inner = 0; inner < 4; inner++) {
          // In-bounds: both indices stay inside a 4×5 matrix.
          sum += next[out + inner]! * current[inner * 5 + column]!;
        }

        // The offset column also picks up `next`'s own offset.
        combined[out + column] = column === 4 ? sum + next[out + 4]! : sum;
      }
    }

    this._write(combined);
    this._publish();

    return this;
  }

  /** Validate, store, and re-split the matrix into the shader's row/bias buffers. */
  private _write(matrix: ColorMatrixEntries): void {
    if (matrix.length !== ENTRIES) {
      throw new Error('ColorMatrixFilter: a colour matrix needs exactly 20 entries (4 rows of 5).');
    }

    this._matrix.set(matrix);

    for (let row = 0; row < 4; row++) {
      const base = row * 5;
      // In-bounds: `row` < 4 === this._rows.length.
      const target = this._rows[row]!;

      target[0] = this._matrix[base]!;
      target[1] = this._matrix[base + 1]!;
      target[2] = this._matrix[base + 2]!;
      target[3] = this._matrix[base + 3]!;
      this._bias[row] = this._matrix[base + 4]!;
    }
  }

  /**
   * Tell the owners the output changed. The shader reads the row buffers this
   * class owns, so nothing has to be re-uploaded by hand — but a cached or
   * retained node still has to be told to re-run the filter.
   */
  private _publish(): void {
    this.invalidate();
  }

  private _createBackendFilter(backend: RenderBackend): WebGl2ShaderFilter | WebGpuShaderFilter {
    // Insertion order matters on WebGPU: the packer lays each uniform out in a
    // 16-byte slot, in declaration order, which is what the WGSL struct above
    // spells out.
    const uniforms = {
      uRow0: this._rows[0]!,
      uRow1: this._rows[1]!,
      uRow2: this._rows[2]!,
      uRow3: this._rows[3]!,
      uBias: this._bias,
    };

    if (backend.backendType === RenderBackendType.WebGpu) {
      return new WebGpuShaderFilter({ fragmentSource: wgslFragment, uniforms });
    }

    return new WebGl2ShaderFilter({ fragmentSource: glslFragment, uniforms });
  }
}
