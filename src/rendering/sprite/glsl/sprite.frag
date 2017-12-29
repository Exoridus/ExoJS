#version 300 es
precision lowp float;

layout(location = 0) out vec4 fragColor;

uniform sampler2D u_texture;

in vec2 v_texcoord;
in vec4 v_color;

void main(void) {
    fragColor = texture(u_texture, v_texcoord) * v_color;
}
