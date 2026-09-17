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

const SHADOW_TAPS: i32 = 5;
/** Fraction of the strip range the widest penumbra spans. */
const MAX_PENUMBRA: f32 = 0.03;
/** Tolerance, in the row's own units, that keeps an occluder out of its own shadow. */
const SHADOW_BIAS: f32 = 0.004;

/**
 * The stored depth at a fractional strip, blended between the two strips it
 * falls between.
 *
 * Reading the nearest strip alone is what makes a shadow edge a staircase: the
 * row is a few hundred strips across the whole view, so a silhouette moves in
 * whole strips and shows every one of them.
 */
fn depthAt(strip: f32, row: i32, bins: f32) -> f32 {
    let lower = floor(strip);
    let weight = strip - lower;
    // Clamped rather than wrapped: strips are a line, and the far side of the
    // range is not the near side of it.
    let first = i32(clamp(lower, 0.0, bins - 1.0));
    let second = i32(clamp(lower + 1.0, 0.0, bins - 1.0));

    return mix(textureLoad(u_shadow, vec2<i32>(first, row), 0).r, textureLoad(u_shadow, vec2<i32>(second, row), 0).r, weight);
}

fn shadowTerm(sun: vec2<f32>, shadowRow: f32, softness: f32) -> f32 {
    if (shadowRow < 0.0) {
        return 1.0;
    }

    let bins = f32(textureDimensions(u_shadow, 0).x);
    // A kernel narrower than one strip would alias along the strip grid, so one
    // strip is the floor: softness widens the penumbra from there.
    let spread = max(1.0, softness * bins * MAX_PENUMBRA);
    let center = sun.x * bins - 0.5;
    let row = i32(shadowRow);

    var lit = 0.0;

    for (var tap: i32 = 0; tap < SHADOW_TAPS; tap = tap + 1) {
        let offset = (f32(tap) / f32(SHADOW_TAPS - 1) - 0.5) * 2.0 * spread;

        lit = lit + step(sun.y, depthAt(center + offset, row, bins) + SHADOW_BIAS);
    }

    return lit / f32(SHADOW_TAPS);
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
