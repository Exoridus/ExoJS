#version 300 es
precision highp float;
precision highp int;

// Per-instance attributes (one entry per particle, 40 bytes total).
layout(location = 0) in vec2 a_position;         // particle position in system-local space
layout(location = 1) in vec2 a_scale;            // particle scale
layout(location = 2) in float a_rotation;        // particle rotation in degrees
layout(location = 3) in vec4 a_color;            // RGBA tint
layout(location = 4) in vec2 a_uvMin;            // top-left UV (u, v) — pre-resolved per instance
layout(location = 5) in vec2 a_uvMax;            // bottom-right UV (u, v) — pre-resolved per instance

// Per-vertex attributes from the mode's mesh geometry, normalised to (x, y)
// and (u, v) so this shader is the same for every mesh.
layout(location = 6) in vec2 a_meshPosition;
layout(location = 7) in vec2 a_meshTexcoord;

uniform mat3 u_projection;
uniform mat3 u_systemTransform;

out vec2 v_texcoord;
out vec4 v_color;

void main(void) {
    // Per-particle scale + rotation, identical to the quad's.
    vec2 rotation = vec2(sin(radians(a_rotation)), cos(radians(a_rotation)));
    vec2 transformed = vec2(
        (a_meshPosition.x * (a_scale.x * rotation.y)) + (a_meshPosition.y * (a_scale.y * rotation.x)),
        (a_meshPosition.x * (a_scale.x * -rotation.x)) + (a_meshPosition.y * (a_scale.y * rotation.y))
    );

    vec3 worldPos = vec3(transformed + a_position, 1.0);

    gl_Position = vec4((u_projection * u_systemTransform * worldPos).xy, 0.0, 1.0);

    // The mesh's own UVs address the particle's frame rather than the whole
    // texture, so a mesh particle still selects an atlas frame.
    v_texcoord = mix(a_uvMin, a_uvMax, a_meshTexcoord);

    v_color = vec4(a_color.rgb * a_color.a, a_color.a);
}
