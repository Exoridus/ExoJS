// Vertex stage of one occluder segment drawn as a thin quad. The instance
// transform maps the unit quad onto the segment, so the geometry is shared and
// the segment count is an instance count.
out vec4 v_tint;

void main() {
    gl_Position = vec4(exoInstanceClipPosition(a_position, a_nodeIndex), 0.0, 1.0);
    v_tint = exoInstanceTint(a_nodeIndex);
}
