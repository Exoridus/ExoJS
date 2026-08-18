#version 300 es
precision highp float;
precision highp int;

// Per-instance attributes (divisor = 1). One entry per tile quad.
// gl_VertexID 0..3 selects which corner of the quad this invocation computes.
layout(location = 0) in vec4 a_quadBounds;   // x0, y0, x1, y1 (chunk-local)
layout(location = 1) in vec4 a_uvBounds;     // uMin, vMin, uMax, vMax (flipX/Y + texture flipY baked)
layout(location = 2) in vec4 a_color;        // RGBA tint (layer opacity in alpha)
layout(location = 3) in uint a_tileWord;     // transform row (bits 0..28) | diagonal (bit 29)

uniform mat3 u_projection;
uniform mat3 u_group;
uniform vec4 u_viewport;                      // device-pixel viewport rect (x, y, width, height)
uniform sampler2D u_transforms;              // shared per-frame transform buffer (2 texels/row)

// #exo-include transform-texture

out vec2 v_texcoord;
out vec4 v_color;

void main(void) {
    // gl_VertexID 0..3 -> corner: 0=TL, 1=TR, 2=BL, 3=BR (TRIANGLE_STRIP order)
    int vid = gl_VertexID;
    int cornerX = vid & 1;
    int cornerY = (vid >> 1) & 1;

    float localX = (cornerX == 0) ? a_quadBounds.x : a_quadBounds.z;
    float localY = (cornerY == 0) ? a_quadBounds.y : a_quadBounds.w;

    int row = int(a_tileWord & {{tileRowMask}}u);
    bool diagonal = (a_tileWord & {{tileDiagonalBit}}u) != 0u;

    vec4 m0 = texelFetch(u_transforms, exoTransformTexel(row, 0), 0); // a, b, c, d
    vec4 m1 = texelFetch(u_transforms, exoTransformTexel(row, 1), 0); // tx, ty, snapMode, 0

    float worldX = (m0.x * localX) + (m0.y * localY) + m1.x;
    float worldY = (m0.z * localX) + (m0.w * localY) + m1.y;

    vec2 clip = (u_projection * u_group * vec3(worldX, worldY, 1.0)).xy;

    // Render-only pixel snapping (m1.z: 0 = none, 1 = position, 2 = geometry —
    // both non-zero modes snap the origin). Snap the chunk ORIGIN's device-pixel
    // position and rigid-shift the whole tile quad by the same delta. floor(x+0.5)
    // matches the CPU Math.round policy; GLSL round() is undefined at .5. Grid
    // alignment is independent of the y-axis convention because the staged
    // viewport rect is whole device pixels.
    if (m1.z != 0.0) {
        vec2 originClip = (u_projection * u_group * vec3(m1.x, m1.y, 1.0)).xy;
        vec2 originDevice = u_viewport.xy + (originClip * 0.5 + 0.5) * u_viewport.zw;
        clip += (floor(originDevice + 0.5) - originDevice) * 2.0 / max(u_viewport.zw, vec2(1.0));
    }

    gl_Position = vec4(clip, 0.0, 1.0);

    // Tile orientation: the diagonal flip transposes the corner-coordinate axes
    // before the UV corner is selected; flipX/flipY are already baked into the
    // (uMin,uMax)/(vMin,vMax) ordering by the CPU writer.
    int su = cornerX;
    int sv = cornerY;
    if (diagonal) { int t = su; su = sv; sv = t; }

    float u = (su == 0) ? a_uvBounds.x : a_uvBounds.z;
    float v = (sv == 0) ? a_uvBounds.y : a_uvBounds.w;
    v_texcoord = vec2(u, v);

    v_color = vec4(a_color.rgb * a_color.a, a_color.a);
}
