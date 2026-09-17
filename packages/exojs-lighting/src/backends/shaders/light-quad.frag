#version 300 es
precision highp float;

in vec2 v_local;
in vec4 v_tint;
flat in vec2 v_cone;
flat in float v_intensity;
flat in float v_shadowRow;
flat in float v_softness;
// The light's radius and height in world units, and its own axis as a unit
// vector: what it takes to turn a fragment's light-space offset back into the
// world-space direction a surface normal can be measured against.
flat in vec4 v_surface;
flat in float v_half;

// One row per shadowed light: the distance to the nearest occluder along each
// angular bin, as a fraction of the light's radius. A row index below zero
// means this light sees no occluder at all.
uniform sampler2D u_shadow;
// The normal prepass, in screen space at this target's own size. Alpha is
// coverage: zero means nothing described a surface there.
uniform sampler2D u_normal;
// The pattern this batch's lights are shone through, across the light's own
// bounding square. Opaque white for a batch whose lights carry none.
uniform sampler2D u_cookie;

out vec4 fragColor;

const float PI = 3.14159265359;
const int SHADOW_TAPS = 5;
/** Fraction of a full turn the widest penumbra spans. */
const float MAX_PENUMBRA = 0.03;
/** Tolerance, in radii, that keeps an occluder's own surface out of its shadow. */
const float SHADOW_BIAS = 0.004;

/**
 * `distance` is the RADIAL distance from the light's own position, as a
 * fraction of the light's whole reach - the frame the polar rows were built in.
 * The falloff term measures to the segment instead, which is a different
 * quantity for a line light and the same one for every other shape.
 */
float shadowTerm(float distance) {
    if (v_shadowRow < 0.0) {
        return 1.0;
    }

    float bins = float(textureSize(u_shadow, 0).x);
    // A kernel narrower than one bin would alias along the bin grid, so one
    // bin is the floor: softness widens the penumbra from there.
    float spread = max(1.0, v_softness * bins * MAX_PENUMBRA);
    float center = (atan(v_local.y, v_local.x) + PI) / (2.0 * PI) * bins - 0.5;
    int row = int(v_shadowRow);
    float lit = 0.0;

    for (int tap = 0; tap < SHADOW_TAPS; tap++) {
        float offset = (float(tap) / float(SHADOW_TAPS - 1) - 0.5) * 2.0 * spread;
        int bin = int(mod(floor(center + offset + 0.5), bins));

        lit += step(distance, texelFetch(u_shadow, ivec2(bin, row), 0).r + SHADOW_BIAS);
    }

    return lit / float(SHADOW_TAPS);
}

/**
 * How much of this light the surface under the fragment actually faces.
 *
 * `1` wherever nothing described a surface, which is what keeps an
 * unregistered drawable lit exactly as it was before the prepass existed - the
 * flat normal's own `N dot L` would darken it by the grazing factor instead.
 */
float surfaceTerm() {
    vec2 uv = gl_FragCoord.xy / vec2(textureSize(u_normal, 0));
    vec4 encoded = texture(u_normal, uv);

    if (encoded.a <= 0.0) {
        return 1.0;
    }

    // Stored premultiplied by coverage, so the encoding comes back by dividing
    // it out again.
    vec3 normal = normalize((encoded.rgb / encoded.a) * 2.0 - 1.0);
    // `v_local` is in the light's own frame; the prepass wrote world-space
    // normals, so the offset has to be turned back by the light's axis.
    vec2 axis = v_surface.zw;
    vec2 world = vec2(axis.x * v_local.x - axis.y * v_local.y, axis.y * v_local.x + axis.x * v_local.y);

    return max(dot(normal, normalize(vec3(-world * v_surface.x, v_surface.y))), 0.0);
}

void main() {
    // Distance to the segment, not to the centre: folding `x` onto the segment
    // first is what turns the disc into a capsule, and `v_half == 0` leaves the
    // disc exactly as it was.
    vec2 toSegment = vec2(max(abs(v_local.x) - v_half, 0.0), v_local.y);
    float distance = length(toSegment);
    float falloff = clamp(1.0 - distance, 0.0, 1.0);

    // A point light writes both cone cosines as -1, which no direction can
    // fail, so one expression serves both shapes without a branch.
    vec2 direction = distance > 0.0 ? toSegment / distance : vec2(1.0, 0.0);
    float alignment = direction.x;
    float coneTerm = v_cone.x == v_cone.y ? step(v_cone.x, alignment) : smoothstep(v_cone.x, v_cone.y, alignment);

    // The quad spans -1..1 in the light's own frame, which is the cookie's 0..1
    // exactly - so the pattern turns and scales with the light for free, and a
    // premultiplied texel that is transparent contributes nothing.
    vec3 cookie = texture(u_cookie, v_local * 0.5 + 0.5).rgb;

    fragColor = vec4(v_tint.rgb * cookie * (falloff * falloff * coneTerm * v_intensity * shadowTerm(length(v_local) / (v_half + 1.0)) * surfaceTerm()), 1.0);
}
