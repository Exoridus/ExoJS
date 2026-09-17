#version 300 es
precision highp float;

in vec2 v_local;
in vec4 v_tint;
flat in vec4 v_emit;
// Outer and inner cone cosines, and the axis the cone opens along.
flat in vec4 v_cone;

out vec4 fragColor;

void main() {
    // The same capsule the emitter's colour fills, halo included, so that
    // wherever a ray reads the colour it can read the cone as well. Written
    // whole rather than blended: a cone is a description, not a quantity.
    vec2 toSegment = vec2(v_local.x - clamp(v_local.x, -v_emit.z, v_emit.z), v_local.y);

    if (length(toSegment) > 1.0 + v_emit.y) {
        discard;
    }

    fragColor = v_cone;
}
