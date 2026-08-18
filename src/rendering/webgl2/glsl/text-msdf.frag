#version 300 es
// The edge math runs in fp32 even though nothing else here needs it: the
// antialiased band is a few thousandths of the field wide, while fp16's spacing
// around the 0.5 threshold is 2^-11. A driver that honours `mediump` as real
// half-float would therefore quantise the ramp itself rather than the value
// being ramped, which reads as a hard edge on a magnified glyph. Desktop ANGLE
// and SwiftShader compute `mediump` at fp32 regardless, so this is a guarantee
// for hardware that honours the qualifier, not a fix for a defect visible on a
// workstation.
precision highp float;

uniform sampler2D u_nodeData;  // RGBA32F per-node data (see WebGl2TextRenderer)
uniform float     u_pageSize;  // atlas page size in px (for shadow UV conversion)

flat in int   v_nodeIndex;
flat in vec4  v_pxAxes;
     in vec2  v_texcoord;
     in vec2  v_gradUV;

layout(location = 0) out vec4 fragColor;

float median(float r, float g, float b) {
  return max(min(r, g), min(max(r, g), b));
}

void main(void) {
  int ni = v_nodeIndex;

  // Same node data layout as text-sdf.frag
  vec4 tFill    = texelFetch(u_nodeData, ivec2(2, ni), 0);
  vec4 tOutline = texelFetch(u_nodeData, ivec2(3, ni), 0);
  vec4 tParams  = texelFetch(u_nodeData, ivec2(4, ni), 0); // (outlineMin, shadowAlpha, shadowBlur, gradientEnabled)
  vec4 tShadow  = texelFetch(u_nodeData, ivec2(5, ni), 0);
  vec4 tShadow2 = texelFetch(u_nodeData, ivec2(6, ni), 0); // (shadowOffX_px, shadowOffY_px, gradientVertical, 0)
  vec4 tGradTop = texelFetch(u_nodeData, ivec2(7, ni), 0);
  vec4 tGradBot = texelFetch(u_nodeData, ivec2(8, ni), 0);

  float outlineMin   = tParams.x;
  float shadowAlpha  = tParams.y;
  float blur         = tParams.z;
  float gradEnabled  = tParams.w;
  vec2  shadowOffset = tShadow2.xy / u_pageSize;
  float gradVertical = tShadow2.z;

  vec3  msd  = sampleBase(v_textureSlot, v_texcoord).rgb;
  float sd   = median(msd.r, msd.g, msd.b);

  // See text-sdf.frag: the edge fades over one DEVICE pixel rather than over a
  // constant in field units. An MSDF atlas is built offline and carries no
  // distance range in its font data, so its field scale is unknown here and the
  // width has to come from the hardware derivative.
  float aa   = max(fwidth(sd) * 0.5, 0.0001);
  float fill = smoothstep(0.5 - aa, 0.5 + aa, sd);

  float outline = outlineMin < 0.5
    ? smoothstep(outlineMin - aa, outlineMin + aa, sd) * (1.0 - fill)
    : 0.0;

  float shadowSoft = max(aa, blur);
  vec3  shadowMsd  = sampleBase(v_textureSlot, v_texcoord - shadowOffset).rgb;
  float shadowSd   = median(shadowMsd.r, shadowMsd.g, shadowMsd.b);
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
