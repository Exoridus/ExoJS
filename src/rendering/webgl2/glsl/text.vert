#version 300 es
precision highp float;

// Mirrors WebGpuTextRenderer's WGSL vertex stage exactly: a_position arrives in
// LOCAL space, and the world transform is read live from the per-node data
// texture (same texture the fragment stage reads style from) via texelFetch,
// keyed by a_nodeIndex — the same pattern Sprite/Mesh/NineSlice use for their
// shared transform buffer, just against Text's own private node-data texture.
layout(location = 0) in vec2  a_position;   // local-space quad corner
layout(location = 1) in vec2  a_texcoord;
layout(location = 2) in float a_nodeIndex;  // row into the per-node data texture (transform + style)

uniform mat3 u_projection;
uniform mat3 u_group;
uniform sampler2D u_nodeData;

flat out int  v_nodeIndex;
     out vec2 v_texcoord;
     out vec2 v_gradUV;

void main(void) {
    int ni = int(a_nodeIndex);

    // texel 0: (a, c, 0, tx) — mat3 column-major: col0 + translate.x
    // texel 1: (b, d, 0, ty) — mat3 column-major: col1 + translate.y
    // texel 9: (minX, minY, w, h) — text block bounds (local space, for gradient UV)
    vec4 t0 = texelFetch(u_nodeData, ivec2(0, ni), 0);
    vec4 t1 = texelFetch(u_nodeData, ivec2(1, ni), 0);
    vec4 t9 = texelFetch(u_nodeData, ivec2(9, ni), 0);

    mat3 xf = mat3(
        t0.x, t0.y, 0.0,
        t1.x, t1.y, 0.0,
        t0.w, t1.w, 1.0
    );

    gl_Position = vec4((u_projection * u_group * xf * vec3(a_position, 1.0)).xy, 0.0, 1.0);
    v_texcoord  = a_texcoord;
    v_nodeIndex = ni;

    vec2 bSize = t9.zw;
    v_gradUV = (bSize.x > 0.0 && bSize.y > 0.0)
        ? clamp((a_position - t9.xy) / bSize, 0.0, 1.0)
        : vec2(0.0);
}
