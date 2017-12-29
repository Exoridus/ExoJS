#version 300 es
precision lowp float;

layout(location = 0) in vec2 a_position;
layout(location = 1) in vec2 a_texcoord;
layout(location = 2) in vec2 a_translation;
layout(location = 3) in vec2 a_scale;
layout(location = 4) in float a_rotation;
layout(location = 5) in vec4 a_color;

uniform mat3 u_projection;

out vec2 v_texcoord;
out vec4 v_color;

void main(void) {
    vec2 rotation = vec2(sin(radians(a_rotation)), cos(radians(a_rotation)));
    vec3 position = u_projection * vec3(
        (a_position.x * (a_scale.x * rotation.y)) + (a_position.y * (a_scale.y * rotation.x)) + a_translation.x,
        (a_position.x * (a_scale.x * -rotation.x)) + (a_position.y * (a_scale.y * rotation.y)) + a_translation.y,
        1.0
    );

    gl_Position = vec4(position.xy, 0.0, 1.0);

    v_texcoord = a_texcoord;
    v_color = vec4(a_color.rgb * a_color.a, a_color.a);
}
