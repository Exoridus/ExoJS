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
    // Scaled AFTER the multiply, so a debug view can be brought into range
    // without touching a light, the transport or the bounce history. One at
    // every setting the renderer is actually asked to draw.
    fragColor = vec4(frame.rgb * light * uniforms.u_exposure, frame.a);
}
