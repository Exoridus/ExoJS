struct Uniforms {
    uRow0: vec4<f32>,
    uRow1: vec4<f32>,
    uRow2: vec4<f32>,
    uRow3: vec4<f32>,
    uBias: vec4<f32>,
};

@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;
@group(1) @binding(0) var<uniform> uniforms: Uniforms;

@fragment
fn fragmentMain(@location(0) vUv: vec2<f32>) -> @location(0) vec4<f32> {
    let premultiplied = textureSample(uTexture, uSampler, vUv);
    let alpha = premultiplied.a;
    let straightRgb = select(vec3<f32>(0.0), premultiplied.rgb / max(alpha, 1e-5), alpha > 0.0);
    let straight = vec4<f32>(straightRgb, alpha);
    let transformed = vec4<f32>(
        dot(uniforms.uRow0, straight),
        dot(uniforms.uRow1, straight),
        dot(uniforms.uRow2, straight),
        dot(uniforms.uRow3, straight),
    ) + uniforms.uBias;
    let graded = clamp(transformed, vec4<f32>(0.0), vec4<f32>(1.0));

    return vec4<f32>(graded.rgb * graded.a, graded.a);
}
