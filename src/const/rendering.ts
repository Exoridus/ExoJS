import TypedArray = NodeJS.TypedArray;

export enum BlendModes {
    NORMAL = 0,
    ADDITIVE = 1,
    SUBTRACT = 2,
    MULTIPLY = 3,
    SCREEN = 4,
}

export enum ScaleModes {
    NEAREST = 0x2600,
    LINEAR = 0x2601,
    NEAREST_MIPMAP_NEAREST = 0x2700,
    LINEAR_MIPMAP_NEAREST = 0x2701,
    NEAREST_MIPMAP_LINEAR = 0x2702,
    LINEAR_MIPMAP_LINEAR = 0x2703,
}

export enum WrapModes {
    REPEAT = 0x2901,
    CLAMP_TO_EDGE = 0x812F,
    MIRRORED_REPEAT = 0x8370,
}

export enum RenderingPrimitives {
    POINTS = 0x0000,
    LINES = 0x0001,
    LINE_LOOP = 0x0002,
    LINE_STRIP = 0x0003,
    TRIANGLES = 0x0004,
    TRIANGLE_STRIP = 0x0005,
    TRIANGLE_FAN = 0x0006,
}

export enum BufferTypes {
    ARRAY_BUFFER = 0x8892,
    ELEMENT_ARRAY_BUFFER = 0x8893,
    COPY_READ_BUFFER = 0x8F36,
    COPY_WRITE_BUFFER = 0x8F37,
    TRANSFORM_FEEDBACK_BUFFER = 0x8C8E,
    UNIFORM_BUFFER = 0x8A11,
    PIXEL_PACK_BUFFER = 0x88EB,
    PIXEL_UNPACK_BUFFER = 0x88EC,
}

export enum BufferUsage {
    STATIC_DRAW = 0x88E4,
    STATIC_READ = 0x88E5,
    STATIC_COPY = 0x88E6,
    DYNAMIC_DRAW = 0x88E8,
    DYNAMIC_READ = 0x88E9,
    DYNAMIC_COPY = 0x88EA,
    STREAM_DRAW = 0x88E0,
    STREAM_READ = 0x88E1,
    STREAM_COPY = 0x88E2,
}

export enum ShaderPrimitives {
    INT = 0x1404,
    INT_VEC2 = 0x8B53,
    INT_VEC3 = 0x8B54,
    INT_VEC4 = 0x8B55,

    FLOAT = 0x1406,
    FLOAT_VEC2 = 0x8B50,
    FLOAT_VEC3 = 0x8B51,
    FLOAT_VEC4 = 0x8B52,

    BOOL = 0x8B56,
    BOOL_VEC2 = 0x8B57,
    BOOL_VEC3 = 0x8B58,
    BOOL_VEC4 = 0x8B59,

    FLOAT_MAT2 = 0x8B5A,
    FLOAT_MAT3 = 0x8B5B,
    FLOAT_MAT4 = 0x8B5C,

    SAMPLER_2D = 0x8B5E,
}

export const primitiveByteSizeMapping: { [key: number]: number } = {
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

export const PrimitiveArrayConstructors: { [key: number]: Float32ArrayConstructor | Int32ArrayConstructor | Uint8ArrayConstructor } = {
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

export type PrimitiveUploadFunction = (gl: WebGL2RenderingContext, location: WebGLUniformLocation, value: TypedArray) => void;

export const PrimitiveUploadFunctions: { [key: number]: PrimitiveUploadFunction } = {
    [ShaderPrimitives.FLOAT]: (gl: WebGL2RenderingContext, location: WebGLUniformLocation, value: TypedArray) => gl.uniform1f(location, value[0]),
    [ShaderPrimitives.FLOAT_VEC2]: (gl: WebGL2RenderingContext, location: WebGLUniformLocation, value: TypedArray) => gl.uniform2fv(location, value),
    [ShaderPrimitives.FLOAT_VEC3]: (gl: WebGL2RenderingContext, location: WebGLUniformLocation, value: TypedArray) => gl.uniform3fv(location, value),
    [ShaderPrimitives.FLOAT_VEC4]: (gl: WebGL2RenderingContext, location: WebGLUniformLocation, value: TypedArray) => gl.uniform4fv(location, value),

    [ShaderPrimitives.INT]: (gl: WebGL2RenderingContext, location: WebGLUniformLocation, value: TypedArray) => gl.uniform1i(location, value[0]),
    [ShaderPrimitives.INT_VEC2]: (gl: WebGL2RenderingContext, location: WebGLUniformLocation, value: TypedArray) => gl.uniform2iv(location, value),
    [ShaderPrimitives.INT_VEC3]: (gl: WebGL2RenderingContext, location: WebGLUniformLocation, value: TypedArray) => gl.uniform3iv(location, value),
    [ShaderPrimitives.INT_VEC4]: (gl: WebGL2RenderingContext, location: WebGLUniformLocation, value: TypedArray) => gl.uniform4iv(location, value),

    [ShaderPrimitives.BOOL]: (gl: WebGL2RenderingContext, location: WebGLUniformLocation, value: TypedArray) => gl.uniform1i(location, value[0]),
    [ShaderPrimitives.BOOL_VEC2]: (gl: WebGL2RenderingContext, location: WebGLUniformLocation, value: TypedArray) => gl.uniform2iv(location, value),
    [ShaderPrimitives.BOOL_VEC3]: (gl: WebGL2RenderingContext, location: WebGLUniformLocation, value: TypedArray) => gl.uniform3iv(location, value),
    [ShaderPrimitives.BOOL_VEC4]: (gl: WebGL2RenderingContext, location: WebGLUniformLocation, value: TypedArray) => gl.uniform4iv(location, value),

    [ShaderPrimitives.FLOAT_MAT2]: (gl: WebGL2RenderingContext, location: WebGLUniformLocation, value: TypedArray) => gl.uniformMatrix2fv(location, false, value),
    [ShaderPrimitives.FLOAT_MAT3]: (gl: WebGL2RenderingContext, location: WebGLUniformLocation, value: TypedArray) => gl.uniformMatrix3fv(location, false, value),
    [ShaderPrimitives.FLOAT_MAT4]: (gl: WebGL2RenderingContext, location: WebGLUniformLocation, value: TypedArray) => gl.uniformMatrix4fv(location, false, value),

    [ShaderPrimitives.SAMPLER_2D]: (gl: WebGL2RenderingContext, location: WebGLUniformLocation, value: TypedArray) => gl.uniform1i(location, value[0]),
};

export const PrimitiveTypeNames: { [key: number]: string } = {
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