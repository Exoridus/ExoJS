/**
 * WGSL primitive types accepted in {@link WgslUniformField} declarations.
 * The codegen emits matching WGSL field declarations; the writeUniforms
 * implementation must produce bytes in the layout WGSL expects (see
 * https://www.w3.org/TR/WGSL/#alignment-and-size).
 *
 * Common pitfalls:
 * - `vec2<f32>` aligns to 8 bytes; pad with `f32` or use `vec4<f32>`.
 * - `vec3<f32>` aligns to 16 bytes (so does `vec4<f32>`); avoid `vec3` for tight packing.
 *
 * For now the supported subset covers what the built-in modules need. Add
 * more types here as new modules require them.
 */
export type WgslPrimitive = 'f32' | 'i32' | 'u32' | 'vec2<f32>' | 'vec4<f32>';

/** A named uniform field within a module's struct. Order matters — defines memory layout. */
export interface WgslUniformField {
  name: string;
  type: WgslPrimitive;
}

/** A 1D texture binding (used by Curve / ColorGradient lookups). */
export interface WgslTextureBinding {
  /** Field name within the module — referenced in WGSL as `u_${moduleKey}_${name}`. */
  name: string;
  /** WGSL texture format. `r32float` for Curve, `rgba8unorm` for ColorGradient. */
  format: 'r32float' | 'rgba8unorm';
}

/**
 * What an {@link UpdateModule} contributes to the system's composite compute
 * shader. `body` runs once per particle in the inner main function, with
 * these locals in scope:
 *
 * - `idx: u32` — the particle slot index (already gated on `< sim.liveCount`
 *   and skip-on-dead via `timing[idx].y < 0.0`).
 * - `dt: f32` — frame delta in seconds (mirrors `sim.dt`).
 * - **Packed SoA bindings** (see body of doc) — channels are packed into
 *   `vec2<f32>`-typed storage buffers to fit within WebGPU's default 8-buffer
 *   limit. Access x/y components for the per-axis values:
 *   - `positions[idx].x` / `.y` (was posX/posY)
 *   - `velocities[idx].x` / `.y` (was velX/velY)
 *   - `scales[idx].x` / `.y` (was scaleX/scaleY)
 *   - `rotInfo[idx].x` / `.y` (rotation, rotationSpeed)
 *   - `timing[idx].x` / `.y` (elapsed, lifetime — y is set to -1 when expired)
 *   - `color[idx]` — packed RGBA u32, single channel (no .x/.y)
 * - `sim: SimUniforms` — `{ dt: f32, liveCount: u32 }`.
 * - `modules.u_${key}: ${Key}Uniforms` — your module's uniform struct (if declared).
 * - `u_${key}_${textureName}` and `u_${key}_${textureName}_sampler` — texture bindings (if any).
 *
 * The body should not declare new functions or top-level statements; it
 * runs inline in the main function. Use comments and parentheses generously
 * — composition concatenates several module bodies and any syntax mistake
 * surfaces only at pipeline-creation time.
 */
export interface WgslContribution {
  /** Unique key per module *class* (e.g. `'ApplyForce'`). Two ApplyForce instances on one system aren't supported — combine into one. */
  key: string;
  uniforms?: readonly WgslUniformField[];
  textures?: readonly WgslTextureBinding[];
  /**
   * Optional WGSL declarations (functions, constants) emitted at module
   * scope before `main()`. Use this for noise/hash helpers or any
   * supporting function the {@link body} calls. Multiple modules can
   * declare preludes; they're concatenated in registration order. Naming
   * collisions across modules are the author's problem — prefix helpers
   * with the module key (e.g. `myModule_hash`) to avoid clashes.
   */
  prelude?: string;
  body: string;
}

/**
 * Compute the byte size of a uniform struct from its declared fields,
 * respecting WGSL std140-like alignment rules. Each field aligns to its
 * natural alignment; the struct itself rounds to its largest alignment.
 *
 * Used by the codegen to size the system's combined uniform buffer.
 */
export const wgslUniformByteSize = (fields: readonly WgslUniformField[]): number => {
  let offset = 0;
  let maxAlign = 4;

  for (const field of fields) {
    const { size, align } = wgslFieldLayout(field.type);

    offset = Math.ceil(offset / align) * align;
    offset += size;
    maxAlign = Math.max(maxAlign, align);
  }

  return Math.ceil(offset / maxAlign) * maxAlign;
};

/** Per-WGSL-primitive size and alignment in bytes. */
export const wgslFieldLayout = (type: WgslPrimitive): { size: number; align: number } => {
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
