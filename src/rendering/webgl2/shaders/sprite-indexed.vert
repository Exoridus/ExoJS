#version 300 es
precision highp float;
precision highp int;

// Persistent-indexed sprite variant.
//
// Same quad expansion, same snapping, same output as `sprite.vert` — the ONE
// difference is where the per-sprite data comes from. The live path streams a
// 32-byte instance record per draw; here the record is already on the GPU, in
// slot-addressed stores that only change when an item enters or leaves the view,
// and the single per-instance attribute is the slot to read.
//
// The shared half of this shader (snapBoundary + everything from the corner
// selection to the end of main) is byte-identical to `sprite.vert` and pinned
// that way by `test/rendering/sprite-shader-variants.test.ts`. Edit both.
//
// Store layout, all three addressed by the SAME row mapping as the shared
// transform texture (`exoTransformTexel` / `exoTintTexel`), because a slot row
// and a transform row are the same two-texel shape:
//
//   u_slotAttributes  texel 0 = (left, top, right, bottom)   local bounds
//                     texel 1 = (uMin, vMin, uMax, vMax)     already flipY-swapped
//   u_transforms      texel 0 = (a, b, c, d)
//                     texel 1 = (tx, ty, snapMode, textureSlot)
//   u_tintTexture     texel 0 = (r, g, b, a)
//
// `textureSlot` rides in the transform row's fourth component — the slot the
// shared frame store leaves at 0 and no shader reads. Putting it there keeps the
// attribute store at two texels, so its texture is the same 2048-texel width the
// WebGL2 minimum guarantees; a third texel would need 3072.
layout(location = 0) in uint a_slot;

uniform mat3 u_projection;
uniform mat3 u_group;
uniform vec4 u_viewport;                        // device-pixel viewport rect (x, y, width, height) for position snapping
uniform sampler2D u_slotAttributes;             // persistent per-slot quad attributes (2 texels/slot)
uniform sampler2D u_transforms;                 // persistent per-slot transform (2 texels/slot)
uniform sampler2D u_tintTexture;                // persistent per-slot tint (rgba8, 1 texel/slot)

// #exo-include transform-texture

out vec2 v_texcoord;
out vec4 v_color;
flat out uint v_textureSlot;

// Round one local boundary coordinate to the device grid along an axis whose
// local→device scale is `scale`: floor(L*scale + 0.5) / scale. Pure in the
// boundary value, so two quads sharing a boundary snap identically — seams stay
// closed. Degenerate scales pass the value through unchanged.
float snapBoundary(float localValue, float scale) {
    if (abs(scale) < 1e-6) return localValue;
    return floor(localValue * scale + 0.5) / scale;
}

void main(void) {
    int row = int(a_slot);
    vec4 a_localBounds = texelFetch(u_slotAttributes, exoTransformTexel(row, 0), 0);
    vec4 a_uvBounds = texelFetch(u_slotAttributes, exoTransformTexel(row, 1), 0);
    vec4 m0 = texelFetch(u_transforms, exoTransformTexel(row, 0), 0); // a, b, c, d
    vec4 m1 = texelFetch(u_transforms, exoTransformTexel(row, 1), 0); // tx, ty, snapMode, textureSlot
    vec4 m2 = texelFetch(u_tintTexture, exoTintTexel(row), 0); // tint (rgb 0..1, a)
    uint a_textureSlot = uint(m1.w);

    // gl_VertexID 0..3 → corner: 0=TL, 1=TR, 2=BL, 3=BR (TRIANGLE_STRIP order)
    int vid = gl_VertexID;
    int cornerX = vid & 1;
    int cornerY = (vid >> 1) & 1;

    // Local-space corner: pick from the bounds rectangle.
    float localX = (cornerX == 0) ? a_localBounds.x : a_localBounds.z;
    float localY = (cornerY == 0) ? a_localBounds.y : a_localBounds.w;

    // Geometry boundary snap: round each local corner to the device grid so the
    // quad edges land on whole device pixels (m1.z == 2.0, axis-aligned only).
    // Derive the per-axis device scale from the composed pipeline: device
    // positions of the local origin and the two local unit axes give scaleX/
    // scaleY (device-per-local) and the cross-terms.
    if (m1.z == 2.0) {
        vec2 vp = u_viewport.zw;
        vec3 dO = u_projection * u_group * vec3(m1.x, m1.y, 1.0);          // NOTE: origin uses row translation
        vec2 devO = u_viewport.xy + (dO.xy * 0.5 + 0.5) * vp;
        // The linear part maps local (1,0)->(m0.x,m0.z), (0,1)->(m0.y,m0.w).
        vec3 dX = u_projection * u_group * vec3(m1.x + m0.x, m1.y + m0.z, 1.0);
        vec3 dY = u_projection * u_group * vec3(m1.x + m0.y, m1.y + m0.w, 1.0);
        vec2 devX = u_viewport.xy + (dX.xy * 0.5 + 0.5) * vp;
        vec2 devY = u_viewport.xy + (dY.xy * 0.5 + 0.5) * vp;
        float scaleX = devX.x - devO.x;
        float scaleY = devY.y - devO.y;
        float crossXy = devX.y - devO.y;
        float crossYx = devY.x - devO.x;
        if (abs(crossXy) < 1e-3 && abs(crossYx) < 1e-3) { // axis-aligned
            localX = snapBoundary(localX, scaleX);
            localY = snapBoundary(localY, scaleY);
        }
    }

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
