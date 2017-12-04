#version 300 es
precision lowp float;

uniform mat3 u_projection;

layout(location = 0) in vec2 a_position;
layout(location = 1) in vec2 a_texcoord;
layout(location = 2) in vec4 a_color;

out vec2 v_texcoord;
out vec4 v_color;

void main(void) {
    v_texcoord = a_texcoord;
    v_color = a_color;

    gl_Position = vec4((u_projection * vec3(a_position, 1.0)).xy, 0.0, 1.0);
}
