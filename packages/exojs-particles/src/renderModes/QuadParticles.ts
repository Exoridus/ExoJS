import type { Material } from '@codexo/exojs';
import { Geometry, ShaderSource } from '@codexo/exojs';

import type { ParticleSystem } from '#ParticleSystem';

import fragmentSource from '../renderers/glsl/particle.frag';
import vertexSource from '../renderers/glsl/particle.vert';
import { instanceAttributes, instanceStrideBytes, ParticleInstanceWriter } from './ParticleInstanceWriter';
import { ParticleMaterial } from './ParticleMaterial';
import { ParticleRenderMode } from './ParticleRenderMode';

const quadVertexCount = 4;
const quadIndices = new Uint16Array([0, 1, 2, 0, 2, 3]);

/**
 * WGSL counterpart of `glsl/particle.vert` + `glsl/particle.frag`. Vertex and
 * fragment entry points share one source per WGSL convention, and the
 * per-instance attributes bind by `@location`, matching the declaration order
 * and byte offsets of {@link QuadParticles.geometry}.
 *
 * The quad's corner is derived from `vertex_index` exactly as the GLSL derives
 * it from `gl_VertexID`, so both backends need nothing beyond this mode's own
 * interleaved buffer and index buffer.
 */
export const quadParticleWgsl = `
struct ProjectionUniforms {
    projection: mat4x4<f32>,
    translation: mat4x4<f32>,
    flags: vec4<f32>,
    localBounds: vec4<f32>,    // quadMin.xy, quadSize.xy
    uvBounds: vec4<f32>,       // uvMin.xy, uvMax.xy
};

@group(0) @binding(0)
var<uniform> uniforms: ProjectionUniforms;

@group(1) @binding(0)
var particleTexture: texture_2d<f32>;

@group(1) @binding(1)
var particleSampler: sampler;

// Per-instance attributes (one entry per particle, 40 bytes total).
struct VertexInput {
    @builtin(vertex_index) vertexIndex: u32,
    @location(0) translation: vec2<f32>,
    @location(1) scale: vec2<f32>,
    @location(2) rotation: f32,
    @location(3) color: vec4<f32>,
    @location(4) uvMin: vec2<f32>,            // pre-resolved frame UV (top-left)
    @location(5) uvMax: vec2<f32>,            // pre-resolved frame UV (bottom-right)
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) texcoord: vec2<f32>,
    @location(1) color: vec4<f32>,
};

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
    let quadMin = uniforms.localBounds.xy;
    let quadSize = uniforms.localBounds.zw;

    // Unit-quad corner from the index buffer's value: 0 -> (0,0), 1 -> (1,0),
    // 2 -> (1,1), 3 -> (0,1) — the same mapping the GLSL derives from gl_VertexID.
    let unitPosition = vec2<f32>(
        f32(((input.vertexIndex + 1u) >> 1u) & 1u),
        f32(input.vertexIndex >> 1u)
    );

    let localPosition = quadMin + (unitPosition * quadSize);
    let radians = radians(input.rotation);
    let sinValue = sin(radians);
    let cosValue = cos(radians);
    let rotated = vec2<f32>(
        (localPosition.x * (input.scale.x * cosValue)) + (localPosition.y * (input.scale.y * sinValue)) + input.translation.x,
        (localPosition.x * (input.scale.x * -sinValue)) + (localPosition.y * (input.scale.y * cosValue)) + input.translation.y
    );

    var output: VertexOutput;

    output.position = uniforms.projection * uniforms.translation * vec4<f32>(rotated, 0.0, 1.0);
    output.texcoord = input.uvMin + ((input.uvMax - input.uvMin) * unitPosition);
    output.color = vec4(input.color.rgb * input.color.a, input.color.a);

    return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
    let sample = textureSample(particleTexture, particleSampler, input.texcoord);
    let premultipliedSample = select(sample, vec4(sample.rgb * sample.a, sample.a), uniforms.flags.x > 0.5);

    return premultipliedSample * input.color;
}
`;

/**
 * The default render mode: one textured, rotated, tinted quad per particle,
 * drawn as a single instanced triangle-list.
 *
 * {@link build} fills the shared 40-byte per-instance layout described by
 * {@link instanceAttributes}. UVs are baked per-particle so the system can
 * carry an atlas of frames — `system.frames` declares the rectangles and each
 * particle's `textureIndex` selects one, resolved to UVs once per particle per
 * frame; no per-instance shader-side indexing needed.
 *
 * GPU-eligible: the system's compute pipeline emits exactly that layout into
 * its instance buffer, so a system running on the GPU path can bind that buffer
 * directly and skip {@link build} entirely.
 */
export class QuadParticles extends ParticleRenderMode {
  public override readonly gpuEligible = true;
  public readonly instanced = true;

  /**
   * The quad's four corners are derived in the shader — from `gl_VertexID` on
   * WebGL2 and from `vertex_index` on WebGPU — so this
   * geometry describes the per-instance layout and carries a zero-filled
   * placeholder large enough for the four corner slots the index buffer
   * addresses.
   */
  public readonly geometry = new Geometry({
    attributes: instanceAttributes,
    vertexData: new ArrayBuffer(quadVertexCount * instanceStrideBytes),
    stride: instanceStrideBytes,
    indices: quadIndices,
    topology: 'triangle-list',
    usage: 'stream',
  });

  private readonly _writer = new ParticleInstanceWriter();

  private _material: ParticleMaterial | null = null;
  private _float32 = new Float32Array(this.data);
  private _uint32 = new Uint32Array(this.data);

  /**
   * Built on first read rather than in the constructor: a system may be
   * simulated without ever being drawn, and the shader pair is only needed
   * once a backend actually compiles it.
   */
  public get material(): Material {
    this._material ??= new ParticleMaterial({
      shader: new ShaderSource({
        glsl: { vertex: vertexSource, fragment: fragmentSource },
        wgsl: quadParticleWgsl,
      }),
    });

    return this._material;
  }

  public build(system: ParticleSystem): void {
    // Must precede the view reads below: growing swaps in fresh typed-array
    // views over a new backing buffer.
    this._ensureCapacity(system.liveCount * instanceStrideBytes);

    this._setCount(this._writer.write(system, this._float32, this._uint32));
  }

  public override destroy(): void {
    this._material?.destroy();
    this._material = null;
    this.geometry.destroy();
  }

  protected override _onBufferGrown(data: ArrayBuffer): void {
    this._float32 = new Float32Array(data);
    this._uint32 = new Uint32Array(data);
  }
}
