// The seed field from the previous round: `xy` is the index of the nearest
// blocking texel and `zw` that of the nearest open one, each `-1` where none
// was found yet. An index names its texel's centre at `index + 0.5`.
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;

@fragment
fn fragmentMain(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    let size = vec2<i32>(textureDimensions(uTexture, 0));
    let here = position.xy;
    let origin = vec2<i32>(here);
    let offset = i32(uniforms.uStep);

    var blocking = vec2<f32>(-1.0, -1.0);
    var open = vec2<f32>(-1.0, -1.0);
    var nearestBlocking = 1e30;
    var nearestOpen = 1e30;

    // The jump flood's nine taps: this texel and the eight around it at the
    // round's own stride. Each carries the nearest seed ITS neighbourhood knew,
    // which is what lets a round halve the stride and still cover the plane.
    // Both classes ride the same taps, so the second field costs no fetches.
    for (var y: i32 = -1; y <= 1; y = y + 1) {
        for (var x: i32 = -1; x <= 1; x = x + 1) {
            let at = origin + vec2<i32>(x, y) * offset;

            // Outside the field there is no answer, and clamping to the edge
            // would invent one: an edge texel's seed would spread inwards as if
            // the wall continued past the border.
            if (at.x < 0 || at.y < 0 || at.x >= size.x || at.y >= size.y) {
                continue;
            }

            let candidate = textureLoad(uTexture, at, 0);

            if (candidate.x >= 0.0) {
                let delta = here - (candidate.xy + 0.5);
                let squared = dot(delta, delta);

                if (squared < nearestBlocking) {
                    nearestBlocking = squared;
                    blocking = candidate.xy;
                }
            }

            if (candidate.z >= 0.0) {
                let delta = here - (candidate.zw + 0.5);
                let squared = dot(delta, delta);

                if (squared < nearestOpen) {
                    nearestOpen = squared;
                    open = candidate.zw;
                }
            }
        }
    }

    return vec4<f32>(blocking, open);
}
