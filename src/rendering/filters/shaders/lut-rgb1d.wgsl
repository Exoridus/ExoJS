@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;
@group(1) @binding(1) var uLut: texture_2d<f32>;

@fragment
fn fragmentMain(@location(0) vUv: vec2<f32>) -> @location(0) vec4<f32> {
    let src = textureSample(uTexture, uSampler, vUv);
    let n = f32(textureDimensions(uLut).x);
    let coord = clamp(src.rgb, vec3<f32>(0.0), vec3<f32>(1.0)) * ((n - 1.0) / n) + 0.5 / n;
    let r = textureSample(uLut, uSampler, vec2<f32>(coord.r, 0.5)).r;
    let g = textureSample(uLut, uSampler, vec2<f32>(coord.g, 0.5)).g;
    let b = textureSample(uLut, uSampler, vec2<f32>(coord.b, 0.5)).b;
    return vec4<f32>(r, g, b, src.a);
}
