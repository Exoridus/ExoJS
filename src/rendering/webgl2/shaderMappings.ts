import { ShaderPrimitives } from '#rendering/types';

export const webGl2PrimitiveComponentCountMapping: Record<number, number> = {
  [ShaderPrimitives.Float]: 1,
  [ShaderPrimitives.FloatVec2]: 2,
  [ShaderPrimitives.FloatVec3]: 3,
  [ShaderPrimitives.FloatVec4]: 4,

  [ShaderPrimitives.Int]: 1,
  [ShaderPrimitives.IntVec2]: 2,
  [ShaderPrimitives.IntVec3]: 3,
  [ShaderPrimitives.IntVec4]: 4,

  [ShaderPrimitives.UnsignedInt]: 1,
  [ShaderPrimitives.UnsignedIntVec2]: 2,
  [ShaderPrimitives.UnsignedIntVec3]: 3,
  [ShaderPrimitives.UnsignedIntVec4]: 4,

  [ShaderPrimitives.Bool]: 1,
  [ShaderPrimitives.BoolVec2]: 2,
  [ShaderPrimitives.BoolVec3]: 3,
  [ShaderPrimitives.BoolVec4]: 4,

  [ShaderPrimitives.FloatMat2]: 4,
  [ShaderPrimitives.FloatMat3]: 9,
  [ShaderPrimitives.FloatMat4]: 16,

  [ShaderPrimitives.Sampler2D]: 1,
};

export const webGl2PrimitiveArrayConstructors: Record<number, Float32ArrayConstructor | Int32ArrayConstructor | Uint8ArrayConstructor> = {
  [ShaderPrimitives.Float]: Float32Array,
  [ShaderPrimitives.FloatVec2]: Float32Array,
  [ShaderPrimitives.FloatVec3]: Float32Array,
  [ShaderPrimitives.FloatVec4]: Float32Array,

  [ShaderPrimitives.Int]: Int32Array,
  [ShaderPrimitives.IntVec2]: Int32Array,
  [ShaderPrimitives.IntVec3]: Int32Array,
  [ShaderPrimitives.IntVec4]: Int32Array,

  [ShaderPrimitives.UnsignedInt]: Int32Array,
  [ShaderPrimitives.UnsignedIntVec2]: Int32Array,
  [ShaderPrimitives.UnsignedIntVec3]: Int32Array,
  [ShaderPrimitives.UnsignedIntVec4]: Int32Array,

  [ShaderPrimitives.Bool]: Uint8Array,
  [ShaderPrimitives.BoolVec2]: Uint8Array,
  [ShaderPrimitives.BoolVec3]: Uint8Array,
  [ShaderPrimitives.BoolVec4]: Uint8Array,

  [ShaderPrimitives.FloatMat2]: Float32Array,
  [ShaderPrimitives.FloatMat3]: Float32Array,
  [ShaderPrimitives.FloatMat4]: Float32Array,

  [ShaderPrimitives.Sampler2D]: Uint8Array,
};
