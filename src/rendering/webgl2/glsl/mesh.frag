#version 300 es
precision lowp float;

uniform sampler2D u_texture;

in vec2 v_texcoord;
in vec4 v_color;
in vec4 v_tint;

layout(location = 0) out vec4 fragColor;

void main(void) {
    vec4 base = texture(u_texture, v_texcoord) * v_color * v_tint;
    fragColor = vec4(base.rgb * base.a, base.a);
}
