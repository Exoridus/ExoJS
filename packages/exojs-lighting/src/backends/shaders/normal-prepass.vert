// Vertex stage of one normal-prepass quad. The instance transform maps the unit
// quad onto the drawable's own box in world space, so the fragment stage works
// in the drawable's local 0..1 space. The frame rectangle and the local-to-world
// basis travel as instance attributes because a batch material has neither the
// sprite pipeline's atlas slot nor its basis varying.
in vec4 a_frame;
in vec4 a_basis;

out vec2 v_uv;
flat out vec4 v_basis;

void main() {
    gl_Position = vec4(exoInstanceClipPosition(a_position, a_nodeIndex), 0.0, 1.0);
    v_uv = a_frame.xy + a_position * a_frame.zw;
    v_basis = a_basis;
}
