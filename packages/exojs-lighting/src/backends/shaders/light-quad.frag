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

// One row per shadowed light, two texels per angular bin: where the occluders
// in it are, as fractions of the light's radius, and which part of the bin each
// covers (see `buildShadowRow`). A row index below zero means this light sees
// no occluder at all.
uniform highp sampler2D u_shadow;
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
 * one fetch per bin the kernel touches, at most `2 * MAX_HALF + 3`, and two
 * more for each bin a silhouette or a corner falls in.
 *
 * It bounds the penumbra in BINS, so a larger `shadowResolution` buys a wider
 * kernel only up to here. Sampling every bin under the kernel is what keeps the
 * filter continuous, and a budget that did not bound the width would have to
 * skip bins to stay within itself.
 */
const int MAX_HALF = 10;
/** Fraction of a full turn the widest penumbra spans, before the bin bound above. */
const float MAX_PENUMBRA = 0.03;
/** Steps a partial span's ends are stored in; see `buildShadowRow`. */
const float SPAN_STEPS = 4095.0;

/**
 * Texel `part` (0 or 1) of bin `bin`; see `buildShadowRow` for what each holds.
 * The row is polar, so the index wraps.
 */
vec4 binAt(int bin, int part, int bins, int row) {
    int slot = bin - bins * int(floor(float(bin) / float(bins)));

    return texelFetch(u_shadow, ivec2(slot * 2 + part, row), 0);
}

/**
 * The share of the kernel - a unit-area tent of half-width `radius` around
 * `center` - that falls in `span`, all in bins; nothing where the span is empty.
 */
float tentMass(vec2 span, float center, float radius) {
    if (span.y <= span.x) {
        return 0.0;
    }

    vec2 u = clamp((span - center) / radius, -1.0, 1.0);
    vec2 area = u - u * abs(u) * 0.5;

    return area.y - area.x;
}

/**
 * Where within `from .. to` a face lies beyond `threshold` - the fragment's
 * distance less the clearance its own lit face is owed - when it runs straight
 * through `(x0, d0)` and `(x1, d1)`, positions in bins and distances in radii.
 *
 * Following the face rather than comparing against one distance per bin is
 * what keeps it straight where the light meets it at a slant, and keeps the
 * part beyond the threshold one span whose share of the kernel is exact.
 */
vec2 beyond(float d0, float d1, float x0, float x1, float threshold, float from, float to) {
    float slope = (d1 - d0) / (x1 - x0);

    if (abs(slope) < 1e-9) {
        return d0 > threshold ? vec2(from, to) : vec2(from, from);
    }

    // Where the face's distance meets the threshold, in bins.
    float crossing = x0 + (threshold - d0) / slope;

    return slope > 0.0 ? vec2(max(from, crossing), to) : vec2(from, min(to, crossing));
}

/**
 * One bin's part in the kernel: `x` the share the light reaches through, `y`
 * the bin's whole share, and `z` the blocked share weighted by the distance of
 * what blocks it, for the penumbra's width.
 *
 * Over its span a partial blocker is followed between its two ends, and light
 * gets through only where it also passes what covers the rest of the bin. A
 * bin with no partial blocker may hold a corner, where the rest bends.
 */
vec3 binTerm(int bin, vec4 texel, int bins, int row, float threshold, float center, float radius) {
    float low = float(bin) - 0.5;
    float high = low + 1.0;
    float mass = tentMass(vec2(low, high), center, radius);

    if (mass <= 0.0) {
        return vec3(0.0);
    }

    float open;
    float depth;

    if (texel.g > 0.0) {
        vec4 extra = binAt(bin, 1, bins, row);
        float steps = floor(texel.g / 4096.0);
        vec2 span = low + vec2(steps, texel.g - steps * 4096.0) / SPAN_STEPS;
        vec2 rest = beyond(texel.b, texel.a, low, high, threshold, span.x, span.y);
        vec2 own = beyond(texel.r, extra.r, span.x, span.y, threshold, span.x, span.y);

        open = tentMass(beyond(texel.b, texel.a, low, high, threshold, low, span.x), center, radius) +
            tentMass(beyond(texel.b, texel.a, low, high, threshold, span.y, high), center, radius) +
            tentMass(vec2(max(rest.x, own.x), min(rest.y, own.y)), center, radius);
        depth = min(0.5 * (texel.b + texel.a), 0.5 * (texel.r + extra.r));
    } else if (texel.g < 0.0) {
        vec4 extra = binAt(bin, 1, bins, row);
        float corner = low + extra.g;

        open = tentMass(beyond(texel.b, extra.b, low, corner, threshold, low, corner), center, radius) +
            tentMass(beyond(extra.b, texel.a, corner, high, threshold, corner, high), center, radius);
        depth = (texel.b + 2.0 * extra.b + texel.a) * 0.25;
    } else {
        open = tentMass(beyond(texel.b, texel.a, low, high, threshold, low, high), center, radius);
        depth = 0.5 * (texel.b + texel.a);
    }

    return vec3(open, mass, (mass - open) * depth);
}

/**
 * `threshold` comes from the RADIAL distance from the light's own position, as
 * a fraction of the light's whole reach - the frame the polar rows were built in.
 * The falloff term measures to the segment instead, which is a different
 * quantity for a line light and the same one for every other shape.
 *
 * The filter is a normalized tent over the bins the penumbra spans. Its taps
 * sit on the BINS, not on the fragment's own angle, and each one is weighted
 * by the share of the tent that falls on it: the weights then slide
 * continuously as the fragment moves, and a bin that enters or leaves the
 * window carries no weight at the moment it does. Within a bin, the parts a
 * silhouette covers and beyond a face are weighted by the share of the tent
 * over those parts alone, which keeps every edge where the geometry puts it,
 * moving smoothly with the occluder rather than a bin at a time.
 *
 * The tent's width is a penumbra's. A source of some size casts an edge that is
 * sharp where the shadow leaves its occluder and widens with the distance
 * behind it; a fixed angular width instead blurs the contact itself, spilling
 * light around the occluder's corners and into its own footprint. So the width
 * scales by `1 - blocker / fragment`, with the blocker's distance averaged over
 * what the widest kernel blocks: zero at the contact, the full width
 * `softness` asks for far behind - the edge of a disc source whose radius is
 * that width seen from the blocker. `footprint`, the fragment's angular size in
 * radians, sets the narrowest: half of it either side antialiases a hard edge
 * without lighting the fragment behind it.
 */
float shadowTerm(float threshold, float footprint) {
    if (v_shadowRow < 0.0) {
        return 1.0;
    }

    int bins = textureSize(u_shadow, 0).x / 2;
    int row = int(v_shadowRow);
    float narrowest = clamp(0.5 * footprint * float(bins) / (2.0 * PI), 0.02, float(MAX_HALF));
    float widest = clamp(narrowest + max(0.0, v_softness) * float(bins) * MAX_PENUMBRA, narrowest, float(MAX_HALF));
    float center = (atan(v_local.y, v_local.x) + PI) / (2.0 * PI) * float(bins) - 0.5;
    // Bin `i` spans `i - 0.5 .. i + 0.5` here, so these are the bins the tent touches.
    int base = int(floor(center + 0.5));
    int reach = int(ceil(widest + 0.5));
    vec4 texels[2 * MAX_HALF + 3];
    float blockedShare = 0.0;
    float blockedDistance = 0.0;

    for (int offset = -MAX_HALF - 1; offset <= MAX_HALF + 1; offset++) {
        if (offset < -reach || offset > reach) {
            continue;
        }

        vec4 texel = binAt(base + offset, 0, bins, row);
        vec3 term = binTerm(base + offset, texel, bins, row, threshold, center, widest);

        texels[offset + MAX_HALF + 1] = texel;
        blockedShare += term.y - term.x;
        blockedDistance += term.z;
    }

    float spread = blockedShare > 0.0 && threshold > 0.0 ? clamp(1.0 - blockedDistance / (blockedShare * threshold), 0.0, 1.0) : 1.0;
    float radius = narrowest + (widest - narrowest) * spread;
    int inner = int(ceil(radius + 0.5));
    float lit = 0.0;
    float total = 0.0;

    for (int offset = -MAX_HALF - 1; offset <= MAX_HALF + 1; offset++) {
        if (offset < -inner || offset > inner) {
            continue;
        }

        vec3 term = binTerm(base + offset, texels[offset + MAX_HALF + 1], bins, row, threshold, center, radius);

        lit += term.x;
        total += term.y;
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
    vec3 cookie = texture(u_cookie, vec2(v_local.x / (v_half + 1.0), v_local.y) * 0.5 + 0.5).rgb;
    float radial = length(v_local) / (v_half + 1.0);
    // How far the radial distance runs across this fragment: the light target's
    // own footprint in the row's units, whatever the light's reach, the camera's
    // zoom and turn, or the target's resolution. The clearance an occluder's lit
    // face is owed is measured in it; see `lightQuadUniforms`.
    float clearance = uniforms.u_shadowClearance * fwidth(radial);
    // A stored distance can have rounded towards the light by its format's
    // relative precision, which a far blocker in a half-float row turns into a
    // step of its own. Dividing that out of the fragment's side, once, is the
    // comparison against every stored distance widened by it.
    float threshold = (radial - clearance) / (1.0 + uniforms.u_shadowPrecision);
    // The fragment's own angular size, the narrowest a shadow edge can be drawn without aliasing.
    float footprint = max(length(dFdx(v_local)), length(dFdy(v_local))) / max(length(v_local), 1e-6);

    fragColor = vec4(v_tint.rgb * cookie * (falloff * falloff * coneTerm * v_intensity * shadowTerm(threshold, footprint) * surfaceTerm()), 1.0);
}
