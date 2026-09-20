/**
 * A direct reference for the light arriving at a point, with none of the
 * machinery the renderer uses to make that affordable.
 *
 * One fragment, one world position, a fixed number of directions spread over
 * the circle, and one straight walk per direction over the same transport
 * tables and the same analytic emitters the renderer walks. No cascade, no
 * merge, no probe gather, no bounce. What it costs is the reason the cascades
 * exist; what it gives is an answer the cascades can be judged against rather
 * than only compared with each other.
 *
 * The quadrature is the only approximation left, and it is checked by running
 * the same point at several direction counts.
 */

import { UniformType } from '#rendering/uniforms/UniformType';

import transportGlsl from '../../../packages/exojs-lighting/src/backends/shaders/transport.frag';
import transportWgsl from '../../../packages/exojs-lighting/src/backends/shaders/transport.wgsl';

/** Directions the loop can run at most; the count in use is a uniform. */
export const REFERENCE_MAX_DIRECTIONS = 8192;

export const referenceUniforms = {
  uGridOrigin: UniformType.Vec2,
  uGridCells: UniformType.Vec2,
  uMaskCells: UniformType.Vec2,
  uMaskBasis: UniformType.Vec4,
  uMaskOffset: UniformType.Vec2,
  uMaskBlocks: UniformType.Vec2,
  uCellSize: UniformType.Float,
  uTableWidth: UniformType.Float,
  uToWorld: UniformType.Vec4,
  uWorldOffset: UniformType.Vec2,
  uReach: UniformType.Float,
  uDirections: UniformType.Float,
  uScale: UniformType.Float,
} as const;

const GLSL_BINDINGS = `uniform sampler2D uTexture;
uniform sampler2D uSegments;
uniform sampler2D uEmitters;
uniform sampler2D uCells;
uniform sampler2D uIndices;
uniform sampler2D uMask;
uniform sampler2D uMaskCoarse;`;

const WGSL_BINDINGS = `@group(0) @binding(1) var uTexture: texture_2d<f32>;
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
@group(1) @binding(12) var uMaskCoarseSampler: sampler;`;

export const referenceFragmentSource = `#version 300 es
precision highp float;
precision highp int;

${GLSL_BINDINGS}

in vec2 vUv;
out vec4 fragColor;

${transportGlsl}

void main() {
    vec2 clip = vUv * 2.0 - 1.0;
    vec2 world = vec2(dot(uniforms.uToWorld.xy, clip), dot(uniforms.uToWorld.zw, clip)) + uniforms.uWorldOffset;
    int count = int(uniforms.uDirections);
    vec3 total = vec3(0.0);

    for (int index = 0; index < ${REFERENCE_MAX_DIRECTIONS}; index++) {
        if (index >= count) {
            break;
        }

        float angle = (float(index) + 0.5) * 6.28318530718 / float(count);

        total += traceSegment(world, world + vec2(cos(angle), sin(angle)) * uniforms.uReach).radiance;
    }

    fragColor = vec4(total * (uniforms.uScale / float(count)), 1.0);
}
`;

export const referenceWgslSource = `${WGSL_BINDINGS}

${transportWgsl}

@fragment
fn fragmentMain(@location(0) vUv: vec2<f32>) -> @location(0) vec4<f32> {
    // Not flipped, unlike the renderer's own stages: this probe writes into a
    // scratch corner of the frame rather than into the camera's target, and
    // the caller owns the mapping so that one row means the same receiver on
    // either backend.
    let clip = vec2<f32>(vUv.x * 2.0 - 1.0, vUv.y * 2.0 - 1.0);
    let world = vec2<f32>(dot(uniforms.uToWorld.xy, clip), dot(uniforms.uToWorld.zw, clip)) + uniforms.uWorldOffset;
    let count = i32(uniforms.uDirections);
    var total = vec3<f32>(0.0);

    for (var index = 0; index < ${REFERENCE_MAX_DIRECTIONS}; index = index + 1) {
        if (index >= count) {
            break;
        }

        let angle = (f32(index) + 0.5) * 6.28318530718 / f32(count);

        total = total + traceSegment(world, world + vec2<f32>(cos(angle), sin(angle)) * uniforms.uReach).radiance;
    }

    return vec4<f32>(total * (uniforms.uScale / f32(count)), 1.0);
}
`;
