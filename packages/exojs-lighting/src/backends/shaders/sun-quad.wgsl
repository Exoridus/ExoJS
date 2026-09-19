// One directional light. Its quad is the camera's own world box, so there is no
// radius to normalize by: what the fragment stage needs is the fragment's place
// along the light and across it, and both are affine in world position, so they
// interpolate exactly. The engine prepends the instancing contract.
struct VertexInput {
    @location(0) position: vec2<f32>,
    @location(6) nodeIndex: u32,
    @location(7) box: vec4<f32>,
    @location(8) sun: vec4<f32>,
    @location(9) range: vec4<f32>,
    @location(10) beam: vec2<f32>,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    // x: which strip of the shadow row this fragment falls in, in 0..1.
    // y: how far along the light it sits, in the same 0..1 the row stores.
    @location(0) sun: vec2<f32>,
    @location(1) tint: vec4<f32>,
    @location(2) @interpolate(flat) toLight: vec3<f32>,
    @location(3) @interpolate(flat) shadowRow: f32,
    @location(4) @interpolate(flat) softness: f32,
    @location(5) @interpolate(flat) intensity: f32,
};

// One row per shadowed light. A directional light's row is linear rather than
// polar: bin `i` is a strip across the light's direction, holding how far along
// the light the nearest occluder in that strip sits.
@group(2) @binding(1) var u_shadow: texture_2d<f32>;
@group(2) @binding(2) var u_shadowSampler: sampler;
@group(2) @binding(3) var u_normal: texture_2d<f32>;
@group(2) @binding(4) var u_normalSampler: sampler;

/** Widest kernel as a half-width in strips, and the fetch budget. See `light-quad.wgsl`. */
const MAX_HALF: i32 = 10;
/** Fraction of the strip range the widest penumbra spans. */
const MAX_PENUMBRA: f32 = 0.03;
/** Tolerance, in the row's own units, that keeps an occluder out of its own shadow. */
const SHADOW_BIAS: f32 = 0.004;
/** Kernel half-width, in strips, at zero softness. See `light-quad.wgsl`. */
const MIN_RADIUS: f32 = 1.5;

/** Narrowest blocker slope a strip is allowed to resolve. See `light-quad.wgsl`. */
const MIN_SLOPE: f32 = 1e-4;

/**
 * The blocker depth strip `strip` holds. Clamped rather than wrapped: strips
 * are a line, and the far side of the range is not the near side of it.
 */
fn depthAt(strip: i32, bins: i32, row: i32) -> f32 {
    return textureLoad(u_shadow, vec2<i32>(clamp(strip, 0, bins - 1), row), 0).r;
}

/**
 * How much of one strip's own width the light reaches past `depth`. See
 * `light-quad.wgsl` for why a strip is read as a coverage rather than as a
 * yes or no, and why the slope is the smaller of the two one-sided differences.
 */
fn coverageAt(here: f32, previous: f32, next: f32, depth: f32) -> f32 {
    let rising = here - previous;
    let falling = next - here;
    // A slope only means something where the blocker distance runs the SAME
    // way on both sides. A bin whose neighbours BOTH lie further away holds an
    // isolated blocker seen end-on rather than a surface seen at a slant, and
    // reading its two one-sided jumps as a slope would spread it over the whole
    // distance to whatever stands behind it - darkening what stands in FRONT of
    // it, the one place a blocker cannot reach.
    let slope = select(min(abs(rising), abs(falling)), 0.0, rising * falling <= 0.0);

    return clamp(0.5 + (here + SHADOW_BIAS - depth) / max(slope, MIN_SLOPE), 0.0, 1.0);
}

fn shadowTerm(sun: vec2<f32>, shadowRow: f32, softness: f32) -> f32 {
    if (shadowRow < 0.0) {
        return 1.0;
    }

    let bins = i32(textureDimensions(u_shadow, 0).x);
    let row = i32(shadowRow);
    let radius = min(MIN_RADIUS + max(0.0, softness) * f32(bins) * MAX_PENUMBRA, f32(MAX_HALF));
    let center = sun.x * f32(bins) - 0.5;
    let base = i32(floor(center));
    let reach = i32(ceil(radius));

    var lit = 0.0;
    var total = 0.0;

    // Taps on the strips rather than at fixed offsets from the fragment. See
    // the same filter in `light-quad.wgsl` for why that is what makes it
    // continuous.
    var previous = depthAt(base - reach - 1, bins, row);
    var here = depthAt(base - reach, bins, row);

    for (var offset: i32 = -MAX_HALF; offset <= MAX_HALF; offset = offset + 1) {
        if (offset < -reach || offset > reach) {
            continue;
        }

        let strip = base + offset;
        let next = depthAt(strip + 1, bins, row);
        let weight = max(0.0, 1.0 - abs(f32(strip) - center) / radius);

        if (weight > 0.0) {
            lit = lit + weight * coverageAt(here, previous, next, sun.y);
            total = total + weight;
        }

        previous = here;
        here = next;
    }

    return select(1.0, lit / total, total > 0.0);
}

/** See the same term in `light-quad.wgsl`: `1` wherever nothing described a surface. */
fn surfaceTerm(fragment: vec2<f32>, toLight: vec3<f32>) -> f32 {
    let uv = fragment / vec2<f32>(textureDimensions(u_normal, 0));
    let encoded = textureSample(u_normal, u_normalSampler, uv);

    if (encoded.a <= 0.0) {
        return 1.0;
    }

    let normal = normalize((encoded.rgb / encoded.a) * 2.0 - 1.0);

    return max(dot(normal, toLight), 0.0);
}

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;

    output.position = vec4<f32>(exoInstanceClipPosition(input.position, input.nodeIndex), 0.0, 1.0);

    let world = input.box.xy + input.box.zw * input.position;
    let along = input.sun.xy;
    let across = vec2<f32>(-along.y, along.x);

    output.sun = vec2<f32>((dot(world, across) - input.range.x) / input.range.y, (dot(world, along) - input.range.z) / input.range.w);
    output.tint = exoInstanceTint(input.nodeIndex);
    // Towards the light, which for a source at no particular distance is the
    // same everywhere. `sun.z` is a slope rather than a height.
    output.toLight = normalize(vec3<f32>(-along, input.sun.z));
    output.shadowRow = input.sun.w;
    output.intensity = input.beam.x;
    output.softness = input.beam.y;

    return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
    // No falloff and no cone: a source at no particular distance reaches
    // everything its quad covers, equally.
    let shadow = shadowTerm(input.sun, input.shadowRow, input.softness);
    let surface = surfaceTerm(input.position.xy, input.toLight);

    return vec4<f32>(input.tint.rgb * (input.intensity * shadow * surface), 1.0);
}
