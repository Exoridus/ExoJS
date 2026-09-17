#version 300 es
precision highp float;

in vec2 v_local;
in vec4 v_tint;
// Radiance at the emitter's centre, how much of its radius fades, and half its
// emitting segment in the same radii.
flat in vec4 v_emit;

out vec4 fragColor;

void main() {
    // A capsule rather than the quad it is drawn as: an emitter is a source
    // with a size, and a square source would put corners into every shadow it
    // casts. A half-length of zero leaves the disc it was.
    vec2 toSegment = vec2(v_local.x - clamp(v_local.x, -v_emit.z, v_emit.z), v_local.y);
    float edge = smoothstep(1.0, 1.0 - max(v_emit.y, 0.001), length(toSegment));

    fragColor = vec4(v_tint.rgb * (v_emit.x * edge), 1.0);
}
