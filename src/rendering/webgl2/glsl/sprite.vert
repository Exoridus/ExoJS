#version 300 es
precision lowp float;
precision lowp int;

// Per-instance attributes (divisor = 1). Each Sprite contributes one entry
// to the per-instance buffer; gl_VertexID 0..3 selects which corner of the
// quad this invocation is computing.
layout(location = 0) in vec4 a_localBounds;     // left, top, right, bottom (local space)
layout(location = 1) in vec3 a_transformAB;     // a, b, x — first row of 2D affine
layout(location = 2) in vec3 a_transformCD;     // c, d, y — second row
layout(location = 3) in vec4 a_uvBounds;        // uMin, vMin, uMax, vMax (normalised, already flipY-swapped)
layout(location = 4) in vec4 a_color;           // RGBA tint
layout(location = 5) in uint a_textureSlot;

uniform mat3 u_projection;

out vec2 v_texcoord;
out vec4 v_color;
flat out uint v_textureSlot;

void main(void) {
    // gl_VertexID 0..3 → corner: 0=TL, 1=TR, 2=BL, 3=BR (TRIANGLE_STRIP order)
    int vid = gl_VertexID;
    int cornerX = vid & 1;
    int cornerY = (vid >> 1) & 1;

    // Local-space corner: pick from the bounds rectangle.
    float localX = (cornerX == 0) ? a_localBounds.x : a_localBounds.z;
    float localY = (cornerY == 0) ? a_localBounds.y : a_localBounds.w;

    // Apply the per-instance affine transform: world = M * (localX, localY, 1)
    float worldX = (a_transformAB.x * localX) + (a_transformAB.y * localY) + a_transformAB.z;
    float worldY = (a_transformCD.x * localX) + (a_transformCD.y * localY) + a_transformCD.z;

    gl_Position = vec4((u_projection * vec3(worldX, worldY, 1.0)).xy, 0.0, 1.0);

    // UV: pick from the bounds rectangle. The CPU pre-swaps Y bounds when
    // the texture is flipY, so the shader doesn't have to know.
    float u = (cornerX == 0) ? a_uvBounds.x : a_uvBounds.z;
    float v = (cornerY == 0) ? a_uvBounds.y : a_uvBounds.w;
    v_texcoord = vec2(u, v);

    v_color = vec4(a_color.rgb * a_color.a, a_color.a);
    v_textureSlot = a_textureSlot;
}
