// The finest cascade, already merged with everything above it.
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;

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
    let world = uniforms.uView.xy + vUv * uniforms.uView.zw;
    // Where this fragment sits in the probe grid, in probe units and measured
    // from probe centres, which is what makes the interpolation below linear in
    // world space.
    let place = (world - uniforms.uOrigin) / uniforms.uSpacing - 0.5;
    let weight = fract(place);
    let base = vec2<i32>(floor(place));
    let probes = vec2<i32>(uniforms.uProbes);
    let tile = i32(uniforms.uTile);

    var total = vec3<f32>(0.0);

    // Bilinear between the four probes around this fragment: taking the nearest
    // one would draw the probe grid itself into the picture.
    for (var y: i32 = 0; y <= 1; y = y + 1) {
        for (var x: i32 = 0; x <= 1; x = x + 1) {
            let at = clamp(base + vec2<i32>(x, y), vec2<i32>(0, 0), probes - vec2<i32>(1, 1));
            let alongX = select(weight.x, 1.0 - weight.x, x == 0);
            let alongY = select(weight.y, 1.0 - weight.y, y == 0);

            total = total + probeRadiance(at, tile) * (alongX * alongY);
        }
    }

    return vec4<f32>(total + uniforms.uAmbient, 1.0);
}
