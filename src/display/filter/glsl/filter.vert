#version 300 es
precision lowp float;

layout(location = 0) in vec2 a_position;
layout(location = 1) in vec2 a_texcoord;

uniform mat3 u_projection;

out vec2 v_texcoord;

void main(void) {
    gl_Position = vec4((u_projection * vec3(a_position, 1.0)).xy, 0.0, 1.0);
    v_texcoord = a_texcoord;
}
