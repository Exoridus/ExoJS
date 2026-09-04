/**
 * A pass-through ShaderFilter that declares more reach than it uses, so the
 * effect domain no longer coincides with the content: any pass that mirrors
 * or misplaces its input inside the domain moves the fixture's square.
 */

import type { ReadonlyRectangle, Rectangle } from '#math/Rectangle';
import { createFilterShaderSource, ShaderFilter } from '#rendering/filters/ShaderFilter';

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
