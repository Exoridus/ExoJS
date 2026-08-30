struct ProjectionUniforms {
    matrix: mat4x4<f32>,
    group: mat4x4<f32>,
    viewport: vec4<f32>,        // device-pixel snap rect (x, y, width, height)
    premultiplyMask: u32,       // bit i = base texture i samples unpremultiplied
};

struct TransformSlot {
    m0: vec4<f32>,
    m1: vec4<f32>,
};

// One slot's static quad record: the drawable's own local bounds and the
// frame's UV, with flipY already resolved by the CPU packer.
struct SlotQuad {
    bounds: vec4<f32>,
    uv: vec4<f32>,
};

@group(0) @binding(0)
var<uniform> projection: ProjectionUniforms;
@group(0) @binding(1)
var<storage, read> transforms: array<TransformSlot>;
@group(0) @binding(2)
var<storage, read> tints: array<u32>;
@group(0) @binding(3)
var<storage, read> quads: array<SlotQuad>;
// The draw order, as slot numbers. Instance i draws slot order[i].
@group(0) @binding(4)
var<storage, read> order: array<u32>;
