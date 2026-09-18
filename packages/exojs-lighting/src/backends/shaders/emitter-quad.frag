#version 300 es
precision highp float;

in vec2 v_local;
in vec4 v_tint;
// Radiance at the emitter's centre, how far past its shape the radiance
// extends, half its emitting segment, and half a texel - all in radii.
flat in vec4 v_emit;

out vec4 fragColor;

void main() {
    // A capsule rather than the quad it is drawn as: an emitter is a source
    // with a size, and a square source would put corners into every shadow it
    // casts. A half-length of zero leaves the disc it was.
    vec2 toSegment = vec2(v_local.x - clamp(v_local.x, -v_emit.z, v_emit.z), v_local.y);
    float distance = length(toSegment);
    float texel = max(v_emit.w, 0.001);
    // Alpha is the SHAPE, and it is what the occluder mask takes: a ray ends
    // on it there. The radiance reaches a halo further out, because a ray that
    // stops short of the shape, or passes just beside it, reads its colour
    // from where it stopped - and outside the halo nothing reads it at all.
    // Linear in the distance, not smoothed: the mask's coverage is read back
    // as the sub-texel position of the edge, and only a linear ramp makes
    // that reading exact.
    float shape = clamp((1.0 + texel - distance) / (2.0 * texel), 0.0, 1.0);
    float glow = clamp((1.0 + v_emit.y + texel - distance) / (2.0 * texel), 0.0, 1.0);

    fragColor = vec4(v_tint.rgb * (v_emit.x * glow), shape);
}
