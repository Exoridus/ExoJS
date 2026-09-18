// Vertex stage of one emitter. The instance transform carries the emitter's
// position and its own size as a scale, so the geometry is a unit quad and the
// fragment stage measures in emitter radii.
in vec4 a_emit;

out vec2 v_local;
out vec4 v_tint;
flat out vec4 v_emit;

void main() {
    gl_Position = vec4(exoInstanceClipPosition(a_position, a_nodeIndex), 0.0, 1.0);
    // Stretched along the emitter's own axis by its half-length, so a segment
    // emitter is a capsule and one that emits from a point is the disc it was,
    // and widened by the halo the radiance extends past the shape.
    float extent = 1.0 + a_emit.y;
    v_local = vec2(a_position.x * (a_emit.z + extent), a_position.y * extent);
    v_tint = exoInstanceTint(a_nodeIndex);
    v_emit = a_emit;
}
