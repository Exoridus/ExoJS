import type { Material } from '@codexo/exojs';
import { Geometry, ShaderSource } from '@codexo/exojs';

import type { ParticleSystem } from '#ParticleSystem';

import fragmentSource from '../renderers/glsl/particle.frag';
import vertexSource from '../renderers/glsl/particle.vert';
import { ParticleMaterial } from './ParticleMaterial';
import { ParticleRenderMode } from './ParticleRenderMode';

const instanceStrideBytes = 40;
const wordsPerInstance = instanceStrideBytes / Uint32Array.BYTES_PER_ELEMENT;
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
 * Layout of the per-instance buffer {@link build} fills (40 bytes, 6
 * attributes):
 *
 * ```
 *   a_position   f32x2  (offset  0,  8 bytes)  particle position (system-local)
 *   a_scale      f32x2  (offset  8,  8 bytes)
 *   a_rotation   f32    (offset 16,  4 bytes)  degrees
 *   a_color      u8x4   (offset 20,  4 bytes)  RGBA tint, normalised
 *   a_uvMin      f32x2  (offset 24,  8 bytes)  pre-resolved frame uvMin
 *   a_uvMax      f32x2  (offset 32,  8 bytes)  pre-resolved frame uvMax
 * ```
 *
 * UVs are baked per-particle so the system can carry an atlas of frames —
 * `system.frames` declares the rectangles and each particle's `textureIndex`
 * selects one. {@link build} resolves frame-rectangle to UVs once per particle
 * per frame; no per-instance shader-side indexing needed.
 *
 * This is the only GPU-eligible mode: the system's compute pipeline emits
 * exactly this layout into its instance buffer, so a system running on the GPU
 * path can bind that buffer directly and skip {@link build} entirely.
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
    attributes: [
      { name: 'a_position', size: 2, type: 'f32', normalized: false, offset: 0 },
      { name: 'a_scale', size: 2, type: 'f32', normalized: false, offset: 8 },
      { name: 'a_rotation', size: 1, type: 'f32', normalized: false, offset: 16 },
      { name: 'a_color', size: 4, type: 'u8', normalized: true, offset: 20 },
      { name: 'a_uvMin', size: 2, type: 'f32', normalized: false, offset: 24 },
      { name: 'a_uvMax', size: 2, type: 'f32', normalized: false, offset: 32 },
    ],
    vertexData: new ArrayBuffer(quadVertexCount * instanceStrideBytes),
    stride: instanceStrideBytes,
    indices: quadIndices,
    topology: 'triangle-list',
    usage: 'stream',
  });

  private _material: ParticleMaterial | null = null;
  private _float32 = new Float32Array(this.data);
  private _uint32 = new Uint32Array(this.data);
  private _uvMinsScratch = new Float32Array(2);
  private _uvMaxsScratch = new Float32Array(2);

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
    const limit = system.liveCount;

    // Must precede the view reads below: growing swaps in fresh typed-array
    // views over a new backing buffer.
    this._ensureCapacity(limit * instanceStrideBytes);

    const f32 = this._float32;
    const u32 = this._uint32;
    const { posX, posY, scaleX, scaleY, rotations, color, textureIndex, alive } = system;

    // Pre-compute frame UVs from system.frames + texture; falls back
    // to the system.textureFrame when no atlas is declared.
    const { uvMins, uvMaxs } = this._computeFrameUvs(system);
    const frameCount = uvMins.length / 2;
    const fallbackFrame = 0;

    let writeIndex = 0;

    for (let i = 0; i < limit; i++) {
      // Skip dead slots in GPU-mode systems where the live range can
      // contain holes.
      if (alive[i] === 0) {
        continue;
      }

      const offset = writeIndex * wordsPerInstance;
      const frame = textureIndex[i]! < frameCount ? textureIndex[i]! : fallbackFrame;
      const uvBase = frame * 2;

      f32[offset + 0] = posX[i]!;
      f32[offset + 1] = posY[i]!;
      f32[offset + 2] = scaleX[i]!;
      f32[offset + 3] = scaleY[i]!;
      f32[offset + 4] = rotations[i]!;
      u32[offset + 5] = color[i]!;
      f32[offset + 6] = uvMins[uvBase + 0]!;
      f32[offset + 7] = uvMins[uvBase + 1]!;
      f32[offset + 8] = uvMaxs[uvBase + 0]!;
      f32[offset + 9] = uvMaxs[uvBase + 1]!;

      writeIndex++;
    }

    this._setCount(writeIndex);
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

  /**
   * Compute (uvMin, uvMax) pairs for every declared frame on the system.
   * Pulled out of the hot pack loop so the arithmetic runs once per frame
   * rather than once per particle. Falls back to a single entry from
   * `system.textureFrame` when no atlas is declared.
   */
  private _computeFrameUvs(system: ParticleSystem): { uvMins: Float32Array; uvMaxs: Float32Array } {
    const frames = system.frames;
    const tex = system.texture;
    const texW = tex.width;
    const texH = tex.height;
    const flipY = tex.flipY;

    const count = frames.length === 0 ? 1 : frames.length;

    // Re-allocate scratch when capacity grows.
    if (this._uvMinsScratch.length < count * 2) {
      this._uvMinsScratch = new Float32Array(count * 2);
      this._uvMaxsScratch = new Float32Array(count * 2);
    }

    const mins = this._uvMinsScratch;
    const maxs = this._uvMaxsScratch;

    if (frames.length === 0) {
      const f = system.textureFrame;
      const minU = f.left / texW;
      const maxU = f.right / texW;
      const topV = f.top / texH;
      const bottomV = f.bottom / texH;

      mins[0] = minU;
      mins[1] = flipY ? bottomV : topV;
      maxs[0] = maxU;
      maxs[1] = flipY ? topV : bottomV;

      return { uvMins: mins, uvMaxs: maxs };
    }

    for (let i = 0; i < frames.length; i++) {
      const f = frames[i]!;
      const o = i * 2;
      const minU = f.left / texW;
      const maxU = f.right / texW;
      const topV = f.top / texH;
      const bottomV = f.bottom / texH;

      mins[o + 0] = minU;
      mins[o + 1] = flipY ? bottomV : topV;
      maxs[o + 0] = maxU;
      maxs[o + 1] = flipY ? topV : bottomV;
    }

    return { uvMins: mins, uvMaxs: maxs };
  }
}
