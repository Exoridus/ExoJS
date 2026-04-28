export enum BlendModes {
    Normal = 0,
    Additive = 1,
    Subtract = 2,
    Multiply = 3,
    Screen = 4,
}

export enum ScaleModes {
    Nearest = 0x2600,
    Linear = 0x2601,
    NearestMipmapNearest = 0x2700,
    LinearMipmapNearest = 0x2701,
    NearestMipmapLinear = 0x2702,
    LinearMipmapLinear = 0x2703,
}

export enum WrapModes {
    Repeat = 0x2901,
    ClampToEdge = 0x812F,
    MirroredRepeat = 0x8370,
}

export enum RenderingPrimitives {
    Points = 0x0000,
    Lines = 0x0001,
    LineLoop = 0x0002,
    LineStrip = 0x0003,
    Triangles = 0x0004,
    TriangleStrip = 0x0005,
    TriangleFan = 0x0006,
}

export enum BufferTypes {
    ArrayBuffer = 0x8892,
    ElementArrayBuffer = 0x8893,
    CopyReadBuffer = 0x8F36,
    CopyWriteBuffer = 0x8F37,
    TransformFeedbackBuffer = 0x8C8E,
    UniformBuffer = 0x8A11,
    PixelPackBuffer = 0x88EB,
    PixelUnpackBuffer = 0x88EC,
}

export enum BufferUsage {
    StaticDraw = 0x88E4,
    StaticRead = 0x88E5,
    StaticCopy = 0x88E6,
    DynamicDraw = 0x88E8,
    DynamicRead = 0x88E9,
    DynamicCopy = 0x88EA,
    StreamDraw = 0x88E0,
    StreamRead = 0x88E1,
    StreamCopy = 0x88E2,
}

// @eslint-ignore
export enum ShaderPrimitives {
    Int = 0x1404,
    IntVec2 = 0x8B53,
    IntVec3 = 0x8B54,
    IntVec4 = 0x8B55,

    UnsignedInt = 0x1405,
    UnsignedIntVec2 = 0x8DC6,
    UnsignedIntVec3 = 0x8DC7,
    UnsignedIntVec4 = 0x8DC8,

    Float = 0x1406,
    FloatVec2 = 0x8B50,
    FloatVec3 = 0x8B51,
    FloatVec4 = 0x8B52,

    Bool = 0x8B56,
    BoolVec2 = 0x8B57,
    BoolVec3 = 0x8B58,
    BoolVec4 = 0x8B59,

    FloatMat2 = 0x8B5A,
    FloatMat3 = 0x8B5B,
    FloatMat4 = 0x8B5C,

    Sampler2D = 0x8B5E,
}

