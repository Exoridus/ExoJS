#version 300 es
precision mediump float;

in vec2 v_texcoord;
// Opaque white scaled by the bounce factor.
in vec4 v_tint;

// The frame the camera drew this frame: the albedo of whatever is there.
uniform sampler2D u_frame;
// The light field the cascades gathered LAST frame, which is what lit that
// albedo.
uniform sampler2D u_light;

out vec4 fragColor;

void main() {
    vec4 frame = texture(u_frame, v_texcoord);
    vec3 light = texture(u_light, v_texcoord).rgb;

    // What a lit surface re-emits: its colour under last frame's light, scaled
    // down, and never more than its colour under full light - a surface next
    // to a lamp is lit many times over, and re-emitting that would feed the
    // lamp its own light back every frame. Alpha stays zero, so the mask still
    // reads a wall as a wall; this only gives it a colour for the rays that end
    // on it. A frame of latency is the price of not solving the transport
    // twice.
    fragColor = vec4(frame.rgb * min(light, vec3(1.0)) * v_tint.rgb, 0.0);
}
