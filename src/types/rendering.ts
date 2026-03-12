export enum BlendModes {
    normal = 0,
    additive = 1,
    subtract = 2,
    multiply = 3,
    screen = 4,
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

// @eslint-ignore
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

