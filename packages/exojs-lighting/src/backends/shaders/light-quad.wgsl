// One light quad: the instance transform carries position, radius and, for a
// cone, rotation, so the fragment stage works in radius-normalized space
// aligned with the light's axis and needs no world coordinates of its own. The
// engine prepends the instancing contract.
struct VertexInput {
    @location(0) position: vec2<f32>,
    @location(6) nodeIndex: u32,
    @location(7) light: vec4<f32>,
    @location(8) shadow: vec2<f32>,
    @location(9) surface: vec4<f32>,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) local: vec2<f32>,
    @location(1) tint: vec4<f32>,
    @location(2) @interpolate(flat) cone: vec2<f32>,
    @location(3) @interpolate(flat) intensity: f32,
    @location(4) @interpolate(flat) shadowRow: f32,
    @location(5) @interpolate(flat) softness: f32,
    // The light's radius and height in world units, and its own axis as a unit
    // vector: what it takes to turn a fragment's light-space offset back into
    // the world-space direction a surface normal can be measured against.
    @location(6) @interpolate(flat) surface: vec4<f32>,
    // Half the emitting segment, in falloff radii. Zero for every shape that
    // emits from a point.
    @location(7) @interpolate(flat) half: f32,
};

// One row per shadowed light, two texels per angular bin: where the occluders
// in it are, as fractions of the light's radius, and which part of the bin each
// covers (see `buildShadowRow`). A row index below zero means this light sees
// no occluder at all.
@group(2) @binding(1) var u_shadow: texture_2d<f32>;
@group(2) @binding(2) var u_shadowSampler: sampler;
// The normal prepass, in screen space at this target's own size. Alpha is
// coverage: zero means nothing described a surface there.
@group(2) @binding(3) var u_normal: texture_2d<f32>;
@group(2) @binding(4) var u_normalSampler: sampler;
// The pattern this batch's lights are shone through, across the light's own
// bounding square. Opaque white for a batch whose lights carry none.
@group(2) @binding(5) var u_cookie: texture_2d<f32>;
@group(2) @binding(6) var u_cookieSampler: sampler;

const PI: f32 = 3.14159265359;
/** Widest kernel, as a half-width in bins, and the fetch budget. See `light-quad.frag`. */
const MAX_HALF: i32 = 10;
/** Fraction of a full turn the widest penumbra spans, before the bin bound above. */
const MAX_PENUMBRA: f32 = 0.03;
/** Steps a partial span's ends are stored in; see `buildShadowRow`. */
const SPAN_STEPS: f32 = 4095.0;

/** Texel `part` (0 or 1) of bin `bin`; see `buildShadowRow`. The row is polar, so the index wraps. */
fn binAt(bin: i32, part: i32, bins: i32, row: i32) -> vec4<f32> {
    let slot = bin - bins * i32(floor(f32(bin) / f32(bins)));

    return textureLoad(u_shadow, vec2<i32>(slot * 2 + part, row), 0);
}

/** The share of the unit-area tent around `center` that falls in `span`; nothing where it is empty. */
fn tentMass(span: vec2<f32>, center: f32, radius: f32) -> f32 {
    if (span.y <= span.x) {
        return 0.0;
    }

    let u = clamp((span - center) / radius, vec2<f32>(-1.0), vec2<f32>(1.0));
    let area = u - u * abs(u) * 0.5;

    return area.y - area.x;
}

/** Where within `lower .. upper` a face through `(x0, d0)` and `(x1, d1)` lies beyond `threshold`. See `light-quad.frag`. */
fn beyond(d0: f32, d1: f32, x0: f32, x1: f32, threshold: f32, lower: f32, upper: f32) -> vec2<f32> {
    // A span rounded to no width at all stands for the distance at its start.
    var slope = 0.0;

    if (x1 > x0) {
        slope = (d1 - d0) / (x1 - x0);
    }

    if (abs(slope) < 1e-9) {
        return select(vec2<f32>(lower, lower), vec2<f32>(lower, upper), d0 > threshold);
    }

    // Where the face's distance meets the threshold, in bins.
    let crossing = x0 + (threshold - d0) / slope;

    if (slope > 0.0) {
        return vec2<f32>(max(lower, crossing), upper);
    }

    return vec2<f32>(lower, min(upper, crossing));
}

/** Where within `x0 .. x1` a face stands in front of `threshold`. See `light-quad.frag`. */
fn within(d0: f32, d1: f32, x0: f32, x1: f32, threshold: f32) -> vec2<f32> {
    let open = beyond(d0, d1, x0, x1, threshold, x0, x1);

    if (open.y <= open.x) {
        return vec2<f32>(x0, x1);
    }

    return select(vec2<f32>(open.y, x1), vec2<f32>(x0, open.x), open.x > x0);
}

fn overlap(a: vec2<f32>, b: vec2<f32>) -> vec2<f32> {
    return vec2<f32>(max(a.x, b.x), min(a.y, b.y));
}

/** One bin's part in the kernel: the share the light reaches through, and its whole share. See `light-quad.frag`. */
fn binTerm(bin: i32, low: f32, texel: vec4<f32>, bins: i32, row: i32, threshold: f32, center: f32, radius: f32) -> vec2<f32> {
    let high = low + 1.0;
    let mass = tentMass(vec2<f32>(low, high), center, radius);

    if (mass <= 0.0) {
        return vec2<f32>(0.0);
    }

    // Wholly in front of the face, or wholly behind it; see `light-quad.frag`.
    if (texel.g == 0.0 && min(texel.b, texel.a) > threshold) {
        return vec2<f32>(mass);
    }

    if (texel.g == 0.0 && max(texel.b, texel.a) <= threshold) {
        return vec2<f32>(0.0, mass);
    }

    var open: f32;

    var extra = vec4<f32>(0.0);

    if (texel.g != 0.0) {
        extra = binAt(bin, 1, bins, row);
    }

    if (texel.g > 0.0 && extra.g >= 1.0) {
        // Two partial blockers; see `light-quad.frag`.
        let steps = floor(texel.g / 4096.0);
        let stepsSecond = floor(extra.g / 4096.0);
        let span = low + vec2<f32>(steps, texel.g - steps * 4096.0) / SPAN_STEPS;
        let spanSecond = low + vec2<f32>(stepsSecond, extra.g - stepsSecond * 4096.0) / SPAN_STEPS;
        let rest = beyond(texel.b, texel.a, low, high, threshold, low, high);
        let first = overlap(rest, within(texel.r, extra.r, span.x, span.y, threshold));
        let second = overlap(rest, within(extra.b, extra.a, spanSecond.x, spanSecond.y, threshold));

        open = tentMass(rest, center, radius) - tentMass(first, center, radius) - tentMass(second, center, radius) +
            tentMass(overlap(first, second), center, radius);
    } else if (texel.g > 0.0) {
        let steps = floor(texel.g / 4096.0);
        let span = low + vec2<f32>(steps, texel.g - steps * 4096.0) / SPAN_STEPS;
        // Followed to a corner where two faces meet inside the part, and on
        // from there; see `light-quad.frag`.
        let corner = select(span.y, low + extra.g, extra.g > 0.0 && extra.g < 1.0);
        let cornerDistance = select(extra.r, extra.b, extra.g > 0.0 && extra.g < 1.0);
        let rest = beyond(texel.b, texel.a, low, high, threshold, span.x, corner);
        let own = beyond(texel.r, cornerDistance, span.x, corner, threshold, span.x, corner);
        let restBeyond = beyond(texel.b, texel.a, low, high, threshold, corner, span.y);
        let ownBeyond = beyond(cornerDistance, extra.r, corner, span.y, threshold, corner, span.y);

        open = tentMass(beyond(texel.b, texel.a, low, high, threshold, low, span.x), center, radius) +
            tentMass(beyond(texel.b, texel.a, low, high, threshold, span.y, high), center, radius) +
            tentMass(vec2<f32>(max(rest.x, own.x), min(rest.y, own.y)), center, radius) +
            tentMass(vec2<f32>(max(restBeyond.x, ownBeyond.x), min(restBeyond.y, ownBeyond.y)), center, radius);
    } else if (texel.g < 0.0) {
        let corner = low + extra.g;

        open = tentMass(beyond(texel.b, extra.b, low, corner, threshold, low, corner), center, radius) +
            tentMass(beyond(extra.b, texel.a, corner, high, threshold, corner, high), center, radius);
    } else {
        open = tentMass(beyond(texel.b, texel.a, low, high, threshold, low, high), center, radius);
    }

    return vec2<f32>(open, mass);
}

/** The shadow filter and its penumbra width. See `shadowTerm` in `light-quad.frag`. */
fn shadowTerm(local: vec2<f32>, threshold: f32, shadowRow: f32, softness: f32, footprint: f32) -> f32 {
    let bins = i32(textureDimensions(u_shadow, 0).x) / 2;
    let row = i32(shadowRow);
    let narrowest = clamp(0.5 * footprint * f32(bins) / (2.0 * PI), 0.02, f32(MAX_HALF));
    let widest = clamp(narrowest + max(0.0, softness) * f32(bins) * MAX_PENUMBRA, narrowest, f32(MAX_HALF));
    let angle = (atan2(local.y, local.x) + PI) / (2.0 * PI) * f32(bins) - 0.5;
    // Bin `i` spans `i - 0.5 .. i + 0.5` here; measured from `base` after, so a
    // fraction of a bin keeps its bits; see `light-quad.frag`.
    let base = i32(floor(angle + 0.5));
    let center = angle - f32(base);
    let reach = i32(ceil(widest + 0.5));

    // The blocker search, an estimate that sets only the kernel's width and
    // says exactly when no second pass is owed; see `light-quad.frag`.
    var blockedShare = 0.0;
    var blockedDistance = 0.0;
    var open = true;
    var closed = true;

    for (var offset: i32 = -MAX_HALF - 1; offset <= MAX_HALF + 1; offset = offset + 1) {
        if (offset < -reach || offset > reach) {
            continue;
        }

        let bin = base + offset;
        let texel = binAt(bin, 0, bins, row);
        let near = min(texel.b, texel.a);
        let far = max(texel.b, texel.a);
        let weight = max(0.0, 1.0 - abs(f32(offset) - center) / (widest + 0.5));
        var blocked = clamp((threshold - near) / max(far - near, 1e-4), 0.0, 1.0);
        var depth = 0.5 * (near + far);

        if (texel.g > 0.0) {
            // The part's share of the bin, ramped in past its distance; see `light-quad.frag`.
            let steps = floor(texel.g / 4096.0);
            let part = (texel.g - steps * 4097.0) / SPAN_STEPS * clamp((threshold - texel.r) / max(0.02 * texel.r, 1e-4), 0.0, 1.0);

            depth = (blocked * depth + part * texel.r) / max(blocked + part, 1e-6);
            blocked = min(1.0, blocked + part);
        }

        // A partial blocker or a corner needs the bin's second texel to be sure of.
        open = open && texel.g == 0.0 && near > threshold;
        closed = closed && texel.g == 0.0 && far < threshold;
        blockedShare = blockedShare + weight * blocked;
        blockedDistance = blockedDistance + weight * blocked * depth;
    }

    if (open) {
        return 1.0;
    }

    if (closed) {
        return 0.0;
    }

    // Nothing blocking yet: in front of whatever is there, no penumbra begun.
    var spread = 0.0;

    if (blockedShare > 0.0 && threshold > 0.0) {
        spread = clamp(1.0 - blockedDistance / (blockedShare * threshold), 0.0, 1.0);
    }

    let radius = narrowest + (widest - narrowest) * spread;
    let inner = i32(ceil(radius + 0.5));

    var lit = 0.0;
    var total = 0.0;

    for (var offset: i32 = -MAX_HALF - 1; offset <= MAX_HALF + 1; offset = offset + 1) {
        if (offset < -inner || offset > inner) {
            continue;
        }

        // Fetched again rather than kept from the first pass; see `light-quad.frag`.
        let term = binTerm(base + offset, f32(offset) - 0.5, binAt(base + offset, 0, bins, row), bins, row, threshold, center, radius);

        lit = lit + term.x;
        total = total + term.y;
    }

    return select(1.0, lit / total, total > 0.0);
}

/**
 * How much of this light the surface under the fragment actually faces.
 *
 * `1` wherever nothing described a surface, which is what keeps an
 * unregistered drawable lit exactly as it was before the prepass existed - the
 * flat normal's own `N dot L` would darken it by the grazing factor instead.
 */
fn surfaceTerm(fragment: vec2<f32>, local: vec2<f32>, surface: vec4<f32>) -> f32 {
    let uv = fragment / vec2<f32>(textureDimensions(u_normal, 0));
    let encoded = textureSample(u_normal, u_normalSampler, uv);

    if (encoded.a <= 0.0) {
        return 1.0;
    }

    // Stored premultiplied by coverage, so the encoding comes back by dividing
    // it out again.
    let normal = normalize((encoded.rgb / encoded.a) * 2.0 - 1.0);
    // `local` is in the light's own frame; the prepass wrote world-space
    // normals, so the offset has to be turned back by the light's axis.
    let axis = surface.zw;
    let world = vec2<f32>(axis.x * local.x - axis.y * local.y, axis.y * local.x + axis.x * local.y);

    return max(dot(normal, normalize(vec3<f32>(-world * surface.x, surface.y))), 0.0);
}

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;

    output.position = vec4<f32>(exoInstanceClipPosition(input.position, input.nodeIndex), 0.0, 1.0);
    // The quad is stretched along the light's axis by the same amount, so the
    // fragment stage still measures in radii.
    output.half = input.light.w;
    output.local = vec2<f32>(input.position.x * (input.light.w + 1.0), input.position.y);
    output.tint = exoInstanceTint(input.nodeIndex);
    output.cone = vec2<f32>(input.light.x, input.light.y);
    output.intensity = input.light.z;
    output.shadowRow = input.shadow.x;
    output.softness = input.shadow.y;
    output.surface = input.surface;

    return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
    let radial = length(input.local) / (input.half + 1.0);
    // How far the radial distance runs across this fragment; see
    // `light-quad.frag`. Taken first, while control flow is still uniform.
    let clearance = uniforms.u_shadowClearance * fwidth(radial);
    // Rounding of the stored distance, divided out of the fragment's side once;
    // see `light-quad.frag`.
    let rounding = 1.0 + uniforms.u_shadowPrecision;
    // The fragment's span in the light's frame; see `light-quad.frag`. Also
    // taken while control flow is uniform, before the per-sample loop.
    let pixelSpan = max(length(dpdx(input.local)), length(dpdy(input.local)));

    // Distance to the segment, not to the centre: folding `x` onto the segment
    // first is what turns the disc into a capsule, and a zero half-length
    // leaves the disc exactly as it was.
    // Clamped onto the segment rather than folded by `abs`: the offset has to
    // keep its sign, or a cone light stops being able to tell ahead from
    // behind.
    let toSegment = vec2<f32>(input.local.x - clamp(input.local.x, -input.half, input.half), input.local.y);
    let distance = length(toSegment);
    let falloff = clamp(1.0 - distance, 0.0, 1.0);

    // A point light writes both cone cosines as -1, which no direction can
    // fail, so one expression serves both shapes.
    var direction = vec2<f32>(1.0, 0.0);

    if (distance > 0.0) {
        direction = toSegment / distance;
    }

    let alignment = direction.x;
    var coneTerm = smoothstep(input.cone.x, input.cone.y, alignment);

    if (input.cone.x == input.cone.y) {
        coneTerm = step(input.cone.x, alignment);
    }

    // One row per emitter sample, four for a finite line; see `light-quad.frag`.
    var shadow = 1.0;

    if (input.shadowRow >= 0.0 && input.half > 0.0) {
        let reach = 1.0 + 2.0 * input.half;
        let rowClearance = clearance * (input.half + 1.0) / reach;
        var weights = 0.0;

        shadow = 0.0;

        for (var i = 0; i < 4; i++) {
            let ray = input.local - vec2<f32>(input.half * (f32(i) - 1.5) * 0.5, 0.0);
            let rayLength = length(ray);
            let weight = 1.0 / (1.0 + rayLength * rayLength);

            shadow += weight * shadowTerm(ray, (rayLength / reach - rowClearance) / rounding, input.shadowRow + f32(i), input.softness, pixelSpan / max(rayLength, 1e-6));
            weights += weight;
        }

        shadow /= weights;
    } else if (input.shadowRow >= 0.0) {
        shadow = shadowTerm(input.local, (radial - clearance) / rounding, input.shadowRow, input.softness, pixelSpan / max(length(input.local), 1e-6));
    }

    let surface = surfaceTerm(input.position.xy, input.local, input.surface);
    // The quad spans -1..1 in the light's own frame, which is the cookie's 0..1
    // exactly - so the pattern turns and scales with the light for free, and a
    // premultiplied texel that is transparent contributes nothing.
    let cookie = textureSample(u_cookie, u_cookieSampler, vec2<f32>(input.local.x / (input.half + 1.0), input.local.y) * 0.5 + vec2<f32>(0.5)).rgb;

    return vec4<f32>(input.tint.rgb * cookie * (falloff * falloff * coneTerm * input.intensity * shadow * surface), 1.0);
}
