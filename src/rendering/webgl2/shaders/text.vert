#version 300 es
precision highp float;

// Mirrors WebGpuTextRenderer's WGSL vertex stage exactly: a_position arrives in
// LOCAL space, and the world transform is read live from the per-node data
// texture (same texture the fragment stage reads style from) via texelFetch,
// keyed by the node-index portion of a_packedNodeSlot — the same pattern
// Sprite/Mesh/NineSlice use for their
// shared transform buffer, just against Text's own private node-data texture.
layout(location = 0) in vec2  a_position;   // local-space quad corner
layout(location = 1) in vec2  a_texcoord;
layout(location = 2) in uint a_packedNodeSlot; // bits 0..22 = node row, bit 23 = decoration, bits 24..31 = atlas slot

uniform mat3 u_projection;
uniform mat3 u_group;
uniform vec4 u_viewport;
uniform sampler2D u_nodeData;

flat out int   v_nodeIndex;
flat out uint  v_textureSlot;
flat out uint  v_decoration;
flat out vec4  v_pxAxes;
     out vec2  v_texcoord;
     out vec2  v_gradUV;

void main(void) {
    // Mirrors textNodeIndexMask / textDecorationFlagBit in atlasTextureSlots.ts.
    int ni = int(a_packedNodeSlot & 0x007fffffu);

    // texel 0: (a, c, snapMode, tx) — mat3 column-major: col0 + snap flag + translate.x
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

    vec2 clip = (u_projection * u_group * xf * vec3(a_position, 1.0)).xy;

    // Render-only pixel snapping (t0.z: 0 = none, 1 = position, 2 = geometry —
    // both non-zero modes snap the origin). Snap the node ORIGIN (t0.w, t1.w)
    // to its nearest device pixel and rigid-shift the whole glyph by the same
    // delta. floor(x+0.5) matches the CPU Math.round policy; GLSL round() is
    // undefined at .5. Grid alignment is independent of the y-axis convention
    // because the staged viewport rect is whole device pixels.
    if (t0.z != 0.0) {
        vec2 originClip = (u_projection * u_group * vec3(t0.w, t1.w, 1.0)).xy;
        vec2 originDevice = u_viewport.xy + (originClip * 0.5 + 0.5) * u_viewport.zw;
        clip += (floor(originDevice + 0.5) - originDevice) * 2.0 / max(u_viewport.zw, vec2(1.0));
    }

    // The device-pixel images of the local +x and +y directions — together, the
    // projected footprint of one LOCAL unit.
    //
    // The fragment stage needs it to size an antialiased edge against the pixel
    // it actually lands on. Taken from the transform rather than from a hardware
    // derivative (`fwidth`) on purpose: derivatives are implementation-defined,
    // so the GLSL and WGSL stages would disagree on the edge ramp by a few
    // percent and the cross-backend parity claim would drop from bit-exact to
    // approximate. It folds in the node transform, the group transform, the
    // camera's zoom and the device pixel ratio alike — every route by which a
    // glyph's on-screen density is decided.
    //
    // Both columns rather than only column 0: a single scalar describes the
    // whole footprint only while the transform is a similarity. Under a
    // non-uniform scale the two axes carry different densities, and the fragment
    // stage picks the one the edge's own normal lands on.
    //
    // A direction ignores translation, hence the zero third component. Clip
    // space spans 2 across the viewport, so half the viewport size converts it.
    mat3 composed  = u_projection * u_group * xf;
    vec2 unitClipX = (composed * vec3(1.0, 0.0, 0.0)).xy;
    vec2 unitClipY = (composed * vec3(0.0, 1.0, 0.0)).xy;

    gl_Position = vec4(clip, 0.0, 1.0);
    v_texcoord  = a_texcoord;
    v_nodeIndex = ni;
    v_pxAxes    = vec4(unitClipX * u_viewport.zw * 0.5, unitClipY * u_viewport.zw * 0.5);
    v_textureSlot = a_packedNodeSlot >> 24u;
    v_decoration  = (a_packedNodeSlot & 0x00800000u) != 0u ? 1u : 0u;

    vec2 bSize = t9.zw;
    v_gradUV = (bSize.x > 0.0 && bSize.y > 0.0)
        ? clamp((a_position - t9.xy) / bSize, 0.0, 1.0)
        : vec2(0.0);
}
