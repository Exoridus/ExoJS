#version 300 es
precision mediump float;

uniform sampler2D u_texture;   // RGB MSDF atlas
uniform sampler2D u_nodeData;  // RGBA32F per-node data (see WebGl2TextRenderer)
uniform float     u_pageSize;  // atlas page size in px (for shadow UV conversion)

flat in int  v_nodeIndex;
     in vec2 v_texcoord;
     in vec2 v_gradUV;

layout(location = 0) out vec4 fragColor;

float median(float r, float g, float b) {
  return max(min(r, g), min(max(r, g), b));
}

void main(void) {
  int ni = v_nodeIndex;

  // Same node data layout as text-sdf.frag
  vec4 tFill    = texelFetch(u_nodeData, ivec2(2, ni), 0);
  vec4 tOutline = texelFetch(u_nodeData, ivec2(3, ni), 0);
  vec4 tParams  = texelFetch(u_nodeData, ivec2(4, ni), 0); // (outlineMin, shadowAlpha, softness, gradientEnabled)
  vec4 tShadow  = texelFetch(u_nodeData, ivec2(5, ni), 0);
  vec4 tShadow2 = texelFetch(u_nodeData, ivec2(6, ni), 0); // (shadowOffX_px, shadowOffY_px, gradientVertical, 0)
  vec4 tGradTop = texelFetch(u_nodeData, ivec2(7, ni), 0);
  vec4 tGradBot = texelFetch(u_nodeData, ivec2(8, ni), 0);

  float outlineMin   = tParams.x;
  float shadowAlpha  = tParams.y;
  float soft         = max(tParams.z, 0.001);
  float gradEnabled  = tParams.w;
  vec2  shadowOffset = tShadow2.xy / u_pageSize;
  float gradVertical = tShadow2.z;

  vec3  msd  = texture(u_texture, v_texcoord).rgb;
  float sd   = median(msd.r, msd.g, msd.b);
  float fill = smoothstep(0.5 - soft, 0.5 + soft, sd);

  float outline = outlineMin < 0.5
    ? smoothstep(outlineMin - soft, outlineMin + soft, sd) * (1.0 - fill)
    : 0.0;

  vec3  shadowMsd = texture(u_texture, v_texcoord - shadowOffset).rgb;
  float shadowSd  = median(shadowMsd.r, shadowMsd.g, shadowMsd.b);
  float shadow    = smoothstep(0.5 - soft, 0.5 + soft, shadowSd)
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
