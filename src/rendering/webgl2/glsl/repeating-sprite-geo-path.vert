#version 300 es
precision highp float;
precision highp int;

layout(location = 0) in vec4 a_quadBounds;   // x0,y0,x1,y1 (local space)
layout(location = 1) in vec4 a_uvBounds;     // u0,v0,u1,v1 (normalised, flipY pre-applied)
layout(location = 2) in vec4 a_color;        // RGBA tint
layout(location = 3) in uint a_nodeIndex;    // transform row

uniform mat3 u_projection;
uniform mat3 u_group;
uniform vec4 u_viewport;
uniform sampler2D u_transforms;

// #exo-include transform-texture

out vec2 v_texcoord;
out vec4 v_color;

// Round one local boundary coordinate to the device grid along an axis whose
// local→device scale is \`scale\`: floor(L*scale + 0.5) / scale. Pure in the
// boundary value, so two segments sharing a boundary snap identically — seams
// stay closed. Degenerate scales pass the value through unchanged.
float snapBoundary(float localValue, float scale) {
    if (abs(scale) < 1e-6) return localValue;
    return floor(localValue * scale + 0.5) / scale;
}

void main(void) {
    int vid = gl_VertexID;
    int cx = vid & 1;
    int cy = (vid >> 1) & 1;

    float lx = (cx == 0) ? a_quadBounds.x : a_quadBounds.z;
    float ly = (cy == 0) ? a_quadBounds.y : a_quadBounds.w;

    int row = int(a_nodeIndex);
    vec4 m0 = texelFetch(u_transforms, exoTransformTexel(row, 0), 0);
    vec4 m1 = texelFetch(u_transforms, exoTransformTexel(row, 1), 0);

    // Geometry boundary snap: round each local corner to the device grid so the
    // segment edges land on whole device pixels (m1.z == 2.0, axis-aligned only).
    // Derive the per-axis device scale from the composed pipeline. Shared
    // repeat-segment edges are the same local value, so this pure snap moves
    // both neighbours identically — the internal seams stay closed.
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
        float crossXy = devX.y - devO.y;
        float crossYx = devY.x - devO.x;
        if (abs(crossXy) < 1e-3 && abs(crossYx) < 1e-3) { // axis-aligned
            lx = snapBoundary(lx, scaleX);
            ly = snapBoundary(ly, scaleY);
        }
    }

    float wx = m0.x * lx + m0.y * ly + m1.x;
    float wy = m0.z * lx + m0.w * ly + m1.y;
    vec2 clip = (u_projection * u_group * vec3(wx, wy, 1.0)).xy;

    // Render-only pixel snapping (m1.z: 0 = none, 1 = position, 2 = geometry —
    // both non-zero modes snap the origin). Snap the node ORIGIN's device-pixel
    // position and rigid-shift the whole primitive by the same delta. floor(x+0.5)
    // matches the CPU Math.round policy; GLSL round() is undefined at .5. Grid
    // alignment is independent of the y-axis convention because the staged
    // viewport rect is whole device pixels.
    if (m1.z != 0.0) {
        vec2 originClip = (u_projection * u_group * vec3(m1.x, m1.y, 1.0)).xy;
        vec2 originDevice = u_viewport.xy + (originClip * 0.5 + 0.5) * u_viewport.zw;
        clip += (floor(originDevice + 0.5) - originDevice) * 2.0 / max(u_viewport.zw, vec2(1.0));
    }

    gl_Position = vec4(clip, 0.0, 1.0);

    float u = (cx == 0) ? a_uvBounds.x : a_uvBounds.z;
    float v = (cy == 0) ? a_uvBounds.y : a_uvBounds.w;
    v_texcoord = vec2(u, v);

    v_color = vec4(a_color.rgb * a_color.a, a_color.a);
}
