#version 300 es
precision lowp float;

uniform mat3 u_projection;

layout(location = 0) in vec2 a_position;
layout(location = 1) in vec2 a_texcoord;
layout(location = 5) in vec4 a_color;

layout(location = 2) in vec2 a_translation;
layout(location = 3) in vec2 a_scale;
layout(location = 4) in float a_rotation;

out vec2 v_texcoord;
out vec4 v_color;

void main(void) {
    v_texcoord = a_texcoord;
    v_color = a_color;

    vec2 pos = vec2(
        (a_position.x * (a_scale.x * cos(a_rotation))) + (a_position.y * (a_scale.y * sin(a_rotation))) + a_position.x,
        (a_position.x * (a_scale.x * -sin(a_rotation))) + (a_position.y * (a_scale.y * cos(a_rotation))) + a_position.y
    );

    gl_Position = vec4((u_projection * vec3(pos, 1.0)).xy, 0.0, 1.0);
}
