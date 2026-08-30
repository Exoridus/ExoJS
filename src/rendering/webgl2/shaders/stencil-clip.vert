#version 300 es
precision highp float;

layout(location = 0) in vec2 a_position;

uniform mat3 u_matrix;

void main(void) {
    gl_Position = vec4((u_matrix * vec3(a_position, 1.0)).xy, 0.0, 1.0);
}
