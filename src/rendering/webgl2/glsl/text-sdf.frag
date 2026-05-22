#version 300 es
precision mediump float;

uniform sampler2D u_texture;   // R8 SDF atlas (auto-bound)
uniform vec4 u_tint;           // fill color (auto-bound)

// SDF effect uniforms
uniform vec4  u_outlineColor;
uniform float u_outlineWidth;   // SDF units (0..0.5); 0 = disabled
uniform vec4  u_shadowColor;
uniform vec2  u_shadowOffset;   // UV-space offset for shadow
uniform float u_shadowAlpha;    // 0..1; 0 = disabled
uniform float u_softness;       // edge softness (0.01..0.2)

// Gradient uniforms
uniform float u_gradientEnabled; // 1.0 = on, 0.0 = off
uniform vec4  u_gradientTop;
uniform vec4  u_gradientBottom;
uniform float u_gradientVertical; // 1.0 = vertical (default), 0.0 = horizontal

in vec2 v_texcoord;
in vec4 v_color;

layout(location = 0) out vec4 fragColor;

void main(void) {
  float soft = max(u_softness, 0.001);

  float sd   = texture(u_texture, v_texcoord).r;
  float fill = smoothstep(0.5 - soft, 0.5 + soft, sd);

  // Outline: ring just below the fill threshold
  float outlineMin = 0.5 - u_outlineWidth;
  float outline = u_outlineWidth > 0.0
    ? smoothstep(outlineMin - soft, outlineMin + soft, sd) * (1.0 - fill)
    : 0.0;

  // Shadow: sample the SDF at an offset UV position
  float shadowSd = texture(u_texture, v_texcoord - u_shadowOffset).r;
  float shadow   = smoothstep(0.5 - soft, 0.5 + soft, shadowSd)
                   * u_shadowAlpha * (1.0 - fill) * (1.0 - outline);

  // Fill color — optionally overridden by gradient
  vec4 fillColor;
  if (u_gradientEnabled > 0.5) {
    float t = u_gradientVertical > 0.5 ? v_texcoord.y : v_texcoord.x;
    fillColor = mix(u_gradientBottom, u_gradientTop, t);
  } else {
    fillColor = u_tint;
  }

  fragColor = fillColor * fill
            + u_outlineColor * outline
            + u_shadowColor * shadow;
}
