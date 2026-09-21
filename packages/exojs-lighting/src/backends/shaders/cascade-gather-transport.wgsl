// The finest cascade read back out as the light arriving at each fragment,
// with the way from the fragment to each probe walked rather than assumed.
//
// The bindings and the transport chunk are prepended by the module that builds
// this shader.
//
// A probe is not where the light is wanted: it is up to a probe spacing away,
// and what lies between the two is the receiver's own business. Walking it is
// the same transfer the merge between two levels makes - what got through
// scales the probe's radiance, and what the stretch crossed on the way is
// added to it - so a fragment on the dark side of a wall no longer takes a
// share of a probe on the lit side.

/** The radiance one probe carries, averaged over every direction it holds. */
fn probeRadiance(probe: vec2<i32>, tile: i32) -> vec3<f32> {
    var total = vec3<f32>(0.0);

    for (var y: i32 = 0; y < tile; y = y + 1) {
        for (var x: i32 = 0; x < tile; x = x + 1) {
            total = total + textureLoad(uTexture, probe * tile + vec2<i32>(x, y), 0).rgb;
        }
    }

    return total / f32(tile * tile);
}

@fragment
fn fragmentMain(@location(0) vUv: vec2<f32>) -> @location(0) vec4<f32> {
    // The destination is the camera's own target, so its texture coordinate is
    // clip space folded into `0..1`, the other way up than in the GLSL half.
    let clip = vec2<f32>(vUv.x * 2.0 - 1.0, 1.0 - vUv.y * 2.0);
    let world = vec2<f32>(dot(uniforms.uToWorld.xy, clip), dot(uniforms.uToWorld.zw, clip)) + uniforms.uWorldOffset;
    // Where this fragment sits in the probe grid, in probe units and measured
    // from probe centres, which is what makes the interpolation below linear in
    // world space.
    let place = (world - uniforms.uOrigin) / uniforms.uSpacing - 0.5;
    let weight = fract(place);
    let base = vec2<i32>(floor(place));
    let probes = vec2<i32>(uniforms.uProbes);
    let tile = i32(uniforms.uTile);
    var total = vec3<f32>(0.0);

    // Bilinear between the four probes around this fragment, each reached by
    // its own walk. The weights are the plain ones: a probe the walk cannot
    // reach contributes nothing, and its weight is not handed to the others.
    for (var y = 0; y <= 1; y = y + 1) {
        for (var x = 0; x <= 1; x = x + 1) {
            let at = clamp(base + vec2<i32>(x, y), vec2<i32>(0), probes - vec2<i32>(1));
            let share = select(weight.x, 1.0 - weight.x, x == 0) * select(weight.y, 1.0 - weight.y, y == 0);
            let probeAt = uniforms.uOrigin + (vec2<f32>(at) + 0.5) * uniforms.uSpacing;
            let walked = traceSegment(world, probeAt);

            total = total + share * (walked.radiance + walked.transmittance * probeRadiance(at, tile));
        }
    }

    return vec4<f32>(total + uniforms.uAmbient, 1.0);
}
