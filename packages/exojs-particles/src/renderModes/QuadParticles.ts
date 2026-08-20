import type { Material } from '@codexo/exojs';
import { ShaderSource } from '@codexo/exojs';

import type { ParticleBatch } from '#ParticleStorage';
import type { ParticleSystem } from '#ParticleSystem';

import fragmentSource from '../renderers/glsl/particle.frag';
import vertexSource from '../renderers/glsl/particle.vert';
import { ParticleBufferLayout } from './ParticleBufferLayout';
import { instanceAttributes, instanceStrideBytes, ParticleInstanceWriter } from './ParticleInstanceWriter';
import { ParticleMaterial } from './ParticleMaterial';
import { ParticleRenderMode } from './ParticleRenderMode';
import quadParticleWgslModule from './wgsl/quad-particles.wgsl';

const quadIndices = new Uint16Array([0, 1, 2, 0, 2, 3]);

/**
 * WGSL counterpart of `glsl/particle.vert` + `glsl/particle.frag`. Vertex and
 * fragment entry points share one source per WGSL convention, and the
 * per-instance attributes bind by `@location`, matching the declaration order
 * and byte offsets of {@link QuadParticles.dataLayout}.
 *
 * The quad's corner is derived from `vertex_index` exactly as the GLSL derives
 * it from `gl_VertexID`, so both backends need nothing beyond this mode's own
 * interleaved buffer and index buffer.
 */
export const quadParticleWgsl: string = quadParticleWgslModule;

/**
 * The default render mode: one textured, rotated, tinted quad per particle,
 * drawn as a single instanced triangle-list.
 *
 * {@link build} fills the shared 40-byte per-instance layout described by
 * {@link instanceAttributes}. UVs are baked per-particle so the system can
 * carry an atlas of frames - `system.frames` declares the rectangles and each
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
   * The quad's four corners are derived in the shader - from `gl_VertexID` on
   * WebGL2 and from `vertex_index` on WebGPU - so this mode declares no
   * per-vertex geometry and its layout carries the indices that address those
   * four corner slots.
   */
  public readonly dataLayout = new ParticleBufferLayout({
    attributes: instanceAttributes,
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

  public build(system: ParticleSystem, particles: ParticleBatch): void {
    // Must precede the view reads below: growing swaps in fresh typed-array
    // views over a new backing buffer.
    this._ensureCapacity(particles.count * instanceStrideBytes);

    this._setCount(this._writer.write(system, particles, this._float32, this._uint32));
  }

  public override destroy(): void {
    this._material?.destroy();
    this._material = null;
  }

  protected override _onBufferGrown(data: ArrayBuffer): void {
    this._float32 = new Float32Array(data);
    this._uint32 = new Uint32Array(data);
  }
}
