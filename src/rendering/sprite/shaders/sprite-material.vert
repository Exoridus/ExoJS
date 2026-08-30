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
uniform vec4 u_viewport;                        // device-pixel snap rect (x, y, width, height)
uniform sampler2D u_transforms;                 // shared per-frame transform buffer (2 texels/row)
uniform sampler2D u_tintTexture;                // shared per-frame tint buffer (rgba8, 1 texel/row)

// #exo-include transform-texture

out vec2 v_texcoord;
out vec4 v_color;
flat out uint v_textureSlot;

// Round one local boundary coordinate to the device grid along an axis whose
// local-to-device scale is scale: floor(L*scale + 0.5) / scale. Pure in the
// boundary value, so two quads sharing a boundary snap identically — seams stay
// closed. Identical to the default sprite vertex stage.
float snapBoundary(float localValue, float scale) {
    if (abs(scale) < 1e-6) return localValue;
    return floor(localValue * scale + 0.5) / scale;
}

void main(void) {
    // gl_VertexID 0..3 → corner: 0=TL, 1=TR, 2=BL, 3=BR (TRIANGLE_STRIP order)
    int vid = gl_VertexID;
    int cornerX = vid & 1;
    int cornerY = (vid >> 1) & 1;

    float localX = (cornerX == 0) ? a_localBounds.x : a_localBounds.z;
    float localY = (cornerY == 0) ? a_localBounds.y : a_localBounds.w;

    // Fetch the per-instance world transform and tint (row = a_nodeIndex):
    // transform texel 0 = (a, b, c, d), texel 1 = (tx, ty, snapMode, 0); tint
    // is its own rgba8 texel (0..1 already, hardware-normalized).
    int row = int(a_nodeIndex);
    vec4 m0 = texelFetch(u_transforms, exoTransformTexel(row, 0), 0);
    vec4 m1 = texelFetch(u_transforms, exoTransformTexel(row, 1), 0);
    vec4 m2 = texelFetch(u_tintTexture, exoTintTexel(row), 0);

    // Geometry boundary snap (m1.z == 2.0, axis-aligned only): round each local
    // corner to the device grid so the quad edges land on whole device pixels.
    // The per-axis device scale is derived from the composed pipeline.
    // Identical to the default sprite vertex stage.
    if (m1.z == 2.0) {
        vec2 vp = u_viewport.zw;
        vec3 dO = u_projection * u_group * vec3(m1.x, m1.y, 1.0);
        vec2 devO = u_viewport.xy + (dO.xy * 0.5 + 0.5) * vp;
        vec3 dX = u_projection * u_group * vec3(m1.x + m0.x, m1.y + m0.z, 1.0);
        vec3 dY = u_projection * u_group * vec3(m1.x + m0.y, m1.y + m0.w, 1.0);
        vec2 devX = u_viewport.xy + (dX.xy * 0.5 + 0.5) * vp;
        vec2 devY = u_viewport.xy + (dY.xy * 0.5 + 0.5) * vp;
        float scaleX = devX.x - devO.x;
        float scaleY = devY.y - devO.y;
        if (abs(devX.y - devO.y) < 1e-3 && abs(devY.x - devO.x) < 1e-3) {
            localX = snapBoundary(localX, scaleX);
            localY = snapBoundary(localY, scaleY);
        }
    }

    float worldX = (m0.x * localX) + (m0.y * localY) + m1.x;
    float worldY = (m0.z * localX) + (m0.w * localY) + m1.y;

    vec2 clip = (u_projection * u_group * vec3(worldX, worldY, 1.0)).xy;

    // Render-only pixel snapping (m1.z: 0 = none, 1 = position, 2 = geometry —
    // both non-zero modes snap the origin), identical to the default sprite
    // vertex stage: snap the node ORIGIN's device-pixel position and rigid-shift
    // the whole primitive by the same delta. floor(x+0.5) matches the CPU
    // Math.round policy; GLSL round() is undefined at .5. A custom material
    // customizes only the fragment stage, so its origin snap must stay identical.
    if (m1.z != 0.0) {
        vec2 originClip = (u_projection * u_group * vec3(m1.x, m1.y, 1.0)).xy;
        vec2 originDevice = u_viewport.xy + (originClip * 0.5 + 0.5) * u_viewport.zw;
        clip += (floor(originDevice + 0.5) - originDevice) * 2.0 / max(u_viewport.zw, vec2(1.0));
    }

    gl_Position = vec4(clip, 0.0, 1.0);

    float u = (cornerX == 0) ? a_uvBounds.x : a_uvBounds.z;
    float v = (cornerY == 0) ? a_uvBounds.y : a_uvBounds.w;
    v_texcoord = vec2(u, v);

    v_color = vec4(m2.rgb * m2.a, m2.a);
    v_textureSlot = a_textureSlot;
}
