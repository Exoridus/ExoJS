struct Uniforms {
    matrix: mat4x4<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;

@vertex
fn vertexMain(@location(0) position: vec2<f32>) -> @builtin(position) vec4<f32> {
    return u.matrix * vec4<f32>(position, 0.0, 1.0);
}

@fragment
fn fragmentMain() -> @location(0) vec4<f32> {
    // Color writes are masked off (writeMask 0); only the stencil aspect is touched.
    return vec4<f32>(0.0);
}
