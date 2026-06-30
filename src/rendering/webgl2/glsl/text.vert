#version 300 es
precision highp float;

// a_position arrives already in WORLD space: the renderer applies each node's
// world transform on the CPU while building the vertex buffer. This deliberately
// avoids a vertex-stage texelFetch of the per-node data texture — on ANGLE/D3D11
// a vertex texture fetch of the RGBA32F data texture returns garbage (RGB read as
// 0) whenever an RGBA8 atlas is also bound, which collapsed all text glyphs to a
// point and made colour/MSDF bitmap text invisible. The fragment still reads the
// per-node style from the data texture (a fragment texture fetch is unaffected).
layout(location = 0) in vec2  a_position;   // world-space quad corner
layout(location = 1) in vec2  a_texcoord;
layout(location = 2) in float a_nodeIndex;  // row into the per-node data texture (style lookup)
layout(location = 3) in vec2  a_gradUV;     // normalised gradient UV (CPU-computed)

uniform mat3 u_projection;

flat out int  v_nodeIndex;
     out vec2 v_texcoord;
     out vec2 v_gradUV;

void main(void) {
    gl_Position = vec4((u_projection * vec3(a_position, 1.0)).xy, 0.0, 1.0);
    v_texcoord  = a_texcoord;
    v_nodeIndex = int(a_nodeIndex);
    v_gradUV    = a_gradUV;
}
