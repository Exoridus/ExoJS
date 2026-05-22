#version 300 es
precision highp float;

layout(location = 0) in vec2  a_position;
layout(location = 1) in vec2  a_texcoord;
layout(location = 2) in float a_nodeIndex;

uniform mat3 u_projection;
uniform sampler2D u_nodeData;

flat out int  v_nodeIndex;
     out vec2 v_texcoord;
     out vec2 v_gradUV;

void main(void) {
    int ni = int(a_nodeIndex);

    // texel 0: (a, c, 0, tx)   texel 1: (b, d, 0, ty)
    vec4 t0 = texelFetch(u_nodeData, ivec2(0, ni), 0);
    vec4 t1 = texelFetch(u_nodeData, ivec2(1, ni), 0);

    // Reconstruct column-major mat3 from stored components
    mat3 xf = mat3(
        t0.x, t0.y, 0.0,   // col 0: (a, c, 0)
        t1.x, t1.y, 0.0,   // col 1: (b, d, 0)
        t0.w, t1.w, 1.0    // col 2: (tx, ty, 1)
    );

    gl_Position = vec4((u_projection * xf * vec3(a_position, 1.0)).xy, 0.0, 1.0);
    v_texcoord  = a_texcoord;
    v_nodeIndex = ni;

    // texel 9: (minX, minY, width, height) — text block bounds in local space.
    // Normalise a_position into [0,1] so fragment shaders can interpolate
    // gradients across the whole block rather than individual atlas UVs.
    vec4 tBounds = texelFetch(u_nodeData, ivec2(9, ni), 0);
    vec2 bSize   = tBounds.zw;
    v_gradUV = (bSize.x > 0.0 && bSize.y > 0.0)
        ? clamp((a_position - tBounds.xy) / bSize, 0.0, 1.0)
        : vec2(0.0);
}
