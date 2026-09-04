struct Uniforms {
    uShift: vec4<f32>,
    uColor: vec4<f32>,
};

@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;
@group(1) @binding(0) var<uniform> uniforms: Uniforms;

@fragment
fn fragmentMain(@location(0) vUv: vec2<f32>) -> @location(0) vec4<f32> {
    let uv = vUv - uniforms.uShift.xy;
    // Outside the source there is nothing to cast a shadow: clamp-to-edge
    // sampling would smear the border texel across the shifted band instead.
    let inside = step(0.0, uv.x) * step(0.0, uv.y) * step(uv.x, 1.0) * step(uv.y, 1.0);
    let alpha = textureSample(uTexture, uSampler, uv).a * uniforms.uColor.a * inside;

    return vec4<f32>(uniforms.uColor.rgb * alpha, alpha);
}
