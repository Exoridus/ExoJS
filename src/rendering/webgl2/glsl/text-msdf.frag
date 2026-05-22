#version 300 es
precision mediump float;

uniform sampler2D u_texture;   // RGB MSDF atlas (auto-bound)
uniform vec4 u_tint;           // fill color (auto-bound)

uniform vec4  u_outlineColor;
uniform float u_outlineMin;    // SDF distance for outline start (e.g. 0.3); 0.5 = disabled
uniform vec4  u_shadowColor;
uniform vec2  u_shadowOffset;  // UV-space offset for the shadow sample
uniform float u_shadowAlpha;   // 0..1; 0 = disabled
uniform float u_softness;      // edge softness

in vec2 v_texcoord;
in vec4 v_color;

layout(location = 0) out vec4 fragColor;

float median(float r, float g, float b) {
  return max(min(r, g), min(max(r, g), b));
}

void main(void) {
  float soft = max(u_softness, 0.001);

  vec3  msd     = texture(u_texture, v_texcoord).rgb;
  float sd      = median(msd.r, msd.g, msd.b);
  float fill    = smoothstep(0.5 - soft, 0.5 + soft, sd);
  float outline = u_outlineMin < 0.5
    ? smoothstep(u_outlineMin - soft, u_outlineMin + soft, sd) * (1.0 - fill)
    : 0.0;

  // Shadow: sample MSDF at an offset UV position
  vec3  shadowMsd = texture(u_texture, v_texcoord - u_shadowOffset).rgb;
  float shadowSd  = median(shadowMsd.r, shadowMsd.g, shadowMsd.b);
  float shadow    = smoothstep(0.5 - soft, 0.5 + soft, shadowSd)
                    * u_shadowAlpha * (1.0 - fill) * (1.0 - outline);

  fragColor = u_tint * fill + u_outlineColor * outline + u_shadowColor * shadow;
}
