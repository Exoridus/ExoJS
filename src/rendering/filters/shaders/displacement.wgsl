struct Uniforms {
    uScale: vec4<f32>,
    uOffset: vec4<f32>,
};

@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;
@group(0) @binding(3) var<uniform> uOrientation: f32;
@group(1) @binding(0) var<uniform> uniforms: Uniforms;
@group(1) @binding(1) var uMap: texture_2d<f32>;
@group(1) @binding(2) var uMapSampler: sampler;

@fragment
fn fragmentMain(@location(0) vUv: vec2<f32>) -> @location(0) vec4<f32> {
    // The map is an ordinary texture - its row 0 is its top on both backends -
    // while v runs through the effect domain either way up, so the map's own v
    // is vUv.y mirrored about the middle wherever the two disagree.
    let mapUv = vec2<f32>(vUv.x, 0.5 + (vUv.y - 0.5) * uOrientation) + uniforms.uOffset.xy;
    let displacement = textureSample(uMap, uMapSampler, mapUv).rg * 2.0 - 1.0;
    let uv = vUv + vec2<f32>(displacement.x * uniforms.uScale.x, displacement.y * uniforms.uScale.y * uOrientation);
    // Outside the effect domain there is nothing to pull in: clamp-to-edge
    // sampling would smear the border texel across the displaced band instead.
    let inside = step(0.0, uv.x) * step(0.0, uv.y) * step(uv.x, 1.0) * step(uv.y, 1.0);

    return textureSample(uTexture, uSampler, uv) * inside;
}
