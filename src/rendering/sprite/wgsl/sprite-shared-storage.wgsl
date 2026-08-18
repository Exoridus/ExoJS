struct ProjectionUniforms {
    matrix: mat4x4<f32>,
    group: mat4x4<f32>,
    viewport: vec4<f32>,
};

struct TransformSlot {
    m0: vec4<f32>,
    m1: vec4<f32>,
};

@group(0) @binding(0) var<uniform> projection: ProjectionUniforms;
@group(0) @binding(1) var<storage, read> transforms: array<TransformSlot>;
// Packed rgba8 tint (r|g|b|a, 8 bits each, unpacked via unpack4x8unorm), one
// u32 per instance.
@group(0) @binding(2) var<storage, read> tints: array<u32>;
