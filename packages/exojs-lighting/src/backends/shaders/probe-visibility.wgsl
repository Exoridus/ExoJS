// The distance field: distance out of the nearest surface in `r`, as a
// fraction of `uFar`.
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;

/** Hard ceiling on a walk. The way to a neighbouring probe is a few texels. */
const MAX_STEPS: i32 = 32;

/** World position to a lookup in the field. See the cascade shader. */
fn fieldUv(world: vec2<f32>) -> vec2<f32> {
    let clip = vec2<f32>(dot(uniforms.uToField.xy, world), dot(uniforms.uToField.zw, world)) + uniforms.uFieldOffset;

    return vec2<f32>(clip.x, -clip.y) * 0.5 + 0.5;
}

/**
 * How open the straight way from `from` to `to` is: one where nothing comes
 * within a texel of it, falling to zero as a surface crosses it. A wall
 * between two probes then cuts the merge between them, and the fall is
 * gradual so a probe grid sliding over the wall does not switch.
 */
fn open(start: vec2<f32>, finish: vec2<f32>) -> f32 {
    let way = finish - start;
    let span = length(way);

    if (span <= 0.0) {
        return 1.0;
    }

    let direction = way / span;
    let minStep = max(uniforms.uTexel, 0.0001);

    var travelled = 0.0;
    var nearest = 1e8;

    for (var taken: i32 = 0; taken < MAX_STEPS && travelled < span; taken = taken + 1) {
        let uv = fieldUv(start + direction * travelled);

        if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
            break;
        }

        let distance = textureSampleLevel(uTexture, uSampler, uv, 0.0).r * uniforms.uFar;

        nearest = min(nearest, distance);
        travelled = travelled + max(distance, minStep);
    }

    return clamp(nearest / minStep, 0.0, 1.0);
}

@fragment
fn fragmentMain(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    let probe = vec2<i32>(position.xy);

    if (probe.x >= i32(uniforms.uProbes.x) || probe.y >= i32(uniforms.uProbes.y)) {
        return vec4<f32>(1.0);
    }

    // The same four coarser probes the cascade merges from, in the same order.
    let coarseProbes = vec2<i32>((i32(uniforms.uProbes.x) + 1) / 2, (i32(uniforms.uProbes.y) + 1) / 2);
    let place = (vec2<f32>(probe) + 0.5) * 0.5 - 0.5;
    let base = vec2<i32>(floor(place));
    let origin = uniforms.uOrigin + (vec2<f32>(probe) + 0.5) * uniforms.uSpacing;

    var ways = vec4<f32>(1.0);

    for (var index: i32 = 0; index < 4; index = index + 1) {
        let corner = clamp(base + vec2<i32>(index % 2, index / 2), vec2<i32>(0, 0), coarseProbes - vec2<i32>(1, 1));

        ways[index] = open(origin, uniforms.uOrigin + (vec2<f32>(corner) + 0.5) * (uniforms.uSpacing * 2.0));
    }

    return ways;
}
