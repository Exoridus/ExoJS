/**
 * Two ShaderFilters that declare more reach than their content occupies, so
 * the effect domain no longer coincides with it.
 *
 * {@link ExpandingPassThrough} samples its own texel: any pass that mirrors or
 * misplaces its input inside the domain moves the fixture's square.
 * {@link ShiftingPassThrough} samples along v through `uOrientation`, so a
 * backend whose render texture stores the domain the other way up moves the
 * square the wrong way instead of not at all.
 */

import type { ReadonlyRectangle, Rectangle } from '#math/Rectangle';
import { createFilterShaderSource, ShaderFilter } from '#rendering/filters/ShaderFilter';
import type { RenderBackend } from '#rendering/RenderBackend';
import type { RenderTexture } from '#rendering/texture/RenderTexture';

const passThroughSource = createFilterShaderSource({
  glsl: {
    fragment: `#version 300 es
precision mediump float;
uniform sampler2D uTexture;
in vec2 vUv;
out vec4 fragColor;
void main() { fragColor = texture(uTexture, vUv); }`,
  },
  wgsl: `
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;
@fragment
fn fragmentMain(@location(0) vUv: vec2<f32>) -> @location(0) vec4<f32> { return textureSample(uTexture, uSampler, vUv); }`,
});

export class ExpandingPassThrough extends ShaderFilter {
  public constructor(
    private readonly above: number,
    private readonly below: number,
  ) {
    super({ shader: passThroughSource });
  }

  public override getOutputBounds(input: ReadonlyRectangle, output: Rectangle): void {
    output.set(input.x, input.y - this.above, input.width, input.height + this.above + this.below);
  }
}

/** Reach declared only below, only above, and both ways; the square must stay at [24, 40) for all. */
export const DOMAIN_CASES: ReadonlyArray<readonly [label: string, above: number, below: number]> = [
  ['below only', 0, 8],
  ['above only', 8, 0],
  ['both sides', 8, 8],
];

/** Rows to probe at x = 30: the square rows read white, the expansion rows read the clear colour. */
export const PROBE_ROWS: ReadonlyArray<readonly [y: number, insideSquare: boolean]> = [
  [20, false],
  [26, true],
  [38, true],
  [44, false],
];

/** Logical units {@link ShiftingPassThrough} moves its input down by, and reaches above and below. */
export const V_SHIFT = 8;

const shiftingSource = createFilterShaderSource({
  glsl: {
    fragment: `#version 300 es
precision mediump float;
uniform sampler2D uTexture;
uniform float uOrientation;
uniform vec4 uShift;
in vec2 vUv;
out vec4 fragColor;
void main() { fragColor = texture(uTexture, vUv - vec2(0.0, uShift.x * uOrientation)); }`,
  },
  wgsl: `
struct Uniforms {
    uShift: vec4<f32>,
};

@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;
@group(0) @binding(3) var<uniform> uOrientation: f32;
@group(1) @binding(0) var<uniform> uniforms: Uniforms;

@fragment
fn fragmentMain(@location(0) vUv: vec2<f32>) -> @location(0) vec4<f32> {
    return textureSample(uTexture, uSampler, vUv - vec2<f32>(0.0, uniforms.uShift.x * uOrientation));
}`,
});

/**
 * Reads {@link V_SHIFT} units ABOVE its own texel, so the content lands that
 * far DOWN the domain - the same square in the same place on both backends,
 * which is what `uOrientation` buys. The reach is declared on both sides so the
 * shifted square stays inside the domain rather than being clipped by it.
 */
export class ShiftingPassThrough extends ShaderFilter {
  private readonly _shift: Float32Array;

  public constructor() {
    const shift = new Float32Array(4);

    super({ shader: shiftingSource, uniforms: { uShift: shift } });
    this._shift = shift;
  }

  public override getOutputBounds(input: ReadonlyRectangle, output: Rectangle): void {
    output.set(input.x, input.y - V_SHIFT, input.width, input.height + V_SHIFT * 2);
  }

  public override apply(backend: RenderBackend, input: RenderTexture, output: RenderTexture, resolution = 1): void {
    this._shift[0] = (V_SHIFT * resolution) / output.height;
    super.apply(backend, input, output, resolution);
  }
}

/**
 * Rows to probe at x = 30 after the shift: the square has left `[24, 40)` and
 * sits at `[32, 48)` on either backend.
 */
export const V_SHIFT_PROBE_ROWS: ReadonlyArray<readonly [y: number, insideSquare: boolean]> = [
  [20, false],
  [28, false],
  [34, true],
  [46, true],
  [52, false],
];
