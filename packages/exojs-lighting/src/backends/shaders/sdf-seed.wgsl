// The occluder mask. Alpha is coverage: a texel at or above the threshold is
// where the field's distance is zero.
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;

/** Coverage at or above which a mask texel seeds the field. */
const SEEDED: f32 = 0.5;

@fragment
fn fragmentMain(@builtin(position) position: vec4<f32>, @location(0) vUv: vec2<f32>) -> @location(0) vec4<f32> {
    // `position.xy` is the destination texel's own centre on both backends - a
    // render target's row 0 is the row the fragment at 0.5 writes either way -
    // so a seed can be stored as a texel coordinate and read back as one.
    if (textureSampleLevel(uTexture, uSampler, vUv, 0.0).a >= SEEDED) {
        return vec4<f32>(position.xy, 1.0, 1.0);
    }

    return vec4<f32>(0.0, 0.0, 0.0, 1.0);
}
