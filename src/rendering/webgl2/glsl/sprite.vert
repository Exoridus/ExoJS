#version 300 es
precision highp float;
precision highp int;

// Per-instance attributes (divisor = 1). Each Sprite contributes one entry
// to the per-instance buffer; gl_VertexID 0..3 selects which corner of the
// quad this invocation is computing.
layout(location = 0) in vec4 a_localBounds;     // left, top, right, bottom (local space)
layout(location = 3) in vec4 a_uvBounds;        // uMin, vMin, uMax, vMax (normalised, already flipY-swapped)
layout(location = 5) in uint a_textureSlot;
layout(location = 6) in uint a_nodeIndex;       // row into the shared transform buffer

uniform mat3 u_projection;
uniform mat3 u_group;
uniform vec4 u_viewport;                        // device-pixel viewport rect (x, y, width, height) for position snapping
uniform sampler2D u_transforms;                 // shared per-frame transform buffer (3 texels/row)

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

    // Fetch the world transform and tint for this instance from the shared
    // buffer, keyed by a_nodeIndex. Row layout: texel 0 = (a, b, c, d),
    // texel 1 = (tx, ty, 0, 0), texel 2 = tint (rgb in 0..1, a). The node tint
    // is the sprite's own tint (written at the transform-buffer upload
    // boundary), so reading it here unifies with the mesh path and removes the
    // redundant per-instance a_color stream.
    int row = int(a_nodeIndex);
    vec4 m0 = texelFetch(u_transforms, ivec2(0, row), 0); // a, b, c, d
    vec4 m1 = texelFetch(u_transforms, ivec2(1, row), 0); // tx, ty, 0, 0
    vec4 m2 = texelFetch(u_transforms, ivec2(2, row), 0); // tint (rgb 0..1, a)

    // world = M * (localX, localY, 1)
    float worldX = (m0.x * localX) + (m0.y * localY) + m1.x;
    float worldY = (m0.z * localX) + (m0.w * localY) + m1.y;

    vec2 clip = (u_projection * u_group * vec3(worldX, worldY, 1.0)).xy;

    // Render-only pixel snapping (m1.z: 0 = none, 1 = position, 2 = geometry —
    // both non-zero modes snap the origin). Snap the node ORIGIN's device-pixel
    // position and rigid-shift the whole primitive by the same delta. floor(x+0.5)
    // matches the CPU Math.round policy; GLSL round() is undefined at .5.
    // Grid alignment is independent of the y-axis convention because the staged
    // viewport rect is whole device pixels.
    if (m1.z != 0.0) {
        vec2 originClip = (u_projection * u_group * vec3(m1.x, m1.y, 1.0)).xy;
        vec2 originDevice = u_viewport.xy + (originClip * 0.5 + 0.5) * u_viewport.zw;
        clip += (floor(originDevice + 0.5) - originDevice) * 2.0 / max(u_viewport.zw, vec2(1.0));
    }

    gl_Position = vec4(clip, 0.0, 1.0);

    // UV: pick from the bounds rectangle. The CPU pre-swaps Y bounds when
    // the texture is flipY, so the shader doesn't have to know.
    float u = (cornerX == 0) ? a_uvBounds.x : a_uvBounds.z;
    float v = (cornerY == 0) ? a_uvBounds.y : a_uvBounds.w;
    v_texcoord = vec2(u, v);

    v_color = vec4(m2.rgb * m2.a, m2.a);
    v_textureSlot = a_textureSlot;
}
