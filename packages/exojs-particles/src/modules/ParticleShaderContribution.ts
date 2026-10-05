/** Scalar/vector wire types shared by shader backends. Names retain WGSL spelling; GLSL maps them to its corresponding types. */
export type ParticleUniformPrimitive = 'f32' | 'i32' | 'u32' | 'vec2<f32>' | 'vec4<f32>';

/** Ordered fields written by `UpdateModule.writeUniforms`. Scalars align to 4 bytes, vec2 to 8 and vec4 to 16. */
export interface ParticleUniformField {
  name: string;
  type: ParticleUniformPrimitive;
}

/** A 256-sample lookup table. Float curves contain 256 values; RGBA tables contain 1024 bytes. */
export interface ParticleTextureBinding {
  name: string;
  format: 'r32float' | 'rgba8unorm';
}

/** Resource schema shared by explicitly authored WGSL and GLSL implementations. */
export interface ParticleShaderContribution {
  /** Unique per module class within a system; combine repeated instances into one module. */
  key: string;
  uniforms?: readonly ParticleUniformField[];
  textures?: readonly ParticleTextureBinding[];
  /** Module-scoped helper declarations. Prefix names with the module key to avoid collisions. */
  prelude?: string;
  body: string;
}
