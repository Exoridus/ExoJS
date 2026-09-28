#version 300 es
precision highp float;

// Per-vertex attributes (two vertices per recorded trail position, 20 bytes each).
layout(location = 0) in vec2 a_position;         // strip vertex in system-local space
layout(location = 1) in vec2 a_texcoord;         // u along the trail, v across it
layout(location = 2) in vec4 a_color;            // particle tint, alpha already faded towards the tail

uniform mat3 u_projection;
uniform mat3 u_systemTransform;

out vec2 v_texcoord;
out vec4 v_color;

void main(void) {
    // Every trail is expanded on the CPU from the particle's recorded positions,
    // so each vertex carries its final system-local position and there is no
    // per-particle transform to rebuild here.
    gl_Position = vec4((u_projection * u_systemTransform * vec3(a_position, 1.0)).xy, 0.0, 1.0);

    v_texcoord = a_texcoord;

    // a_color.rgb is the authored sRGB tint byte-for-byte, not yet decoded;
    // decode it to linear before it is premultiplied and interpolated,
    // gated on colorPipelineEnabled (see colorShaderSources.ts).
    vec3 linearTint = colorPipelineEnabled ? srgbToLinear(a_color.rgb) : a_color.rgb;
    v_color = vec4(linearTint * a_color.a, a_color.a);
}
