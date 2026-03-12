import { ShaderPrimitives } from 'types/rendering';

export const primitiveByteSizeMapping: Record<number, number> = {
    [ShaderPrimitives.FLOAT]: 1,
    [ShaderPrimitives.FLOAT_VEC2]: 2,
    [ShaderPrimitives.FLOAT_VEC3]: 3,
    [ShaderPrimitives.FLOAT_VEC4]: 4,

    [ShaderPrimitives.INT]: 1,
    [ShaderPrimitives.INT_VEC2]: 2,
    [ShaderPrimitives.INT_VEC3]: 3,
    [ShaderPrimitives.INT_VEC4]: 4,

    [ShaderPrimitives.BOOL]: 1,
    [ShaderPrimitives.BOOL_VEC2]: 2,
    [ShaderPrimitives.BOOL_VEC3]: 3,
    [ShaderPrimitives.BOOL_VEC4]: 4,

    [ShaderPrimitives.FLOAT_MAT2]: 4,
    [ShaderPrimitives.FLOAT_MAT3]: 9,
    [ShaderPrimitives.FLOAT_MAT4]: 16,

    [ShaderPrimitives.SAMPLER_2D]: 1,
};

export const primitiveArrayConstructors: Record<number, Float32ArrayConstructor | Int32ArrayConstructor | Uint8ArrayConstructor> = {
    [ShaderPrimitives.FLOAT]: Float32Array,
    [ShaderPrimitives.FLOAT_VEC2]: Float32Array,
    [ShaderPrimitives.FLOAT_VEC3]: Float32Array,
    [ShaderPrimitives.FLOAT_VEC4]: Float32Array,

    [ShaderPrimitives.INT]: Int32Array,
    [ShaderPrimitives.INT_VEC2]: Int32Array,
    [ShaderPrimitives.INT_VEC3]: Int32Array,
    [ShaderPrimitives.INT_VEC4]: Int32Array,

    [ShaderPrimitives.BOOL]: Uint8Array,
    [ShaderPrimitives.BOOL_VEC2]: Uint8Array,
    [ShaderPrimitives.BOOL_VEC3]: Uint8Array,
    [ShaderPrimitives.BOOL_VEC4]: Uint8Array,

    [ShaderPrimitives.FLOAT_MAT2]: Float32Array,
    [ShaderPrimitives.FLOAT_MAT3]: Float32Array,
    [ShaderPrimitives.FLOAT_MAT4]: Float32Array,

    [ShaderPrimitives.SAMPLER_2D]: Uint8Array,
};

export const primitiveTypeNames: Record<number, string> = {
    [ShaderPrimitives.FLOAT]: 'FLOAT',
    [ShaderPrimitives.FLOAT_VEC2]: 'FLOAT_VEC2',
    [ShaderPrimitives.FLOAT_VEC3]: 'FLOAT_VEC3',
    [ShaderPrimitives.FLOAT_VEC4]: 'FLOAT_VEC4',

    [ShaderPrimitives.INT]: 'INT',
    [ShaderPrimitives.INT_VEC2]: 'INT_VEC2',
    [ShaderPrimitives.INT_VEC3]: 'INT_VEC3',
    [ShaderPrimitives.INT_VEC4]: 'INT_VEC4',

    [ShaderPrimitives.BOOL]: 'BOOL',
    [ShaderPrimitives.BOOL_VEC2]: 'BOOL_VEC2',
    [ShaderPrimitives.BOOL_VEC3]: 'BOOL_VEC3',
    [ShaderPrimitives.BOOL_VEC4]: 'BOOL_VEC4',

    [ShaderPrimitives.FLOAT_MAT2]: 'FLOAT_MAT2',
    [ShaderPrimitives.FLOAT_MAT3]: 'FLOAT_MAT3',
    [ShaderPrimitives.FLOAT_MAT4]: 'FLOAT_MAT4',

    [ShaderPrimitives.SAMPLER_2D]: 'SAMPLER_2D',
};
