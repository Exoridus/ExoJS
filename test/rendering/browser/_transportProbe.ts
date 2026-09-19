/**
 * Shared fixture for the transport-trace specs (WebGL2 + WebGPU).
 *
 * The transport chunk is not wired into the cascades yet, so it is exercised
 * through a probe: a filter that traces one world-space stretch per draw and
 * writes what came back. That keeps the contract tests on the real shader text
 * and the real bindings without half-replacing the production path.
 *
 * Radiance is unbounded, so the probe scales it into the target's range before
 * writing. Every expectation below is therefore a relation between probes taken
 * at the same scale - a composition, a ratio, a channel that must stay at zero -
 * rather than an absolute level read off one pixel.
 */

import { Color } from '#core/Color';
import { Rectangle } from '#math/Rectangle';
import { DataTexture } from '#rendering/texture/DataTexture';
import { ScaleModes, TextureFormat } from '#rendering/types';
import { UniformType } from '#rendering/uniforms/UniformType';

import transportGlsl from '../../../packages/exojs-lighting/src/backends/shaders/transport.frag';
import transportWgsl from '../../../packages/exojs-lighting/src/backends/shaders/transport.wgsl';
import { TransportGeometry, transportTableWidth } from '../../../packages/exojs-lighting/src/backends/transportGeometry';
import type { Light } from '../../../packages/exojs-lighting/src/lights/Light';

export const PROBE_SIZE = 16;

/** The region the grid covers; every fixture scene fits inside it. */
export const PROBE_REGION = new Rectangle(-256, -256, 512, 512);

/** World extent of one grid cell. Small enough that every fixture crosses several. */
export const PROBE_CELL = 16;

export const probeUniforms = {
  uGridOrigin: UniformType.Vec2,
  uGridCells: UniformType.Vec2,
  uCellSize: UniformType.Float,
  uTableWidth: UniformType.Float,
  uA: UniformType.Vec2,
  uB: UniformType.Vec2,
  uScale: UniformType.Float,
  uMode: UniformType.Float,
} as const;

/**
 * What a probe draw writes: the scaled radiance, the transmittance in every
 * channel, or the number of grid cells the walk visited.
 *
 * The cell count is written as `visited / 255`, so the byte read back IS the
 * count. A reading of 255 means the walk either visited that many or saturated,
 * and every probe grid here is small enough that it cannot legitimately.
 */
export const PROBE_RADIANCE = 0;
export const PROBE_TRANSMITTANCE = 1;
export const PROBE_VISITED = 2;

export const probeFragmentSource = `#version 300 es
precision highp float;
precision highp int;

uniform sampler2D uTexture;
uniform sampler2D uSegments;
uniform sampler2D uEmitters;
uniform sampler2D uCells;
uniform sampler2D uIndices;

out vec4 fragColor;

${transportGlsl}

void main() {
    Transfer walked = traceSegment(uniforms.uA, uniforms.uB);
    vec3 shown = uniforms.uMode < 0.5
        ? clamp(walked.radiance * uniforms.uScale, 0.0, 1.0)
        : (uniforms.uMode < 1.5 ? vec3(walked.transmittance) : vec3(clamp(walked.visited / 255.0, 0.0, 1.0)));

    // Opaque: the probe is composited onto the frame like any other draw, and
    // an alpha channel would not survive that to be read back.
    fragColor = vec4(shown, 1.0);
}
`;

export const probeWgslSource = `
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;
@group(1) @binding(1) var uSegments: texture_2d<f32>;
@group(1) @binding(2) var uSegmentsSampler: sampler;
@group(1) @binding(3) var uEmitters: texture_2d<f32>;
@group(1) @binding(4) var uEmittersSampler: sampler;
@group(1) @binding(5) var uCells: texture_2d<f32>;
@group(1) @binding(6) var uCellsSampler: sampler;
@group(1) @binding(7) var uIndices: texture_2d<f32>;
@group(1) @binding(8) var uIndicesSampler: sampler;

${transportWgsl}

@fragment
fn fragmentMain(@location(0) vUv: vec2<f32>) -> @location(0) vec4<f32> {
    let walked = traceSegment(uniforms.uA, uniforms.uB);
    let counted = select(vec3<f32>(clamp(walked.visited / 255.0, 0.0, 1.0)), vec3<f32>(walked.transmittance), uniforms.uMode < 1.5);
    let shown = select(counted, clamp(walked.radiance * uniforms.uScale, vec3<f32>(0.0), vec3<f32>(1.0)), uniforms.uMode < 0.5);

    // Opaque: the probe is composited onto the frame like any other draw, and
    // an alpha channel would not survive that to be read back.
    return vec4<f32>(shown, 1.0);
}
`;

/** The four tables of a scene, as textures a filter can bind. */
export interface ProbeTables {
  readonly segments: DataTexture<TextureFormat.Rgba32F>;
  readonly emitters: DataTexture<TextureFormat.Rgba32F>;
  readonly cells: DataTexture<TextureFormat.Rgba32F>;
  readonly indices: DataTexture<TextureFormat.Rgba32F>;
  readonly gridWidth: number;
  readonly gridHeight: number;
  readonly originX: number;
  readonly originY: number;
  readonly cellSize: number;
  destroy(): void;
}

const table = (data: Float32Array, width: number, height: number): DataTexture<TextureFormat.Rgba32F> =>
  new DataTexture({
    width,
    height,
    format: TextureFormat.Rgba32F,
    scaleMode: ScaleModes.Nearest,
    data: data.subarray(0, width * height * 4),
  });

/** Build this scene's tables. `segments` holds `(x1, y1, x2, y2)` quadruples. */
export const probeTables = (segments: readonly number[], lights: readonly Light[], region = PROBE_REGION, cell = PROBE_CELL): ProbeTables => {
  const geometry = new TransportGeometry();

  geometry.build(Float32Array.from(segments), segments.length / 4, lights, region, cell);

  const built = geometry.tables;
  const textures = {
    segments: table(built.segments, transportTableWidth, built.segmentRows),
    emitters: table(built.emitters, transportTableWidth, built.emitterRows),
    cells: table(built.cells, built.gridWidth, built.gridHeight),
    indices: table(built.indices, transportTableWidth, built.indexRows),
  };

  return {
    ...textures,
    gridWidth: built.gridWidth,
    gridHeight: built.gridHeight,
    originX: built.originX,
    originY: built.originY,
    cellSize: built.cellSize,
    destroy: (): void => {
      for (const texture of Object.values(textures)) {
        texture.destroy();
      }
    },
  };
};

/** The clear colour probes are read against. */
export const PROBE_CLEAR = Color.black;

/** What one probe read back, as the 8-bit channels of one pixel. */
export type Probe = readonly [number, number, number, number];

/**
 * The radiance of `near` composed with that of `far`, given what `near` let
 * through, in the 8-bit units the probes come back in.
 */
export const composeRadiance = (near: Probe, far: Probe, throughNear: Probe): readonly [number, number, number] => {
  const through = throughNear[0] / 255;

  return [near[0] + through * far[0], near[1] + through * far[1], near[2] + through * far[2]];
};
