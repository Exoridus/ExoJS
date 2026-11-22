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

// One row per shadowed light, one texel per angular bin, distances as a
// fraction of the light's radius: `r` an occluder covering only the part of the
// bin from `g` to `b`, and `a` the nearest occluder over the rest of it (see
// `buildShadowRow`). A row index below zero means this light sees no occluder
// at all.
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
/**
 * Widest kernel, as a half-width in bins, and therefore also the fetch budget:
 * one tap per bin the kernel touches, and a bin either side of those for the
 * slope the outermost taps read - at most `2 * MAX_HALF + 5` fetches.
 *
 * It bounds the penumbra in BINS, so a larger `shadowResolution` buys a
 * sharper hard edge rather than a wider softest penumbra. Sampling every bin
 * under the kernel is what keeps the filter continuous, and a budget that did
 * not bound the width would have to skip bins to stay within itself.
 */
const MAX_HALF: i32 = 10;
/** Fraction of a full turn the widest penumbra spans, before the bin bound above. */
const MAX_PENUMBRA: f32 = 0.03;
/** Clearance that keeps an occluder's lit face out of its own shadow, in fragments along the ray. See `light-quad.frag`. */
const SHADOW_CLEARANCE: f32 = 0.75;
/**
 * Kernel half-width, in bins, at zero softness. A bin holds one distance for
 * the whole of its covered part, so a kernel narrower than this would show
 * the step between neighbouring bins' distances along a wall seen at a slant.
 */
const MIN_RADIUS: f32 = 1.5;

/**
 * Narrowest blocker slope, in the row's own units, that a bin is allowed to
 * resolve. Below it a bin flips at its stored distance, which is what a wall
 * square-on to the ray should do.
 */
const MIN_SLOPE: f32 = 1e-4;

/** The texel bin `bin` holds. The row is polar, so the index wraps. */
fn binAt(bin: i32, bins: i32, row: i32) -> vec4<f32> {
    let slot = bin - bins * i32(floor(f32(bin) / f32(bins)));

    return textureLoad(u_shadow, vec2<i32>(slot, row), 0);
}

/**
 * The share of the kernel - a unit-area tent of half-width `radius` around
 * `center` - that falls between `low` and `high`, all in bins.
 */
fn tentMass(low: f32, high: f32, center: f32, radius: f32) -> f32 {
    let u = clamp((vec2<f32>(low, high) - center) / radius, vec2<f32>(-1.0), vec2<f32>(1.0));
    let area = u - u * abs(u) * 0.5;

    return area.y - area.x;
}

/**
 * How much of one bin's own angular width the light reaches past `threshold`,
 * the fragment's distance less the clearance its own lit face is owed.
 *
 * A bin holds a single blocker distance, so comparing against that alone makes
 * the whole bin flip at once and a kernel of such comparisons has no more
 * levels than it has taps. Along a wall that is not square-on to the ray the
 * taps flip at DIFFERENT distances, and the levels then show up as a fan of
 * arcs across the penumbra. The blocker's distance varies within the bin, and
 * the one-sided differences to the neighbouring bins measure how steeply.
 *
 * Two conditions before that reading is trusted. The differences have to run
 * the same way, or the bin holds an isolated blocker rather than a surface;
 * and of two that do, the SMALLER is taken, because across a silhouette one
 * side jumps by the whole distance to whatever lies behind. Failing either,
 * the bin flips at its stored distance, which is what a blocker that the row
 * cannot resolve any further should do.
 *
 * The transition stays centred on the bin's OWN stored distance either way -
 * blending two stored distances and comparing once would instead put the edge
 * at a depth neither bin holds, which is a different thing and the wrong one.
 */
fn coverageAt(here: f32, previous: f32, next: f32, threshold: f32) -> f32 {
    let rising = here - previous;
    let falling = next - here;
    // A slope only means something where the blocker distance runs the SAME
    // way on both sides. A bin whose neighbours BOTH lie further away holds an
    // isolated blocker seen end-on rather than a surface seen at a slant, and
    // reading its two one-sided jumps as a slope would spread it over the whole
    // distance to whatever stands behind it - darkening what stands in FRONT of
    // it, the one place a blocker cannot reach.
    let slope = select(min(abs(rising), abs(falling)), 0.0, rising * falling <= 0.0);

    return clamp(0.5 + (here - threshold) / max(slope, MIN_SLOPE), 0.0, 1.0);
}

/**
 * `threshold` comes from the RADIAL distance from the light's own position, as
 * a fraction of the light's whole reach - the frame the polar rows were built in.
 * The falloff term measures to the segment instead, which is a different
 * quantity for a line light and the same one for every other shape.
 *
 * The filter is a normalized tent over the bins the penumbra spans. Its taps
 * sit on the BINS, not on the fragment's own angle, and each one is weighted
 * by the share of the tent that falls on that bin: the weights then slide
 * continuously as the fragment moves, and a bin that enters or leaves the
 * window carries no weight at the moment it does. Placing the taps at fixed
 * offsets from the angle instead - and rounding each to a bin - makes every
 * weight constant and moves the whole window at once, which puts a step the
 * size of the centre tap back into the edge. Each tap then reads a COVERAGE
 * rather than a yes or no, which is what leaves the term continuous in the
 * fragment's distance as well as in its angle.
 *
 * Within a bin, the part a silhouette covers is weighted by the share of the
 * tent over that part alone. That is what keeps the edge where the geometry
 * puts it rather than at the nearest bin centre, and moving smoothly with the
 * occluder rather than a bin at a time.
 *
 * It is an ANGULAR filter, not an area source: it widens the edge a point
 * source casts, and it does not make the shadow behave like one cast by a
 * disc of that size.
 */
fn shadowTerm(local: vec2<f32>, threshold: f32, shadowRow: f32, softness: f32) -> f32 {
    if (shadowRow < 0.0) {
        return 1.0;
    }

    let bins = i32(textureDimensions(u_shadow, 0).x);
    let row = i32(shadowRow);
    let radius = min(MIN_RADIUS + max(0.0, softness) * f32(bins) * MAX_PENUMBRA, f32(MAX_HALF));
    let center = (atan2(local.y, local.x) + PI) / (2.0 * PI) * f32(bins) - 0.5;
    // Bin `i` spans `i - 0.5 .. i + 0.5` here, so these are the bins the tent touches.
    let base = i32(floor(center + 0.5));
    let reach = i32(ceil(radius + 0.5));

    var lit = 0.0;
    var total = 0.0;
    // Rolling, so the bin either side of a tap costs no extra fetch: every bin
    // under the kernel is read once and serves as its own tap and as both its
    // neighbours' slope.
    var previous = binAt(base - reach - 1, bins, row).a;
    var here = binAt(base - reach, bins, row);

    for (var offset: i32 = -MAX_HALF - 1; offset <= MAX_HALF + 1; offset = offset + 1) {
        if (offset < -reach || offset > reach) {
            continue;
        }

        let bin = base + offset;
        let next = binAt(bin + 1, bins, row);
        let low = f32(bin) - 0.5;
        let mass = tentMass(low, low + 1.0, center, radius);

        if (mass > 0.0) {
            // A partial blocker has no neighbour to read a slope from: across
            // its own silhouette the distance jumps to whatever lies behind.
            var covered = 0.0;

            if (here.b > here.g) {
                covered = tentMass(low + here.g, low + here.b, center, radius);
                lit = lit + covered * coverageAt(here.r, here.r, here.r, threshold);
            }

            lit = lit + (mass - covered) * coverageAt(here.a, previous, next.a, threshold);
            total = total + mass;
        }

        previous = here.a;
        here = next;
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
    let clearance = SHADOW_CLEARANCE * fwidth(radial);
    // Rounding of the stored distance, divided out of the fragment's side once;
    // see `light-quad.frag`.
    let threshold = (radial - clearance) / (1.0 + uniforms.u_shadowPrecision);

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

    let shadow = shadowTerm(input.local, threshold, input.shadowRow, input.softness);
    let surface = surfaceTerm(input.position.xy, input.local, input.surface);
    // The quad spans -1..1 in the light's own frame, which is the cookie's 0..1
    // exactly - so the pattern turns and scales with the light for free, and a
    // premultiplied texel that is transparent contributes nothing.
    let cookie = textureSample(u_cookie, u_cookieSampler, vec2<f32>(input.local.x / (input.half + 1.0), input.local.y) * 0.5 + vec2<f32>(0.5)).rgb;

    return vec4<f32>(input.tint.rgb * cookie * (falloff * falloff * coneTerm * input.intensity * shadow * surface), 1.0);
}
