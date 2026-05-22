#version 300 es
precision mediump float;

uniform sampler2D u_texture;   // RGBA colour-font / emoji atlas (auto-bound)
uniform vec4 u_tint;           // fill color multiplier; (1,1,1,1) = no tint

in vec2 v_texcoord;
in vec4 v_color;

layout(location = 0) out vec4 fragColor;

void main(void) {
  vec4 sample = texture(u_texture, v_texcoord);
  fragColor = sample * u_tint;
}
