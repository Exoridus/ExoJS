/**
 * Field types a typed uniform block can hold.
 *
 * The values are the WGSL spellings, so a diagnostic naming a type reads the
 * same as the generated shader declaration. GLSL declarations are derived from
 * them (`f32` becomes `float`, `mat4x4<f32>` becomes `mat4`, and so on).
 *
 * Every field starts at zero, matrices included: one rule for the whole schema
 * rather than a special case, and it matches a freshly allocated GPU buffer. A
 * caller who wants the identity assigns it, or declares it as the field's
 * `default`.
 *
 * Textures, samplers and vertex attributes are bindings rather than
 * uniform-buffer fields and are declared separately.
 * @advanced
 */
export enum UniformType {
  Float = 'f32',
  Int = 'i32',
  Uint = 'u32',
  Vec2 = 'vec2<f32>',
  Vec3 = 'vec3<f32>',
  Vec4 = 'vec4<f32>',
  Mat3 = 'mat3x3<f32>',
  Mat4 = 'mat4x4<f32>',
}

/** Which typed-array view of the block buffer a field's components live in. @internal */
export type UniformComponentKind = 'f32' | 'i32' | 'u32';

/** Component storage, byte alignment and byte size of every {@link UniformType}. @internal */
export const uniformTypeInfo: Readonly<Record<UniformType, { readonly kind: UniformComponentKind; readonly align: number; readonly size: number }>> = {
  [UniformType.Float]: { kind: 'f32', align: 4, size: 4 },
  [UniformType.Int]: { kind: 'i32', align: 4, size: 4 },
  [UniformType.Uint]: { kind: 'u32', align: 4, size: 4 },
  [UniformType.Vec2]: { kind: 'f32', align: 8, size: 8 },
  [UniformType.Vec3]: { kind: 'f32', align: 16, size: 12 },
  [UniformType.Vec4]: { kind: 'f32', align: 16, size: 16 },
  // A matrix is an array of column vectors, each padded to its own 16-byte
  // alignment: `mat3x3<f32>` is three `vec3` columns in 48 bytes, not 36.
  [UniformType.Mat3]: { kind: 'f32', align: 16, size: 48 },
  [UniformType.Mat4]: { kind: 'f32', align: 16, size: 64 },
};

/** GLSL ES 3.00 spelling of every {@link UniformType}. @internal */
export const uniformTypeGlsl: Readonly<Record<UniformType, string>> = {
  [UniformType.Float]: 'float',
  [UniformType.Int]: 'int',
  [UniformType.Uint]: 'uint',
  [UniformType.Vec2]: 'vec2',
  [UniformType.Vec3]: 'vec3',
  [UniformType.Vec4]: 'vec4',
  [UniformType.Mat3]: 'mat3',
  [UniformType.Mat4]: 'mat4',
};

/** Components a caller addresses on a {@link UniformType}, padding excluded. @internal */
export const uniformTypeComponents: Readonly<Record<UniformType, number>> = {
  [UniformType.Float]: 1,
  [UniformType.Int]: 1,
  [UniformType.Uint]: 1,
  [UniformType.Vec2]: 2,
  [UniformType.Vec3]: 3,
  [UniformType.Vec4]: 4,
  [UniformType.Mat3]: 9,
  [UniformType.Mat4]: 16,
};

/** Whether `value` is one of the declared {@link UniformType} members. @internal */
export const isUniformType = (value: unknown): value is UniformType =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(uniformTypeInfo, value);
