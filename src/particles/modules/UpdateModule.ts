import type { ParticleSystem } from '@/particles/ParticleSystem';

import type { WgslContribution } from './WgslContribution';

/**
 * Per-frame, per-batch mutator. Operates on the system's SoA storage
 * directly — typically a single tight loop over `[0, system.liveCount)`
 * that reads/writes the relevant `Float32Array`s.
 *
 * Implementations must always provide a CPU `apply()`. To make a module
 * GPU-eligible (executed inside the system's composite compute shader on
 * WebGPU backends), additionally implement {@link wgsl} and
 * {@link writeUniforms}. Modules that declare a {@link WgslContribution}
 * may also opt to declare a 1D texture binding via the `textures` field
 * (used by `Curve` / `Gradient`-driven modules) — in which case
 * {@link uploadTextures} runs once at compile time to upload the data.
 *
 * Implementation pattern (CPU-only module):
 *
 * ```ts
 * class MyModule extends UpdateModule {
 *     apply(system, dt) {
 *         const { velX, velY, liveCount } = system;
 *         for (let i = 0; i < liveCount; i++) { velX[i] *= 0.99; velY[i] *= 0.99; }
 *     }
 * }
 * ```
 *
 * Implementation pattern (GPU-eligible module):
 *
 * ```ts
 * class MyForce extends UpdateModule {
 *     constructor(public ax: number, public ay: number) { super(); }
 *
 *     apply(system, dt) {
 *         const { velX, velY, liveCount } = system;
 *         for (let i = 0; i < liveCount; i++) { velX[i] += this.ax * dt; velY[i] += this.ay * dt; }
 *     }
 *
 *     wgsl(): WgslContribution {
 *         return {
 *             key: 'MyForce',
 *             uniforms: [{ name: 'ax', type: 'f32' }, { name: 'ay', type: 'f32' }],
 *             body: `velX[idx] += u_MyForce.ax * dt; velY[idx] += u_MyForce.ay * dt;`,
 *         };
 *     }
 *
 *     writeUniforms(view, offset) {
 *         view.setFloat32(offset + 0, this.ax, true);
 *         view.setFloat32(offset + 4, this.ay, true);
 *     }
 * }
 * ```
 *
 * If *any* registered update module on a system lacks `wgsl()`, the system
 * forces CPU mode regardless of backend — preserving the contract that
 * `apply()` is always honoured. Built-in modules ship both
 * implementations; custom modules can opt into GPU acceleration at their
 * authors' discretion.
 *
 * Update modules run after integration each frame. Multiple modules execute
 * in registration order; later modules see the effects of earlier ones.
 */
export abstract class UpdateModule {
  public abstract apply(system: ParticleSystem, dt: number): void;

  /**
   * Override to declare a GPU contribution. Returning a {@link WgslContribution}
   * makes this module GPU-eligible; omitting (or returning undefined)
   * forces CPU mode for any system that uses this module.
   */
  public wgsl?(): WgslContribution;

  /**
   * Write this module's current uniform values into the shared uniform
   * buffer at `byteOffset`. Layout must match the field declarations
   * returned by {@link wgsl} (in the same order).
   *
   * Receives the current frame `dt` (seconds). Modules tracking
   * accumulated time (e.g. noise/turbulence) should advance their
   * internal counter here to stay in sync when running in GPU mode
   * (where {@link apply} is not called).
   *
   * Required when {@link wgsl} declares uniforms. Called every frame by
   * the system before dispatching compute.
   */
  public writeUniforms?(view: DataView, byteOffset: number, dt: number): void;

  /**
   * Upload texture data (Curve/Gradient lookup tables) to the GPU at
   * compile time. Receives the GPUDevice and a map of texture bindings
   * keyed by the `name` in {@link WgslContribution.textures}. Called once
   * after pipeline creation.
   *
   * Required when {@link wgsl} declares textures.
   */
  public uploadTextures?(device: GPUDevice, textures: ReadonlyMap<string, GPUTexture>): void;

  /** Optional cleanup hook called from `ParticleSystem.destroy`. */
  public destroy(): void {}
}
