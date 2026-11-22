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
 * one fetch per bin the widest kernel touches, at most `2 * MAX_HALF + 3`;
 * where the kernel meets a shadow's edge, as many again for its actual width
 * and one more for each bin a silhouette or a corner falls in.
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
    // A span rounded to no width at all stands for the distance at its start.
    float slope = x1 > x0 ? (d1 - d0) / (x1 - x0) : 0.0;

    if (abs(slope) < 1e-9) {
        return d0 > threshold ? vec2(from, to) : vec2(from, from);
    }

    // Where the face's distance meets the threshold, in bins.
    float crossing = x0 + (threshold - d0) / slope;

    return slope > 0.0 ? vec2(max(from, crossing), to) : vec2(from, min(to, crossing));
}

/**
 * Where within `x0 .. x1` a face through `(x0, d0)` and `(x1, d1)` stands
 * in front of `threshold`: what `beyond` leaves of the span.
 */
vec2 within(float d0, float d1, float x0, float x1, float threshold) {
    vec2 open = beyond(d0, d1, x0, x1, threshold, x0, x1);

    if (open.y <= open.x) {
        return vec2(x0, x1);
    }

    return open.x > x0 ? vec2(x0, open.x) : vec2(open.y, x1);
}

vec2 overlap(vec2 a, vec2 b) {
    return vec2(max(a.x, b.x), min(a.y, b.y));
}

/**
 * One bin's part in the kernel: `x` the share the light reaches through and `y`
 * the bin's whole share.
 *
 * Over its span a partial blocker is followed between its two ends, and light
 * gets through only where it also passes what covers the rest of the bin. A
 * bin with no partial blocker may hold a corner, where the rest bends.
 */
vec2 binTerm(int bin, float low, vec4 texel, int bins, int row, float threshold, float center, float radius) {
    float high = low + 1.0;
    float mass = tentMass(vec2(low, high), center, radius);

    if (mass <= 0.0) {
        return vec2(0.0);
    }

    // Wholly in front of the face, or wholly behind it: most bins under a
    // kernel, which need no span of their own.
    if (texel.g == 0.0 && min(texel.b, texel.a) > threshold) {
        return vec2(mass);
    }

    if (texel.g == 0.0 && max(texel.b, texel.a) <= threshold) {
        return vec2(0.0, mass);
    }

    float open;

    // The second texel, read only where the first says there is something in it.
    vec4 extra = texel.g != 0.0 ? binAt(bin, 1, bins, row) : vec4(0.0);

    if (texel.g > 0.0 && extra.g >= 1.0) {
        // Two partial blockers: light reaches through where the rest of the
        // bin lets it and neither blocker's part stands in front of it.
        float steps = floor(texel.g / 4096.0);
        float stepsSecond = floor(extra.g / 4096.0);
        vec2 span = low + vec2(steps, texel.g - steps * 4096.0) / SPAN_STEPS;
        vec2 spanSecond = low + vec2(stepsSecond, extra.g - stepsSecond * 4096.0) / SPAN_STEPS;
        vec2 rest = beyond(texel.b, texel.a, low, high, threshold, low, high);
        vec2 first = overlap(rest, within(texel.r, extra.r, span.x, span.y, threshold));
        vec2 second = overlap(rest, within(extra.b, extra.a, spanSecond.x, spanSecond.y, threshold));

        open = tentMass(rest, center, radius) - tentMass(first, center, radius) - tentMass(second, center, radius) +
            tentMass(overlap(first, second), center, radius);
    } else if (texel.g > 0.0) {
        float steps = floor(texel.g / 4096.0);
        vec2 span = low + vec2(steps, texel.g - steps * 4096.0) / SPAN_STEPS;
        // Where the part bends - two faces meeting inside it - it is followed
        // to the corner and on from there; otherwise straight from end to end.
        float corner = extra.g > 0.0 && extra.g < 1.0 ? low + extra.g : span.y;
        float cornerDistance = extra.g > 0.0 && extra.g < 1.0 ? extra.b : extra.r;
        vec2 rest = beyond(texel.b, texel.a, low, high, threshold, span.x, corner);
        vec2 own = beyond(texel.r, cornerDistance, span.x, corner, threshold, span.x, corner);
        vec2 restBeyond = beyond(texel.b, texel.a, low, high, threshold, corner, span.y);
        vec2 ownBeyond = beyond(cornerDistance, extra.r, corner, span.y, threshold, corner, span.y);

        open = tentMass(beyond(texel.b, texel.a, low, high, threshold, low, span.x), center, radius) +
            tentMass(beyond(texel.b, texel.a, low, high, threshold, span.y, high), center, radius) +
            tentMass(vec2(max(rest.x, own.x), min(rest.y, own.y)), center, radius) +
            tentMass(vec2(max(restBeyond.x, ownBeyond.x), min(restBeyond.y, ownBeyond.y)), center, radius);
    } else if (texel.g < 0.0) {
        float corner = low + extra.g;

        open = tentMass(beyond(texel.b, extra.b, low, corner, threshold, low, corner), center, radius) +
            tentMass(beyond(extra.b, texel.a, corner, high, threshold, corner, high), center, radius);
    } else {
        open = tentMass(beyond(texel.b, texel.a, low, high, threshold, low, high), center, radius);
    }

    return vec2(open, mass);
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
float shadowTerm(vec2 rayLocal, float shadowRow, float threshold, float footprint) {
    if (shadowRow < 0.0) {
        return 1.0;
    }

    int bins = textureSize(u_shadow, 0).x / 2;
    int row = int(shadowRow);
    float narrowest = clamp(0.5 * footprint * float(bins) / (2.0 * PI), 0.02, float(MAX_HALF));
    float widest = clamp(narrowest + max(0.0, v_softness) * float(bins) * MAX_PENUMBRA, narrowest, float(MAX_HALF));
    float angle = (atan(rayLocal.y, rayLocal.x) + PI) / (2.0 * PI) * float(bins) - 0.5;
    // Bin `i` spans `i - 0.5 .. i + 0.5` here, so these are the bins the tent
    // touches. Everything after is measured from `base`: a bin index in the
    // thousands leaves too few bits for a fraction of a bin.
    int base = int(floor(angle + 0.5));
    float center = angle - float(base);
    int reach = int(ceil(widest + 0.5));
    // The blocker search sets only the kernel's width, so an estimate does:
    // how much of the widest kernel is blocked and how far away, continuous in
    // the fragment's angle and distance. It also says exactly when nothing or
    // everything under the kernel blocks, where a narrower kernel over the same
    // bins cannot answer differently and no second pass is owed - most of a
    // light's area.
    float blockedShare = 0.0;
    float blockedDistance = 0.0;
    bool open = true;
    bool closed = true;

    for (int offset = -MAX_HALF - 1; offset <= MAX_HALF + 1; offset++) {
        if (offset < -reach || offset > reach) {
            continue;
        }

        int bin = base + offset;
        vec4 texel = binAt(bin, 0, bins, row);
        float near = min(texel.b, texel.a);
        float far = max(texel.b, texel.a);
        float weight = max(0.0, 1.0 - abs(float(offset) - center) / (widest + 0.5));
        float blocked = clamp((threshold - near) / max(far - near, 1e-4), 0.0, 1.0);
        float depth = 0.5 * (near + far);

        if (texel.g > 0.0) {
            // The part's share of the bin, ramped in past its distance so the
            // estimate - and the kernel's width - never jumps there.
            float steps = floor(texel.g / 4096.0);
            float part = (texel.g - steps * 4097.0) / SPAN_STEPS * clamp((threshold - texel.r) / max(0.02 * texel.r, 1e-4), 0.0, 1.0);

            depth = (blocked * depth + part * texel.r) / max(blocked + part, 1e-6);
            blocked = min(1.0, blocked + part);
        }

        // A partial blocker or a corner needs the bin's second texel to be sure of.
        open = open && texel.g == 0.0 && near > threshold;
        closed = closed && texel.g == 0.0 && far < threshold;
        blockedShare += weight * blocked;
        blockedDistance += weight * blocked * depth;
    }

    if (open) {
        return 1.0;
    }

    if (closed) {
        return 0.0;
    }

    // Nothing blocking yet means the fragment is in front of whatever is there,
    // where the penumbra has not begun.
    float spread = blockedShare > 0.0 && threshold > 0.0 ? clamp(1.0 - blockedDistance / (blockedShare * threshold), 0.0, 1.0) : 0.0;
    float radius = narrowest + (widest - narrowest) * spread;
    int inner = int(ceil(radius + 0.5));
    float lit = 0.0;
    float total = 0.0;

    for (int offset = -MAX_HALF - 1; offset <= MAX_HALF + 1; offset++) {
        if (offset < -inner || offset > inner) {
            continue;
        }

        // Fetched again rather than kept from the first pass: an array indexed
        // by the loop spills out of registers, which costs far more than a
        // texel the cache still holds.
        vec2 term = binTerm(base + offset, float(offset) - 0.5, binAt(base + offset, 0, bins, row), bins, row, threshold, center, radius);

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

    // A finite line is a source with multiple emission positions, not one
    // point at its centre. The four consecutive shadow rows were traced from
    // [-.75,-.25,.25,.75] of its half-length. For each ray, compare its OWN
    // distance to the blockers in that row; averaging the old central-angle
    // shadow would not move the silhouette with the source.
    float shadow = 1.0;

    if (v_half > 0.0 && v_shadowRow >= 0.0) {
        float pixelSpan = max(length(dFdx(v_local)), length(dFdy(v_local)));
        float sourceReach = 1.0 + 2.0 * v_half;
        float sampleClearance = uniforms.u_shadowClearance * pixelSpan / sourceReach;
        float sum = 0.0;
        float weights = 0.0;

        for (int sampleIndex = 0; sampleIndex < 4; sampleIndex++) {
            float offset = v_half * ((float(sampleIndex) - 1.5) * 0.5);
            vec2 ray = v_local - vec2(offset, 0.0);
            float rayDistance = length(ray);
            float sampleThreshold = (rayDistance / sourceReach - sampleClearance) / (1.0 + uniforms.u_shadowPrecision);
            float sampleFootprint = pixelSpan / max(rayDistance, 1e-6);
            // Inverse-square weighting avoids distant parts of a long line
            // dominating the shadow where only the near segment illuminates.
            float weight = 1.0 / (1.0 + rayDistance * rayDistance);

            sum += weight * shadowTerm(ray, v_shadowRow + float(sampleIndex), sampleThreshold, sampleFootprint);
            weights += weight;
        }

        shadow = sum / max(weights, 1e-6);
    } else {
        // Exact legacy path for point/spot and unshadowed lights.
        shadow = shadowTerm(v_local, v_shadowRow, threshold, footprint);
    }

    fragColor = vec4(v_tint.rgb * cookie * (falloff * falloff * coneTerm * v_intensity * shadow * surfaceTerm()), 1.0);
}
