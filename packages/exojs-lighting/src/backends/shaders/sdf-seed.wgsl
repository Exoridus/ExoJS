// The occluder mask. Alpha is coverage: a texel at or above the threshold
// blocks, everything else is open.
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;

/** Coverage at or above which a mask texel blocks. */
const SEEDED: f32 = 0.5;
/** Seed coordinate that names no texel. */
const NONE: f32 = -1.0;

@fragment
fn fragmentMain(@builtin(position) position: vec4<f32>, @location(0) vUv: vec2<f32>) -> @location(0) vec4<f32> {
    // `position.xy` is the destination texel's own centre on both backends - a
    // render target's row 0 is the row the fragment at 0.5 writes either way -
    // so its floor is the texel's INDEX. The index rather than the centre is
    // what is stored: it is a whole number, which the seed format holds
    // exactly across the field, and it is also what indexes the mask again
    // when the resolve reads back where inside the texel the edge runs.
    //
    // Two seed classes in one field: `xy` names the nearest BLOCKING texel and
    // `zw` the nearest OPEN one. Every texel is a seed of exactly one class -
    // itself - so the flood that follows resolves the distance out of a surface
    // and the depth into one in the same rounds.
    let index = floor(position.xy);

    if (textureSampleLevel(uTexture, uSampler, vUv, 0.0).a >= SEEDED) {
        return vec4<f32>(index, NONE, NONE);
    }

    return vec4<f32>(NONE, NONE, index);
}
