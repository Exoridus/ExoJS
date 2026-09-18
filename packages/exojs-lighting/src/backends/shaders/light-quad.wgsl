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

// One row per shadowed light: the distance to the nearest occluder along each
// angular bin, as a fraction of the light's radius. A row index below zero
// means this light sees no occluder at all.
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
 * Fetch budget for one fragment's penumbra. The taps sit at most one bin
 * apart, so this also sets how wide a kernel can be sampled without gaps: at
 * the default 256 bins it covers the whole softness range.
 */
const MAX_TAPS: i32 = 21;
/** Fraction of a full turn the widest penumbra spans. */
const MAX_PENUMBRA: f32 = 0.03;
/** Tolerance, in radii, that keeps an occluder's own surface out of its shadow. */
const SHADOW_BIAS: f32 = 0.004;
/**
 * Kernel half-width, in bins, at zero softness. The row samples each bin at
 * its centre and is accurate to half a bin, so a kernel narrower than this
 * would show the bin grid itself along an edge.
 */
const MIN_RADIUS: f32 = 1.5;

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
fn visibleAt(bin: i32, bins: i32, row: i32, distance: f32) -> f32 {
    let slot = bin - bins * i32(floor(f32(bin) / f32(bins)));

    return step(distance, textureLoad(u_shadow, vec2<i32>(slot, row), 0).r + SHADOW_BIAS);
}

/**
 * `distance` is the RADIAL distance from the light's own position, as a
 * fraction of the light's whole reach - the frame the polar rows were built in.
 * The falloff term measures to the segment instead, which is a different
 * quantity for a line light and the same one for every other shape.
 *
 * The filter is a normalized tent over the bins the penumbra spans. It is an
 * ANGULAR filter, not an area source: it widens the edge a point source casts,
 * and it does not make the shadow behave like one cast by a disc of that size.
 */
fn shadowTerm(local: vec2<f32>, distance: f32, shadowRow: f32, softness: f32) -> f32 {
    if (shadowRow < 0.0) {
        return 1.0;
    }

    let bins = i32(textureDimensions(u_shadow, 0).x);
    let row = i32(shadowRow);
    let radius = MIN_RADIUS + max(0.0, softness) * f32(bins) * MAX_PENUMBRA;
    let center = (atan2(local.y, local.x) + PI) / (2.0 * PI) * f32(bins) - 0.5;
    // One tap per bin while that fits the budget, and evenly spread over the
    // kernel when it does not: the sampling follows the filter's own width
    // instead of leaving gaps across it.
    let taps = min(2 * i32(ceil(radius)) + 1, MAX_TAPS);
    let stride = 2.0 * radius / f32(taps - 1);

    var lit = 0.0;
    var total = 0.0;

    for (var tap: i32 = 0; tap < MAX_TAPS; tap = tap + 1) {
        if (tap >= taps) {
            break;
        }

        let at = center + (f32(tap) - 0.5 * f32(taps - 1)) * stride;
        // Weighted by the tap's true distance from the centre rather than by
        // the bin it rounds to, so the weights slide continuously as the
        // fragment's angle moves - and the outermost tap, the one whose bin
        // index jumps when the centre crosses a half-bin, carries no weight
        // at the moment it does.
        let weight = max(0.0, 1.0 - abs(at - center) / radius);

        lit = lit + weight * visibleAt(i32(floor(at + 0.5)), bins, row, distance);
        total = total + weight;
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

    let shadow = shadowTerm(input.local, length(input.local) / (input.half + 1.0), input.shadowRow, input.softness);
    let surface = surfaceTerm(input.position.xy, input.local, input.surface);
    // The quad spans -1..1 in the light's own frame, which is the cookie's 0..1
    // exactly - so the pattern turns and scales with the light for free, and a
    // premultiplied texel that is transparent contributes nothing.
    let cookie = textureSample(u_cookie, u_cookieSampler, input.local * 0.5 + vec2<f32>(0.5)).rgb;

    return vec4<f32>(input.tint.rgb * cookie * (falloff * falloff * coneTerm * input.intensity * shadow * surface), 1.0);
}
