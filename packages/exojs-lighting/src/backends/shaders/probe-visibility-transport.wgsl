// How open the way from each probe to the four coarser ones around it is,
// answered by the transport walk rather than by the distance field.
//
// The bindings and the transport chunk are prepended by the module that builds
// this shader.
//
// The walk answers exactly: a way is open or it is not. The field's own
// version fades over the last texel before a surface, which keeps a probe grid
// sliding across a wall from switching all at once; the difference belongs to
// the comparison between the two walks rather than to a fudge here.

@fragment
fn fragmentMain(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    let probe = vec2<i32>(floor(position.xy));

    if (probe.x >= i32(uniforms.uProbes.x) || probe.y >= i32(uniforms.uProbes.y)) {
        return vec4<f32>(1.0);
    }

    // The same four coarser probes the cascade merges from, in the same order.
    let coarseProbes = vec2<i32>((i32(uniforms.uProbes.x) + 1) / 2, (i32(uniforms.uProbes.y) + 1) / 2);
    let place = (vec2<f32>(probe) + 0.5) * 0.5 - 0.5;
    let base = vec2<i32>(floor(place));
    let origin = uniforms.uOrigin + (vec2<f32>(probe) + 0.5) * uniforms.uSpacing;
    var ways = vec4<f32>(1.0);

    for (var index = 0; index < 4; index = index + 1) {
        let corner = clamp(base + vec2<i32>(index % 2, index / 2), vec2<i32>(0), coarseProbes - vec2<i32>(1));

        ways[index] = traceSegment(origin, uniforms.uOrigin + (vec2<f32>(corner) + 0.5) * (uniforms.uSpacing * 2.0)).transmittance;
    }

    return ways;
}
