#version 300 es
precision highp float;
precision highp int;

// The finished seed field: `xy` is the index of the nearest blocking texel and
// `zw` that of the nearest open one.
uniform sampler2D uTexture;
// The mask the seeds came from. A seed's own coverage says where inside it the
// edge actually runs.
uniform sampler2D uMask;

out vec4 fragColor;

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
float reach(vec2 seed) {
    if (seed.x < 0.0) {
        return uniforms.uFar;
    }

    // Clamped: the mask accumulates additively, so two emitters over one texel
    // leave a coverage above one, and the offset below is a position inside a
    // texel rather than a quantity.
    float coverage = clamp(texelFetch(uMask, ivec2(seed), 0).a, 0.0, 1.0);

    // `seed` is an index; `seed + 0.5` is the centre `gl_FragCoord` measures in.
    return max(length(gl_FragCoord.xy - (seed + 0.5)) - abs(coverage - 0.5), 0.0) * uniforms.uScale;
}

void main() {
    vec4 seed = texelFetch(uTexture, ivec2(gl_FragCoord.xy), 0);
    // Out of the nearest surface in `r`, and in `g` that plus the depth into
    // the surface this texel is part of - one of the two is always zero, so
    // `g - r` is the depth, and the field reads as one grey ramp outside a
    // surface and green inside it.
    //
    // Stored as a fraction of the reach rather than in world units: it keeps
    // the whole field inside half-float's precise range whatever the camera
    // covers, and it is what makes the debug view a legible ramp instead of
    // white.
    float outward = clamp(reach(seed.xy) / uniforms.uFar, 0.0, 1.0);
    float inward = clamp(reach(seed.zw) / uniforms.uFar, 0.0, 1.0);

    fragColor = vec4(outward, outward + inward, outward, 1.0);
}
