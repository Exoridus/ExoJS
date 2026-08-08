#version 300 es
precision highp float;

// Per-vertex attributes (two vertices per particle, 20 bytes each).
layout(location = 0) in vec2 a_position;         // strip vertex in system-local space
layout(location = 1) in vec2 a_texcoord;         // u along the strip, v across it
layout(location = 2) in vec4 a_color;            // RGBA tint of the particle this pair came from

uniform mat3 u_projection;
uniform mat3 u_systemTransform;

out vec2 v_texcoord;
out vec4 v_color;

void main(void) {
    // The strip is already expanded on the CPU — each vertex carries its final
    // system-local position, so there is no per-particle transform to rebuild here.
    gl_Position = vec4((u_projection * u_systemTransform * vec3(a_position, 1.0)).xy, 0.0, 1.0);

    v_texcoord = a_texcoord;
    v_color = vec4(a_color.rgb * a_color.a, a_color.a);
}
