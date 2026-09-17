#version 300 es
precision mediump float;

in vec2 v_local;
in vec4 v_tint;
flat in vec2 v_cone;
flat in float v_intensity;

out vec4 fragColor;

void main() {
    // The quad is the light's bounding square in radius-normalized space, so
    // distance is `length(v_local)` and everything past 1 is outside the light.
    float distance = length(v_local);
    float falloff = clamp(1.0 - distance, 0.0, 1.0);

    // A point light writes both cone cosines as -1, which no direction can
    // fail, so one expression serves both shapes without a branch.
    vec2 direction = distance > 0.0 ? v_local / distance : vec2(1.0, 0.0);
    float alignment = direction.x;
    float coneTerm = v_cone.x == v_cone.y ? step(v_cone.x, alignment) : smoothstep(v_cone.x, v_cone.y, alignment);

    fragColor = vec4(v_tint.rgb * (falloff * falloff * coneTerm * v_intensity), 1.0);
}
