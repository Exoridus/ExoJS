#version 300 es
precision highp float;

in vec2 v_local;
in vec4 v_tint;
flat in vec4 v_emit;
// Outer and inner cone half-angles, and the angle of the axis the cone opens
// along, offset into `0..2pi`.
flat in vec4 v_cone;

out vec4 fragColor;

/** Rec. 709 luminance. The same weighting the reader divides by. */
float luminance(vec3 colour) {
    return dot(colour, vec3(0.2126, 0.7152, 0.0722));
}

void main() {
    // The same capsule the emitter's colour fills, halo included, so that
    // wherever a ray reads the colour it can read the cone as well.
    vec2 toSegment = vec2(v_local.x - clamp(v_local.x, -v_emit.z, v_emit.z), v_local.y);
    float distance = length(toSegment);

    if (distance > 1.0 + v_emit.y) {
        discard;
    }

    // The luminance this spot puts into the emission field at this texel,
    // computed from the same terms the emission pass uses so that the two
    // agree texel for texel. Everything is scaled by it and summed, which is
    // what lets the reader recover both a luminance-weighted mean cone and
    // the share of the emission that is subject to a cone at all.
    float texel = max(v_emit.w, 0.001);
    float glow = clamp((1.0 + v_emit.y + texel - distance) / (2.0 * texel), 0.0, 1.0);
    float weight = luminance(v_tint.rgb) * v_emit.x * glow;

    fragColor = vec4(v_cone.xyz * weight, weight);
}
