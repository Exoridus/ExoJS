@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;

@fragment
fn fragmentMain(@location(0) vUv: vec2<f32>) -> @location(0) vec4<f32> {
    // Entry 0 carries the centre tap: weight in z, the entry count in w.
    let centre = uniforms.uTaps[0];
    // textureSampleLevel, not textureSample: the tap loop is bounded by a
    // uniform, but an explicit level needs no uniformity proof at all, and the
    // filter's input never has mip levels to choose between.
    var sum = textureSampleLevel(uTexture, uSampler, vUv, 0.0) * centre.z;
    let count = i32(centre.w);

    for (var tap = 1; tap < count; tap = tap + 1) {
        let entry = uniforms.uTaps[tap];
        let offset = entry.xy;

        sum = sum + (textureSampleLevel(uTexture, uSampler, vUv + offset, 0.0) + textureSampleLevel(uTexture, uSampler, vUv - offset, 0.0)) * entry.z;
    }

    return sum;
}
