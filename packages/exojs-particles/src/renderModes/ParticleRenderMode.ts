import type { Geometry, Material } from '@codexo/exojs';

import type { ParticleSystem } from '#ParticleSystem';

/**
 * Turns a particle system's SoA storage into drawable vertex data.
 *
 * A mode owns the whole "how": the vertex layout, the shader pair, the draw
 * model, and the loop that fills the buffer. The backend renderers only upload
 * what it produces and issue the draw it declares, so a new primitive is a new
 * mode rather than a renderer change.
 *
 * Implementations are fixed at system construction (see
 * `ParticleSystemOptions.render`) and default to `QuadParticles`.
 *
 * **Limits of the seam.** The executors are deliberately thin, so a new mode
 * has to stay inside what they can express:
 *
 * - The geometry's `stride` must be a multiple of 4. WebGPU's
 *   `queue.writeBuffer` validates its copy size against that alignment and
 *   rejects anything else, so a mode with, say, a 38-byte stride draws on
 *   WebGL2 and fails validation on WebGPU.
 * - An **indexed, non-instanced** mode always draws the geometry's fixed
 *   `indexCount` and ignores {@link count} on both backends. That is right for
 *   a fixed-topology mode and wrong for one whose element count varies per
 *   frame; such a mode needs the executors taught to derive an index count
 *   from {@link count} first. No mode ships in that shape today.
 * - The **instanced, non-indexed** path draws `geometry.indexCount` vertices
 *   per instance, which for a geometry without indices is the vertex count its
 *   placeholder `vertexData` implies. A mode on that path therefore has to
 *   size `vertexData` to its vertices-per-instance rather than leave it empty.
 */
export abstract class ParticleRenderMode {
  /** Base geometry: topology, named attributes, buffer usage. */
  public abstract readonly geometry: Geometry;

  /** Shader pair plus uniforms/textures for this mode. */
  public abstract readonly material: Material;

  /**
   * Draw model. `true` issues an instanced draw against {@link geometry};
   * `false` a plain draw over the built vertex buffer. Declared here because
   * `Geometry` carries topology but has no instancing concept.
   */
  public abstract readonly instanced: boolean;

  /**
   * Whether this mode can run while the system is in GPU compute mode.
   * Mirrors `UpdateModule.wgsl()`: a mode that cannot forces the whole system
   * onto the CPU path, silently and observably via `ParticleSystem.gpuMode`.
   *
   * A GPU-eligible mode's layout must match what the compute pipeline emits
   * into `gpuState.instanceBuffer` — the shared 40-byte per-instance layout
   * (`instanceAttributes`). `QuadParticles` and `MeshParticles` both declare
   * exactly that layout and differ only in the shape they expand it into,
   * which is why both are eligible without the compute shader knowing either.
   */
  public readonly gpuEligible: boolean = false;

  private _data: ArrayBuffer = new ArrayBuffer(0);
  private _count = 0;

  /**
   * Element count of the draw call this mode's last {@link build} produced.
   * Draw-model relative: instance count when {@link instanced}, vertex count
   * otherwise. Do not assume one meaning.
   */
  public get count(): number {
    return this._count;
  }

  /** The buffer the renderer uploads. Valid until the next {@link build}. */
  public get data(): ArrayBuffer {
    return this._data;
  }

  /** Fill the scratch buffer from `system`'s current SoA state. */
  public abstract build(system: ParticleSystem): void;

  /** Optional cleanup, called from `ParticleSystem.destroy`. */
  public destroy(): void {}

  /** Record the element count produced by a {@link build}. */
  protected _setCount(count: number): void {
    this._count = count;
  }

  /**
   * Grow the scratch buffer to hold at least `byteLength`. Grow-only: a
   * shrinking particle count reuses the larger buffer rather than
   * reallocating, matching the renderers' existing buffer policy.
   */
  protected _ensureCapacity(byteLength: number): void {
    if (this._data.byteLength >= byteLength) {
      return;
    }

    let next = Math.max(this._data.byteLength, 1);

    while (next < byteLength) {
      next *= 2;
    }

    this._data = new ArrayBuffer(next);
    this._onBufferGrown(this._data);
  }

  /** Re-create typed-array views after {@link _ensureCapacity} reallocates. */
  protected _onBufferGrown(_data: ArrayBuffer): void {}
}
