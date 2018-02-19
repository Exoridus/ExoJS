#version 300 es
precision lowp float;

layout(location = 0) in vec2 a_position;
layout(location = 1) in vec4 a_color;

uniform mat3 u_projection;
uniform mat3 u_transform;

out vec4 v_color;

void main(void) {
    gl_Position = vec4((u_projection * u_transform * vec3(a_position, 1.0)).xy, 0.0, 1.0);
    v_color = vec4(a_color.rgb * a_color.a, a_color.a);
}
