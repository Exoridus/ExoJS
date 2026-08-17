#version 300 es
precision mediump float;

uniform sampler2D u_nodeData;  // RGBA32F per-node data (see WebGl2TextRenderer)
uniform float     u_pageSize;  // atlas page size in px (for shadow UV conversion)

flat in int   v_nodeIndex;
flat in float v_pxPerUnit;
     in vec2  v_texcoord;
     in vec2  v_gradUV;

layout(location = 0) out vec4 fragColor;

void main(void) {
  int ni = v_nodeIndex;

  // texel 2: fillColor
  // texel 3: outlineColor
  // texel 4: (outlineMin, shadowAlpha, shadowBlur, gradientEnabled)
  // texel 6: (shadowOffX_px, shadowOffY_px, gradientVertical, sdfRadius_logical)
  //          outlineMin = 0.5 → disabled; outlineMin < 0.5 → enabled
  // texel 5: shadowColor
  // texel 6: (shadowOffsetX_px, shadowOffsetY_px, gradientVertical, unused)
  // texel 7: gradientTop
  // texel 8: gradientBottom
  vec4 tFill    = texelFetch(u_nodeData, ivec2(2, ni), 0);
  vec4 tOutline = texelFetch(u_nodeData, ivec2(3, ni), 0);
  vec4 tParams  = texelFetch(u_nodeData, ivec2(4, ni), 0);
  vec4 tShadow  = texelFetch(u_nodeData, ivec2(5, ni), 0);
  vec4 tShadow2 = texelFetch(u_nodeData, ivec2(6, ni), 0);
  vec4 tGradTop = texelFetch(u_nodeData, ivec2(7, ni), 0);
  vec4 tGradBot = texelFetch(u_nodeData, ivec2(8, ni), 0);

  float outlineMin   = tParams.x;
  float shadowAlpha  = tParams.y;
  float blur         = tParams.z;
  float gradEnabled  = tParams.w;
  vec2  shadowOffset = tShadow2.xy / u_pageSize;
  float gradVertical = tShadow2.z;

  float sd   = sampleBase(v_textureSlot, v_texcoord).r;

  // Antialiasing width, measured against the PROJECTED pixel footprint rather
  // than fixed in field units. A constant cannot be right everywhere at once: it
  // renders a hard, aliased step wherever the glyph is dense and a multi-pixel
  // smear wherever it is magnified.
  //
  // The field moves by 1/sdfRadius per LOCAL unit — the atlas density cancels,
  // because a denser atlas packs proportionally more texels into the same local
  // extent — so `1 / (radius * pxPerUnit)` is how far it moves across one device
  // pixel, and half of that puts a half-pixel of fade on either side of the
  // threshold. `fwidth` would answer the same question, but with an
  // implementation-defined derivative that makes the GLSL and WGSL stages
  // disagree on the ramp; it stays as the fallback for an atlas whose field
  // scale is unknown (an MSDF atlas carries no distance range).
  float radius = tShadow2.w;
  float aa = radius > 0.0 && v_pxPerUnit > 0.0
    ? max(0.5 / (radius * v_pxPerUnit), 0.0001)
    : max(fwidth(sd) * 0.5, 0.0001);
  float fill = smoothstep(0.5 - aa, 0.5 + aa, sd);

  float outline = outlineMin < 0.5
    ? smoothstep(outlineMin - aa, outlineMin + aa, sd) * (1.0 - fill)
    : 0.0;

  // The shadow is the one edge allowed to be softer than a pixel: `shadowBlur`
  // is an authored look, stated in field units so it covers the same logical
  // distance at every raster density. It widens the edge, never sharpens it.
  float shadowSoft = max(aa, blur);
  float shadowSd   = sampleBase(v_textureSlot, v_texcoord - shadowOffset).r;
  float shadow     = smoothstep(0.5 - shadowSoft, 0.5 + shadowSoft, shadowSd)
                     * shadowAlpha * (1.0 - fill) * (1.0 - outline);

  vec4 fillColor;
  if (gradEnabled > 0.5) {
    // v_gradUV is 0 at the top/left edge of the ink box and 1 at the
    // bottom/right, so texel 7 (gradientColors[0]) belongs at t = 0.
    float t = gradVertical > 0.5 ? v_gradUV.y : v_gradUV.x;
    fillColor = mix(tGradTop, tGradBot, t);
  } else {
    fillColor = tFill;
  }

  fragColor = fillColor * fill
            + tOutline  * outline
            + tShadow   * shadow;
}
