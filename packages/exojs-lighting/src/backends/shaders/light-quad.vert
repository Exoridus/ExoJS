// Vertex stage of one light quad. The instance transform carries the light's
// position, its radius as a scale and, for a cone, its rotation, so the
// geometry is a unit quad and the fragment stage works in a radius-normalized
// space aligned with the light's own axis.
in vec4 a_light;
in vec2 a_shadow;
in vec4 a_surface;

out vec2 v_local;
out vec4 v_tint;
flat out vec2 v_cone;
flat out float v_intensity;
flat out float v_shadowRow;
flat out float v_softness;
flat out vec4 v_surface;
flat out float v_half;

void main() {
    gl_Position = vec4(exoInstanceClipPosition(a_position, a_nodeIndex), 0.0, 1.0);
    // Half the emitting segment, in falloff radii. The quad is stretched by the
    // same amount along the light's axis, so the fragment stage still measures
    // in radii and a light that emits from a point (`a_light.w == 0`) collapses
    // to the square it always was.
    v_half = a_light.w;
    v_local = vec2(a_position.x * (v_half + 1.0), a_position.y);
    v_tint = exoInstanceTint(a_nodeIndex);
    v_cone = vec2(a_light.x, a_light.y);
    v_intensity = a_light.z;
    v_shadowRow = a_shadow.x;
    v_softness = a_shadow.y;
    v_surface = a_surface;
}
