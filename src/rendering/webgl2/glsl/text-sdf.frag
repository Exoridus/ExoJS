#version 300 es
precision mediump float;

uniform sampler2D u_texture;   // R8 SDF atlas
uniform sampler2D u_nodeData;  // RGBA32F per-node data (see WebGl2TextRenderer)
uniform float     u_pageSize;  // atlas page size in px (for shadow UV conversion)

flat in int  v_nodeIndex;
     in vec2 v_texcoord;
     in vec2 v_gradUV;

layout(location = 0) out vec4 fragColor;

void main(void) {
  int ni = v_nodeIndex;

  // texel 2: fillColor
  // texel 3: outlineColor
  // texel 4: (outlineMin, shadowAlpha, softness, gradientEnabled)
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
  float soft         = max(tParams.z, 0.001);
  float gradEnabled  = tParams.w;
  vec2  shadowOffset = tShadow2.xy / u_pageSize;
  float gradVertical = tShadow2.z;

  float sd   = texture(u_texture, v_texcoord).r;
  float fill = smoothstep(0.5 - soft, 0.5 + soft, sd);

  float outline = outlineMin < 0.5
    ? smoothstep(outlineMin - soft, outlineMin + soft, sd) * (1.0 - fill)
    : 0.0;

  float shadowSd = texture(u_texture, v_texcoord - shadowOffset).r;
  float shadow   = smoothstep(0.5 - soft, 0.5 + soft, shadowSd)
                   * shadowAlpha * (1.0 - fill) * (1.0 - outline);

  vec4 fillColor;
  if (gradEnabled > 0.5) {
    float t = gradVertical > 0.5 ? v_gradUV.y : v_gradUV.x;
    fillColor = mix(tGradBot, tGradTop, t);
  } else {
    fillColor = tFill;
  }

  fragColor = fillColor * fill
            + tOutline  * outline
            + tShadow   * shadow;
}
