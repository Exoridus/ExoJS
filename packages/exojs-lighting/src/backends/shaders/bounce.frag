#version 300 es
precision mediump float;

in vec2 v_texcoord;
// Where this fragment sat in the previous frame's camera, which is the frame
// the light field being read was gathered through.
in vec2 v_history;
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
    // Nothing outside the previous frame, and nothing at all until one has
    // been gathered: the light target holds whatever the driver left there
    // before the first gather and after every resize, and a surface the camera
    // has only just revealed was never lit. Both read as no bounce for a
    // frame, which is a defined value rather than an invented one.
    bool known = uniforms.uHistory > 0.5 && v_history.x >= 0.0 && v_history.x <= 1.0 && v_history.y >= 0.0 && v_history.y <= 1.0;
    vec3 light = known ? texture(u_light, v_history).rgb : vec3(0.0);

    // What a lit surface re-emits: its colour under last frame's light, scaled
    // down, and never more than its colour under full light - a surface next
    // to a lamp is lit many times over, and re-emitting that would feed the
    // lamp its own light back every frame. That ceiling is an artistic clamp,
    // not a conservation law: it bounds the feedback rather than accounting
    // for the energy a real surface would absorb. Alpha stays zero, so the
    // mask still reads a wall as a wall; this only gives it a colour for the
    // rays that end on it. A frame of latency is the price of not solving the
    // transport twice.
    fragColor = vec4(frame.rgb * min(light, vec3(1.0)) * v_tint.rgb, 0.0);
}
