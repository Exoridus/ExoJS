#version 300 es
precision lowp float;

uniform sampler2D u_texture;
uniform vec4 u_tint;

in vec2 v_texcoord;
in vec4 v_color;

layout(location = 0) out vec4 fragColor;

void main(void) {
    vec4 base = texture(u_texture, v_texcoord) * v_color * u_tint;
    fragColor = vec4(base.rgb * base.a, base.a);
}
