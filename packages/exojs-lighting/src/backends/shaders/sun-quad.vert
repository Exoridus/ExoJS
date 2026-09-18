// Vertex stage of one directional light. Its quad is the camera's own world
// box, so there is no radius to normalize by: what the fragment stage needs is
// the fragment's place along the light and across it, and both are affine in
// world position, so they interpolate exactly.
in vec4 a_box;
in vec4 a_sun;
in vec4 a_range;
in vec2 a_beam;

out vec2 v_sun;
out vec4 v_tint;
flat out vec3 v_toLight;
flat out float v_shadowRow;
flat out float v_softness;
flat out float v_intensity;

void main() {
    gl_Position = vec4(exoInstanceClipPosition(a_position, a_nodeIndex), 0.0, 1.0);

    vec2 world = a_box.xy + a_box.zw * a_position;
    vec2 along = a_sun.xy;
    vec2 across = vec2(-along.y, along.x);

    // x: which strip of the shadow row this fragment falls in, in 0..1.
    // y: how far along the light it sits, in the same 0..1 the row stores.
    v_sun = vec2((dot(world, across) - a_range.x) / a_range.y, (dot(world, along) - a_range.z) / a_range.w);
    v_tint = exoInstanceTint(a_nodeIndex);
    // Towards the light, which for a source at no particular distance is the
    // same everywhere. `a_sun.z` is a slope rather than a height.
    v_toLight = normalize(vec3(-along, a_sun.z));
    v_shadowRow = a_sun.w;
    v_intensity = a_beam.x;
    v_softness = a_beam.y;
}
