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
import { TextureFormat } from '#rendering/types';
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
  uMaskCells: UniformType.Vec2,
  uMaskBasis: UniformType.Vec4,
  uMaskOffset: UniformType.Vec2,
  uMaskBlocks: UniformType.Vec2,
  uMaskSuperblocks: UniformType.Vec2,
  uA: UniformType.Vec2,
  uB: UniformType.Vec2,
  uScale: UniformType.Float,
  uMode: UniformType.Float,
} as const;

/**
 * What a probe draw writes: the scaled radiance, the transmittance in every
 * channel, the work the walk did, where along the stretch the occluder mask
 * first blocks it, or whether the walk ran out of its budget.
 *
 * The work count is written as `visited / 255`, so the byte read back IS the
 * count until it saturates. It is a counter, not a verdict: a stretch that
 * misses the grid reads zero and a long legitimate walk can reach the top of
 * the byte, so only a case about counting should read it, and whether a walk
 * finished is what {@link PROBE_EXHAUSTED} answers.
 *
 * The mask hit is a fraction of the stretch, so the byte is `fraction * 255`:
 * a whole stretch with nothing in its way reads 255, and one blocked at its
 * own start reads 0.
 */
export const PROBE_RADIANCE = 0;
export const PROBE_TRANSMITTANCE = 1;
export const PROBE_VISITED = 2;
export const PROBE_MASK_HIT = 3;
export const PROBE_EXHAUSTED = 4;

export const probeFragmentSource = `#version 300 es
precision highp float;
precision highp int;

uniform sampler2D uTexture;
uniform sampler2D uSegments;
uniform sampler2D uEmitters;
uniform sampler2D uCells;
uniform sampler2D uIndices;
uniform sampler2D uMask;
uniform sampler2D uMaskCoarse;
uniform sampler2D uMaskSuper;

out vec4 fragColor;

${transportGlsl}

void main() {
    Transfer walked = traceSegment(uniforms.uA, uniforms.uB);
    vec3 shown;

    if (uniforms.uMode < 0.5) {
        shown = clamp(walked.radiance * uniforms.uScale, 0.0, 1.0);
    } else if (uniforms.uMode < 1.5) {
        shown = vec3(walked.transmittance);
    } else if (uniforms.uMode < 2.5) {
        shown = vec3(clamp(walked.visited / 255.0, 0.0, 1.0));
    } else if (uniforms.uMode < 3.5) {
        shown = vec3(maskHit(uniforms.uA, uniforms.uB).fraction);
    } else {
        shown = vec3(walked.exhausted ? 1.0 : 0.0);
    }

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
@group(1) @binding(9) var uMask: texture_2d<f32>;
@group(1) @binding(10) var uMaskSampler: sampler;
@group(1) @binding(11) var uMaskCoarse: texture_2d<f32>;
@group(1) @binding(12) var uMaskCoarseSampler: sampler;
@group(1) @binding(13) var uMaskSuper: texture_2d<f32>;
@group(1) @binding(14) var uMaskSuperSampler: sampler;

${transportWgsl}

@fragment
fn fragmentMain(@location(0) vUv: vec2<f32>) -> @location(0) vec4<f32> {
    let walked = traceSegment(uniforms.uA, uniforms.uB);
    var shown: vec3<f32>;

    if (uniforms.uMode < 0.5) {
        shown = clamp(walked.radiance * uniforms.uScale, vec3<f32>(0.0), vec3<f32>(1.0));
    } else if (uniforms.uMode < 1.5) {
        shown = vec3<f32>(walked.transmittance);
    } else if (uniforms.uMode < 2.5) {
        shown = vec3<f32>(clamp(walked.visited / 255.0, 0.0, 1.0));
    } else if (uniforms.uMode < 3.5) {
        shown = vec3<f32>(maskHit(uniforms.uA, uniforms.uB).fraction);
    } else {
        shown = vec3<f32>(select(0.0, 1.0, walked.exhausted));
    }

    // Opaque: the probe is composited onto the frame like any other draw, and
    // an alpha channel would not survive that to be read back.
    return vec4<f32>(shown, 1.0);
}
`;

/**
 * The same probe over a chunk whose step budgets have been cut to `steps`.
 *
 * The budgets are constants of the chunk, sized so that exhaustion is out of
 * reach for any scene the field can hold. Shrinking them in the shader text is
 * what makes the state reachable at all, and it is the text itself that is
 * shrunk, so what the test exercises is the chunk's own reporting rather than
 * a second implementation of it.
 */
export const starvedSource = (source: string, steps: number): string =>
  source
    .replace(/MAX_CELL_STEPS(: i32)? = \d+/, (match: string) => match.replace(/\d+$/, String(steps)))
    .replace(/MAX_MASK_STEPS(: i32)? = \d+/, (match: string) => match.replace(/\d+$/, String(steps)));

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

/**
 * A synthetic occluder mask: which texels block, over what world region.
 *
 * The production mask is rasterised from drawables at the light field's
 * resolution; naming texels directly is what lets a case state where a wall
 * begins to a fraction of a texel instead of inferring it from a rasteriser.
 */
export interface MaskSpec {
  /** Texels across and up. */
  readonly texels: number;
  /** World region those texels cover. */
  readonly world: Rectangle;
  /** Texel indices that block, as `[x, y]`, with `y` counted up from the region's bottom. */
  readonly blocked: ReadonlyArray<readonly [number, number]>;
  /** Coverage written for a blocking texel, where the case is about the threshold. */
  readonly coverage?: number;
}

/** Fine mask texels one coarse block covers on each axis, as the shader walks them. */
export const MASK_COARSE = 8;

/** A bound mask: the textures plus the world-to-texel mapping the shader needs. */
export interface ProbeMask {
  readonly texture: DataTexture<TextureFormat.Rgba8>;
  /** The block level: one texel per {@link MASK_COARSE} square of the mask, dilated by a texel. */
  readonly coarse: DataTexture<TextureFormat.Rgba8>;
  /** One texel per 4x4 square of the block level. */
  readonly super: DataTexture<TextureFormat.Rgba8>;
  readonly cells: readonly [number, number];
  readonly blocks: readonly [number, number];
  readonly superblocks: readonly [number, number];
  /** Rows of the 2x2 world-to-texel matrix, as `(xx, xy, yx, yy)`. */
  readonly basis: readonly [number, number, number, number];
  readonly offset: readonly [number, number];
  destroy(): void;
}

/**
 * The block level of a mask: a block is marked wherever a mask texel within one
 * texel of it blocks.
 *
 * The extra texel is what lets the walk skip an unmarked block outright. A
 * stretch inside a block can still be stopped by a texel just outside it - the
 * two that share only the corner it crosses - so a block reduced over its own
 * eight texels alone would let that stretch through.
 */
const coarseLevel = (data: Uint8Array, size: number): { readonly data: Uint8Array; readonly size: number } => {
  const blocks = Math.ceil(size / MASK_COARSE);
  const reduced = new Uint8Array(blocks * blocks * 4);

  for (let by = 0; by < blocks; by++) {
    for (let bx = 0; bx < blocks; bx++) {
      let most = 0;

      for (let y = by * MASK_COARSE - 1; y <= by * MASK_COARSE + MASK_COARSE; y++) {
        for (let x = bx * MASK_COARSE - 1; x <= bx * MASK_COARSE + MASK_COARSE; x++) {
          if (x < 0 || y < 0 || x >= size || y >= size) continue;

          most = Math.max(most, data[(y * size + x) * 4 + 3]!);
        }
      }

      reduced.fill(most, (by * blocks + bx) * 4, (by * blocks + bx) * 4 + 4);
    }
  }

  return { data: reduced, size: blocks };
};

const superLevel = (data: Uint8Array, size: number): { readonly data: Uint8Array; readonly size: number } => {
  const blocks = Math.ceil(size / 4);
  const reduced = new Uint8Array(blocks * blocks * 4);

  for (let by = 0; by < blocks; by++) {
    for (let bx = 0; bx < blocks; bx++) {
      let most = 0;

      for (let y = by * 4; y < Math.min((by + 1) * 4, size); y++) {
        for (let x = bx * 4; x < Math.min((bx + 1) * 4, size); x++) {
          most = Math.max(most, data[(y * size + x) * 4 + 3]!);
        }
      }

      reduced.fill(most, (by * blocks + bx) * 4, (by * blocks + bx) * 4 + 4);
    }
  }

  return { data: reduced, size: blocks };
};

/**
 * A mask of named texels, or - with no spec - an empty 1x1 one, which the
 * shader reads as "nothing was rasterised".
 *
 * `rowsDown` is the backend's own row order, which the chunk applies to a mask
 * it expects to be a render target. These fixtures are data textures, whose
 * first row is the first row on either backend, so the mapping handed over
 * undoes that flip where the backend has one. Every case can then name one
 * texel and mean the same texel on both.
 */
export const probeMask = (spec?: MaskSpec, rowsDown = false): ProbeMask => {
  const size = spec?.texels ?? 1;
  const data = new Uint8Array(size * size * 4);
  const coverage = Math.round(255 * (spec?.coverage ?? 1));

  for (const [x, y] of spec?.blocked ?? []) {
    data.fill(coverage, (y * size + x) * 4, (y * size + x) * 4 + 4);
  }

  const reduced = coarseLevel(data, size);
  const superReduced = superLevel(reduced.data, reduced.size);
  const texture = new DataTexture({ width: size, height: size, format: TextureFormat.Rgba8, data });
  const coarse = new DataTexture({ width: reduced.size, height: reduced.size, format: TextureFormat.Rgba8, data: reduced.data });
  const superTexture = new DataTexture({ width: superReduced.size, height: superReduced.size, format: TextureFormat.Rgba8, data: superReduced.data });
  const world = spec?.world ?? PROBE_REGION;
  const rows = rowsDown ? -1 : 1;
  // World to clip over the region, which is what the chunk turns into a texel.
  const across = 2 / world.width;
  const up = (2 / world.height) * rows;

  return {
    texture,
    coarse,
    super: superTexture,
    cells: spec === undefined ? [0, 0] : [size, size],
    blocks: spec === undefined ? [0, 0] : [reduced.size, reduced.size],
    superblocks: spec === undefined ? [0, 0] : [superReduced.size, superReduced.size],
    basis: [across, 0, 0, up],
    offset: [-(world.x + world.width / 2) * across, -(world.y + world.height / 2) * up],
    destroy: (): void => {
      texture.destroy();
      coarse.destroy();
      superTexture.destroy();
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
