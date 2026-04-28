#version 300 es
precision lowp float;
precision lowp int;

// Per-instance attributes (one entry per particle, 24 bytes total).
layout(location = 0) in vec2 a_translation;     // particle position in system-local space
layout(location = 1) in vec2 a_scale;            // particle scale
layout(location = 2) in float a_rotation;        // particle rotation in degrees
layout(location = 3) in vec4 a_color;            // RGBA tint

uniform mat3 u_projection;
uniform mat3 u_systemTransform;
uniform vec4 u_localBounds;                      // left, top, right, bottom (system.vertices)
uniform vec4 u_uvBounds;                         // uMin, vMin, uMax, vMax (flipY-swapped)

out vec2 v_texcoord;
out vec4 v_color;

void main(void) {
    // Static index buffer is [0,1,2,0,2,3] (triangle-list), so gl_VertexID 0..3
    // maps to TL, TR, BR, BL via the same bit math the sprite renderer uses.
    int vid = gl_VertexID;
    int cornerX = ((vid + 1) >> 1) & 1;
    int cornerY = vid >> 1;

    float localX = (cornerX == 0) ? u_localBounds.x : u_localBounds.z;
    float localY = (cornerY == 0) ? u_localBounds.y : u_localBounds.w;

    // Per-particle scale + rotation.
    vec2 rotation = vec2(sin(radians(a_rotation)), cos(radians(a_rotation)));
    vec2 transformed = vec2(
        (localX * (a_scale.x * rotation.y)) + (localY * (a_scale.y * rotation.x)),
        (localX * (a_scale.x * -rotation.x)) + (localY * (a_scale.y * rotation.y))
    );

    vec3 worldPos = vec3(transformed + a_translation, 1.0);

    gl_Position = vec4((u_projection * u_systemTransform * worldPos).xy, 0.0, 1.0);

    float u = (cornerX == 0) ? u_uvBounds.x : u_uvBounds.z;
    float v = (cornerY == 0) ? u_uvBounds.y : u_uvBounds.w;
    v_texcoord = vec2(u, v);

    v_color = vec4(a_color.rgb * a_color.a, a_color.a);
}
