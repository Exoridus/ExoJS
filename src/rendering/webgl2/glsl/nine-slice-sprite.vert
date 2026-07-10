#version 300 es
precision lowp float;
precision highp int;

// Per-instance attributes (divisor = 1). One entry per nine-slice quad.
// gl_VertexID 0..3 selects which corner of the quad this invocation computes.
layout(location = 0) in vec4 a_quadBounds;   // x0, y0, x1, y1 (local space)
layout(location = 1) in vec4 a_uvBounds;     // u0, v0, u1, v1 (normalised, flipY pre-applied)
layout(location = 2) in vec4 a_color;        // RGBA tint
layout(location = 3) in uint a_nodeIndex;    // row into the shared transform buffer

uniform mat3 u_projection;
uniform mat3 u_group;
uniform sampler2D u_transforms;              // shared per-frame transform buffer (3 texels/row)

out vec2 v_texcoord;
out vec4 v_color;

void main(void) {
    // gl_VertexID 0..3 → corner: 0=TL, 1=TR, 2=BL, 3=BR (TRIANGLE_STRIP order)
    int vid = gl_VertexID;
    int cornerX = vid & 1;
    int cornerY = (vid >> 1) & 1;

    float localX = (cornerX == 0) ? a_quadBounds.x : a_quadBounds.z;
    float localY = (cornerY == 0) ? a_quadBounds.y : a_quadBounds.w;

    int row = int(a_nodeIndex);
    vec4 m0 = texelFetch(u_transforms, ivec2(0, row), 0); // a, b, c, d
    vec4 m1 = texelFetch(u_transforms, ivec2(1, row), 0); // tx, ty, 0, 0

    float worldX = (m0.x * localX) + (m0.y * localY) + m1.x;
    float worldY = (m0.z * localX) + (m0.w * localY) + m1.y;

    gl_Position = vec4((u_projection * u_group * vec3(worldX, worldY, 1.0)).xy, 0.0, 1.0);

    float u = (cornerX == 0) ? a_uvBounds.x : a_uvBounds.z;
    float v = (cornerY == 0) ? a_uvBounds.y : a_uvBounds.w;
    v_texcoord = vec2(u, v);

    v_color = vec4(a_color.rgb * a_color.a, a_color.a);
}
