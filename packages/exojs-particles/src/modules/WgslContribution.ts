import type {
  ParticleShaderContribution,
  ParticleTextureBinding,
  ParticleUniformField,
  ParticleUniformPrimitive,
} from './ParticleShaderContribution';

/** Compatibility names for the backend-neutral shader resource schema. */
export type WgslPrimitive = ParticleUniformPrimitive;
export type WgslUniformField = ParticleUniformField;
export type WgslTextureBinding = ParticleTextureBinding;

/**
 * What an {@link UpdateModule} contributes to the system's composite compute
 * shader. `body` runs once per particle in the inner main function, with
 * these locals in scope:
 *
 * - `idx: u32` - the particle slot index (already gated on `< sim.liveCount`
 *   and skip-on-dead via the reserved lifecycle lane).
 * - `dt: f32` - frame delta in seconds (mirrors `sim.dt`).
 * - **Packed SoA bindings** (see body of doc) - channels are packed into
 *   `vec2<f32>`-typed storage buffers to fit within WebGPU's default 8-buffer
 *   limit. Access x/y components for the per-axis values:
 *   - `positions[idx].x` / `.y` (was posX/posY)
 *   - `velocities[idx].x` / `.y` (was velX/velY)
 *   - `scales[idx].x` / `.y` (was scaleX/scaleY)
 *   - `rotInfo[idx].x` / `.y` (rotation, rotationSpeed; z is the frame index and w is reserved)
 *   - `timing[idx].x` / `.y` (elapsed, lifetime)
 *   - `color[idx]` - packed RGBA u32, single channel (no .x/.y)
 * - `sim: SimUniforms` - `{ dt: f32, liveCount: u32 }`.
 * - `modules.u_${key}: ${Key}Uniforms` - your module's uniform struct (if declared).
 * - `u_${key}_${textureName}` and `u_${key}_${textureName}_sampler` - texture bindings (if any).
 *
 * The body should not declare new functions or top-level statements; it
 * runs inline in the main function. Use comments and parentheses generously
 * - composition concatenates several module bodies and any syntax mistake
 * surfaces only at pipeline-creation time.
 */
export interface WgslContribution extends ParticleShaderContribution {}

/**
 * Compute the byte size of a uniform struct from its declared fields,
 * respecting WGSL std140-like alignment rules. Each field aligns to its
 * natural alignment; the struct itself rounds to its largest alignment.
 *
 * Used by the codegen to size the system's combined uniform buffer.
 */
export const getWgslUniformByteSize = (fields: readonly WgslUniformField[]): number => {
  let offset = 0;
  let maxAlign = 4;

  for (const field of fields) {
    const { size, align } = getWgslFieldLayout(field.type);

    offset = Math.ceil(offset / align) * align;
    offset += size;
    maxAlign = Math.max(maxAlign, align);
  }

  return Math.ceil(offset / maxAlign) * maxAlign;
};

/** Per-WGSL-primitive size and alignment in bytes. */
export const getWgslFieldLayout = (type: WgslPrimitive): { size: number; align: number } => {
  switch (type) {
    case 'f32':
    case 'i32':
    case 'u32':
      return { size: 4, align: 4 };
    case 'vec2<f32>':
      return { size: 8, align: 8 };
    case 'vec4<f32>':
      return { size: 16, align: 16 };
  }
};
