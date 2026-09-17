// One light quad: the instance transform carries position, radius and, for a
// cone, rotation, so the fragment stage works in radius-normalized space
// aligned with the light's axis and needs no world coordinates of its own. The
// engine prepends the instancing contract.
struct VertexInput {
    @location(0) position: vec2<f32>,
    @location(6) nodeIndex: u32,
    @location(7) light: vec3<f32>,
    @location(8) shadow: vec2<f32>,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) local: vec2<f32>,
    @location(1) tint: vec4<f32>,
    @location(2) @interpolate(flat) cone: vec2<f32>,
    @location(3) @interpolate(flat) intensity: f32,
    @location(4) @interpolate(flat) shadowRow: f32,
    @location(5) @interpolate(flat) softness: f32,
};

// One row per shadowed light: the distance to the nearest occluder along each
// angular bin, as a fraction of the light's radius. A row index below zero
// means this light sees no occluder at all.
@group(2) @binding(1) var u_shadow: texture_2d<f32>;
@group(2) @binding(2) var u_shadowSampler: sampler;

const PI: f32 = 3.14159265359;
const SHADOW_TAPS: i32 = 5;
/** Fraction of a full turn the widest penumbra spans. */
const MAX_PENUMBRA: f32 = 0.03;
/** Tolerance, in radii, that keeps an occluder's own surface out of its shadow. */
const SHADOW_BIAS: f32 = 0.004;

fn shadowTerm(local: vec2<f32>, distance: f32, shadowRow: f32, softness: f32) -> f32 {
    if (shadowRow < 0.0) {
        return 1.0;
    }

    let bins = f32(textureDimensions(u_shadow, 0).x);
    // A kernel narrower than one bin would alias along the bin grid, so one
    // bin is the floor: softness widens the penumbra from there.
    let spread = max(1.0, softness * bins * MAX_PENUMBRA);
    let center = (atan2(local.y, local.x) + PI) / (2.0 * PI) * bins - 0.5;
    let row = i32(shadowRow);

    var lit = 0.0;

    for (var tap: i32 = 0; tap < SHADOW_TAPS; tap = tap + 1) {
        let offset = (f32(tap) / f32(SHADOW_TAPS - 1) - 0.5) * 2.0 * spread;
        let bin = i32(fract(floor(center + offset + 0.5) / bins) * bins);
        let occluder = textureLoad(u_shadow, vec2<i32>(bin, row), 0).r;

        lit = lit + step(distance, occluder + SHADOW_BIAS);
    }

    return lit / f32(SHADOW_TAPS);
}

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;

    output.position = vec4<f32>(exoInstanceClipPosition(input.position, input.nodeIndex), 0.0, 1.0);
    output.local = input.position;
    output.tint = exoInstanceTint(input.nodeIndex);
    output.cone = vec2<f32>(input.light.x, input.light.y);
    output.intensity = input.light.z;
    output.shadowRow = input.shadow.x;
    output.softness = input.shadow.y;

    return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
    let distance = length(input.local);
    let falloff = clamp(1.0 - distance, 0.0, 1.0);

    // A point light writes both cone cosines as -1, which no direction can
    // fail, so one expression serves both shapes.
    var direction = vec2<f32>(1.0, 0.0);

    if (distance > 0.0) {
        direction = input.local / distance;
    }

    let alignment = direction.x;
    var coneTerm = smoothstep(input.cone.x, input.cone.y, alignment);

    if (input.cone.x == input.cone.y) {
        coneTerm = step(input.cone.x, alignment);
    }

    let shadow = shadowTerm(input.local, distance, input.shadowRow, input.softness);

    return vec4<f32>(input.tint.rgb * (falloff * falloff * coneTerm * input.intensity * shadow), 1.0);
}
