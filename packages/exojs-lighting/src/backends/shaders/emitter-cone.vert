// Vertex stage of one emitter's cone, over the same capsule as its colour.
in vec4 a_emit;
in vec4 a_cone;

out vec2 v_local;
out vec4 v_tint;
flat out vec4 v_emit;
flat out vec4 v_cone;

void main() {
    gl_Position = vec4(exoInstanceClipPosition(a_position, a_nodeIndex), 0.0, 1.0);
    float extent = 1.0 + a_emit.y;
    v_local = vec2(a_position.x * (a_emit.z + extent), a_position.y * extent);
    v_tint = exoInstanceTint(a_nodeIndex);
    v_emit = a_emit;
    v_cone = a_cone;
}
