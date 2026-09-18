// The finished seed field: `xy` is the nearest blocking texel's coordinate and
// `zw` the nearest open one's.
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;
// The mask the seeds came from. A seed's own coverage says where inside it the
// edge actually runs.
@group(1) @binding(1) var uMask: texture_2d<f32>;
@group(1) @binding(2) var uMaskSampler: sampler;

/**
 * Distance from this texel to the edge of the seed's surface, in world units,
 * or the far reach where there is no seed.
 *
 * Measured to the seed's EDGE rather than its centre: a texel covered by half
 * has the edge through its middle, one covered fully has it at its border, and
 * the coverage the mask holds is that offset. Without it the field is exact
 * only to the texel grid, and a ray narrower than a texel - every ray near the
 * start of a coarse cascade - reads a surface's outline as a staircase.
 */
fn reach(here: vec2<f32>, seed: vec2<f32>) -> f32 {
    if (seed.x < 0.0) {
        return uniforms.uFar;
    }

    let coverage = textureLoad(uMask, vec2<i32>(seed), 0).a;

    return max(length(here - seed) - abs(coverage - 0.5), 0.0) * uniforms.uScale;
}

@fragment
fn fragmentMain(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    let seed = textureLoad(uTexture, vec2<i32>(position.xy), 0);
    // Out of the nearest surface in `r`, and in `g` that plus the depth into
    // the surface this texel is part of - one of the two is always zero, so
    // `g - r` is the depth, and the field reads as one grey ramp outside a
    // surface and green inside it.
    //
    // Stored as a fraction of the reach rather than in world units: it keeps
    // the whole field inside half-float's precise range whatever the camera
    // covers, and it is what makes the debug view a legible ramp instead of
    // white.
    let outward = clamp(reach(position.xy, seed.xy) / uniforms.uFar, 0.0, 1.0);
    let inward = clamp(reach(position.xy, seed.zw) / uniforms.uFar, 0.0, 1.0);

    return vec4<f32>(outward, outward + inward, outward, 1.0);
}
