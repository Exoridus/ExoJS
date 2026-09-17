// Vertex stage of one light quad. The instance transform carries the light's
// position and its radius as a scale, so the geometry is a unit quad and the
// fragment stage works in a radius-normalized space that needs no world
// coordinates of its own.
in vec3 a_light;

out vec2 v_local;
out vec4 v_tint;
flat out vec2 v_cone;
flat out float v_intensity;

void main() {
    gl_Position = vec4(exoInstanceClipPosition(a_position, a_nodeIndex), 0.0, 1.0);
    v_local = a_position;
    v_tint = exoInstanceTint(a_nodeIndex);
    v_cone = vec2(a_light.x, a_light.y);
    v_intensity = a_light.z;
}
