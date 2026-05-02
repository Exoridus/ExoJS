#version 300 es
precision lowp float;

layout(location = 0) in vec2 a_position;
layout(location = 1) in vec2 a_texcoord;
layout(location = 2) in vec4 a_color;

uniform mat3 u_projection;
uniform mat3 u_translation;

out vec2 v_texcoord;
out vec4 v_color;

void main(void) {
    gl_Position = vec4((u_projection * u_translation * vec3(a_position, 1.0)).xy, 0.0, 1.0);
    v_texcoord = a_texcoord;
    v_color = a_color;
}
