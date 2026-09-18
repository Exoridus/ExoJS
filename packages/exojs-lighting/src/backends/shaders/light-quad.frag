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
/**
 * Widest kernel, as a half-width in bins, and therefore also the fetch budget:
 * one tap per bin, `2 * MAX_HALF + 1` of them.
 *
 * It bounds the penumbra in BINS, so a larger `shadowResolution` buys a
 * sharper hard edge rather than a wider softest penumbra. Sampling every bin
 * under the kernel is what keeps the filter continuous, and a budget that did
 * not bound the width would have to skip bins to stay within itself.
 */
const int MAX_HALF = 10;
/** Fraction of a full turn the widest penumbra spans, before the bin bound above. */
const float MAX_PENUMBRA = 0.03;
/** Tolerance, in radii, that keeps an occluder's own surface out of its shadow. */
const float SHADOW_BIAS = 0.004;
/**
 * Kernel half-width, in bins, at zero softness. The row samples each bin at
 * its centre and is accurate to half a bin, so a kernel narrower than this
 * would show the bin grid itself along an edge.
 */
const float MIN_RADIUS = 1.5;

/**
 * Whether the light reaches `distance` along bin `bin`, which wraps around the
 * circle.
 *
 * One comparison per bin, and the kernel below filters these ANSWERS. Blending
 * two stored blocker distances and comparing once instead describes a blocker
 * at a depth neither bin holds, which moves a hard edge around rather than
 * softening it - and a handful of such comparisons spread across a wide kernel
 * is what made one edge come out as several separate shadows.
 */
float visibleAt(int bin, int bins, int row, float distance) {
    int slot = bin - bins * int(floor(float(bin) / float(bins)));

    return step(distance, texelFetch(u_shadow, ivec2(slot, row), 0).r + SHADOW_BIAS);
}

/**
 * `distance` is the RADIAL distance from the light's own position, as a
 * fraction of the light's whole reach - the frame the polar rows were built in.
 * The falloff term measures to the segment instead, which is a different
 * quantity for a line light and the same one for every other shape.
 *
 * The filter is a normalized tent over the bins the penumbra spans. Its taps
 * sit on the BINS, not on the fragment's own angle, and each one is weighted
 * by how far that bin is from the angle: the weights then slide continuously
 * as the fragment moves, and the tap that enters or leaves the window as the
 * angle crosses a bin carries no weight at the moment it does. Placing the
 * taps at fixed offsets from the angle instead - and rounding each to a bin -
 * makes every weight constant and moves the whole window at once, which puts
 * a step the size of the centre tap back into the edge.
 *
 * It is an ANGULAR filter, not an area source: it widens the edge a point
 * source casts, and it does not make the shadow behave like one cast by a
 * disc of that size.
 */
float shadowTerm(float distance) {
    if (v_shadowRow < 0.0) {
        return 1.0;
    }

    int bins = textureSize(u_shadow, 0).x;
    int row = int(v_shadowRow);
    float radius = min(MIN_RADIUS + max(0.0, v_softness) * float(bins) * MAX_PENUMBRA, float(MAX_HALF));
    float center = (atan(v_local.y, v_local.x) + PI) / (2.0 * PI) * float(bins) - 0.5;
    int base = int(floor(center));
    int reach = int(ceil(radius));
    float lit = 0.0;
    float total = 0.0;

    for (int offset = -MAX_HALF; offset <= MAX_HALF; offset++) {
        if (offset < -reach || offset > reach) {
            continue;
        }

        int bin = base + offset;
        float weight = max(0.0, 1.0 - abs(float(bin) - center) / radius);

        if (weight <= 0.0) {
            continue;
        }

        lit += weight * visibleAt(bin, bins, row, distance);
        total += weight;
    }

    return total > 0.0 ? lit / total : 1.0;
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
    // Clamped onto the segment rather than folded by `abs`: the offset has to
    // keep its sign, or a cone light stops being able to tell ahead from
    // behind.
    vec2 toSegment = vec2(v_local.x - clamp(v_local.x, -v_half, v_half), v_local.y);
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
