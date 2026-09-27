#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;

layout(location = 0) in vec2 a_position;
layout(location = 1) in float a_angle;
layout(location = 2) in uint a_color;
layout(location = 3) in vec2 a_velocity;
layout(location = 4) in float a_speed;
layout(location = 5) in vec2 a_timing;
layout(location = 6) in uint a_textureIndex;
layout(location = 7) in float a_marker;
layout(location = 8) in uint a_slot;
layout(location = 9) in vec2 a_scale;

out vec2 o_position;
out vec2 o_scale;
out float o_angle;
flat out uint o_color;
out vec4 o_uv;
out vec2 o_velocity;
out float o_speed;
out vec2 o_timing;
flat out uint o_textureIndex;
out float o_marker;
flat out uint o_slot;
out vec2 o_simScale;

uniform float u_dt;
uniform sampler2D u_frames;
uniform uint u_frameCount;
{{declarations}}
{{preludes}}

void main() {
    uint idx = uint(gl_VertexID);
    float dt = u_dt;
    vec2 position = a_position;
    vec2 velocity = a_velocity;
    vec2 scale = a_scale;
    vec2 rotation = vec2(a_angle, a_speed);
    vec2 timing = a_timing;
    uint color = a_color;
    uint textureIndex = a_textureIndex;

    // An expiry marker preserves the lifetime while terminal modules execute.
    if (a_marker > 0.0 || (a_marker == 0.0 && timing.y > 0.0)) {
        position += velocity * dt;
        rotation.x += rotation.y * dt;
        timing.x += dt;
{{bodies}}
    }

    o_position = position;
    o_scale = a_marker == 0.0 && timing.y > 0.0 ? scale : vec2(0.0);
    o_angle = rotation.x;
    o_color = color;
    o_uv = texelFetch(u_frames, ivec2(int(textureIndex < u_frameCount ? textureIndex : 0u), 0), 0);
    o_velocity = velocity;
    o_speed = rotation.y;
    o_timing = timing;
    o_textureIndex = textureIndex;
    o_marker = a_marker > 0.0 ? -1.0 : a_marker;
    o_slot = a_slot;
    o_simScale = scale;
    gl_Position = vec4(0.0);
}
