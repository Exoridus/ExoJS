#version 300 es
precision mediump float;

in vec2 v_texcoord;

uniform sampler2D u_frame;
uniform sampler2D u_light;

out vec4 fragColor;

void main() {
    vec4 frame = texture(u_frame, v_texcoord);
    vec3 light = texture(u_light, v_texcoord).rgb;

    // The frame is premultiplied, so scaling its colour by the light keeps the
    // relationship with its alpha intact and an unlit area goes dark rather
    // than transparent.
    fragColor = vec4(frame.rgb * light, frame.a);
}
