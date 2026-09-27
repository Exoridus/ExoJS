import type { ParticleBatch } from '#ParticleStorage';

import type { GlslContribution } from './GlslContribution';
import type { WgslContribution } from './WgslContribution';

/**
 * Mutates live particles after integration, in registration order. Later
 * modules observe earlier writes. CPU `apply()` is always required.
 *
 * GPU support is explicit per backend: `wgsl()` opts into WebGPU compute,
 * `glsl()` into WebGL2 transform feedback. If any module lacks the attached
 * backend's contribution, the entire system uses the supported CPU fallback.
 * Built-in modules provide all three implementations. GPU bodies must
 * preserve the CPU operation, channel ownership and module ordering.
 *
 * Shader sources and lookup tables are captured when the module list is
 * compiled. Remove and re-add a module after replacing lookup configuration;
 * uniform values are refreshed each frame without recompilation.
 */
export abstract class UpdateModule {
  /** Runs only during CPU simulation; must not retain the borrowed particle batch. */
  public abstract apply(particles: ParticleBatch, dt: number): void;

  /** Explicit WebGPU implementation. Absence selects CPU fallback on WebGPU. */
  public wgsl?(): WgslContribution;

  /** Explicit WebGL2 implementation. Absence selects CPU fallback on WebGL2. */
  public glsl?(): GlslContribution;

  /**
   * Backend-neutral lookup bytes keyed by texture binding name. Tables have
   * 256 samples: `r32float` uses 256 floats, `rgba8unorm` uses 1024 RGBA bytes.
   * Called at compilation; borrowed arrays must remain valid until upload
   * completes. Shader authors must explicitly interpolate texels if needed.
   */
  public textureData?(): ReadonlyMap<string, Float32Array<ArrayBuffer> | Uint8Array<ArrayBuffer>>;

  /**
   * Writes little-endian values in contribution field order at `byteOffset`.
   * Align scalars to 4 bytes, vec2 to 8 and vec4 to 16. The same bytes feed
   * both backends. Required when the selected contribution declares uniforms.
   *
   * Called once per GPU simulation step. Stateful modules should advance
   * their clock here instead of `apply()`, which does not run in GPU mode.
   */
  public writeUniforms?(view: DataView, byteOffset: number, dt: number): void;

  /**
   * Legacy WebGPU texture uploader, called at compilation with bindings keyed
   * by name. Prefer `textureData()` for modules that support both GPU backends.
   */
  public uploadTextures?(device: GPUDevice, textures: ReadonlyMap<string, GPUTexture>): void;

  /** Optional cleanup hook called from `ParticleSystem.destroy`. */
  public destroy(): void {}
}
