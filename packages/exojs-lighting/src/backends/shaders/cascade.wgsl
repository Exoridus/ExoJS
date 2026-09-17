// The cascade above this one, already merged. A 1x1 placeholder stands in for
// the top of the chain, where `uMerge` is zero and nothing reads it.
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;
// The distance to the nearest thing a ray can hit, as a fraction of `uFar`.
@group(1) @binding(1) var uDistance: texture_2d<f32>;
@group(1) @binding(2) var uDistanceSampler: sampler;
// What emits, at the same place in the world as the distance field.
@group(1) @binding(3) var uEmission: texture_2d<f32>;
@group(1) @binding(4) var uEmissionSampler: sampler;

const TAU: f32 = 6.28318530718;
/** Hard ceiling on a ray's walk. Sphere tracing converges in far fewer. */
const MAX_STEPS: i32 = 64;

/** World position to a lookup in the screen-sized fields. */
fn fieldUv(world: vec2<f32>) -> vec2<f32> {
    return (world - uniforms.uView.xy) / uniforms.uView.zw;
}

/**
 * Walk one ray over this cascade's own interval.
 *
 * Returns the radiance it found in `rgb` and, in `a`, how much of the ray got
 * through - which is what the cascade above is then scaled by.
 *
 * A ray is a CONE, not a line: it owns one angular sector of its probe, so at
 * distance `t` it covers `t * tan(pi / directions)` across. Weighting a hit by
 * how much of that footprint the surface fills is what makes the result
 * continuous in the scene's geometry, where a binary hit makes it flicker as a
 * small source crosses from one ray into the next.
 */
fn trace(origin: vec2<f32>, direction: vec2<f32>) -> vec4<f32> {
    let minStep = max(uniforms.uTexel, 0.0001);

    var travelled = uniforms.uRange.x;

    for (var taken: i32 = 0; taken < MAX_STEPS; taken = taken + 1) {
        if (travelled >= uniforms.uRange.y) {
            break;
        }

        let uv = fieldUv(origin + direction * travelled);

        // Outside the camera there is no field, and a ray that leaves it cannot
        // be told apart from one that found nothing - so it carries on as
        // unoccluded rather than ending in shadow.
        if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
            break;
        }

        let distance = textureSampleLevel(uDistance, uDistanceSampler, uv, 0.0).r * uniforms.uFar;
        // The ray's own width here, never below a texel: the field cannot
        // resolve anything finer, and a zero-width cone is the binary hit again.
        let footprint = max(minStep, travelled * uniforms.uCone);

        // Sphere tracing: a step of the distance to the nearest surface cannot
        // pass through one, which is what makes a whole cascade affordable
        // where marching a texel at a time is not.
        if (distance <= footprint) {
            // Sampled past the surface rather than at the point the walk
            // stopped at: the stop is short of what it hit, and an emitter's
            // radiance is inside it, not in the gap.
            let surface = fieldUv(origin + direction * (travelled + distance + minStep));
            let emission = textureSampleLevel(uEmission, uEmissionSampler, surface, 0.0).rgb;
            let coverage = clamp(1.0 - distance / footprint, 0.0, 1.0);

            return vec4<f32>(emission * coverage, 1.0 - coverage);
        }

        travelled = travelled + max(distance, minStep);
    }

    return vec4<f32>(0.0, 0.0, 0.0, 1.0);
}

/** One direction of one probe in the cascade above, as a texel of it. */
fn coarseRay(probe: vec2<i32>, direction: i32, tile: i32) -> vec3<f32> {
    let within = vec2<i32>(direction % tile, direction / tile);

    return textureLoad(uTexture, probe * tile + within, 0).rgb;
}

/**
 * What the cascade above carries for this ray: its four finer-grained
 * directions, averaged, bilinearly interpolated between the four probes of its
 * own coarser grid.
 *
 * Both halves matter. Taking one direction would lose three quarters of the
 * angular detail the level above paid for, and taking the nearest probe would
 * put the probe grid itself into the picture as blocky steps.
 */
fn merged(probe: vec2<i32>, direction: i32, tile: i32) -> vec3<f32> {
    let coarseTile = tile * 2;
    let coarseProbes = vec2<i32>((i32(uniforms.uProbes.x) + 1) / 2, (i32(uniforms.uProbes.y) + 1) / 2);
    // This probe's place in the coarser grid: the coarser probes sit at twice
    // the spacing, so a probe here lands halfway between two of them.
    let place = (vec2<f32>(probe) + 0.5) * 0.5 - 0.5;
    let weight = fract(place);
    let base = vec2<i32>(floor(place));

    var total = vec3<f32>(0.0);

    for (var y: i32 = 0; y <= 1; y = y + 1) {
        for (var x: i32 = 0; x <= 1; x = x + 1) {
            let at = clamp(base + vec2<i32>(x, y), vec2<i32>(0, 0), coarseProbes - vec2<i32>(1, 1));
            let alongX = select(weight.x, 1.0 - weight.x, x == 0);
            let alongY = select(weight.y, 1.0 - weight.y, y == 0);

            var sum = vec3<f32>(0.0);

            for (var sub: i32 = 0; sub < 4; sub = sub + 1) {
                sum = sum + coarseRay(at, direction * 4 + sub, coarseTile);
            }

            total = total + sum * (0.25 * alongX * alongY);
        }
    }

    return total;
}

@fragment
fn fragmentMain(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    let tile = i32(uniforms.uTile);
    let texel = vec2<i32>(position.xy);
    let probe = texel / tile;

    // The cascade's texture holds the same number of texels at every level, but
    // a level whose probe grid does not divide it leaves a margin that no probe
    // owns.
    if (probe.x >= i32(uniforms.uProbes.x) || probe.y >= i32(uniforms.uProbes.y)) {
        return vec4<f32>(0.0, 0.0, 0.0, 1.0);
    }

    let within = texel - probe * tile;
    let direction = within.y * tile + within.x;
    let angle = (f32(direction) + 0.5) / f32(tile * tile) * TAU;
    let origin = uniforms.uOrigin + (vec2<f32>(probe) + 0.5) * uniforms.uSpacing;

    var walked = trace(origin, vec2<f32>(cos(angle), sin(angle)));

    // Scaled by what got through: a ray that ended on a surface is already
    // carrying that surface's radiance, and one that grazed it carries part of
    // both.
    if (uniforms.uMerge > 0.5 && walked.a > 0.0) {
        walked = vec4<f32>(walked.rgb + walked.a * merged(probe, direction, tile), walked.a);
    }

    return vec4<f32>(walked.rgb, 1.0);
}
