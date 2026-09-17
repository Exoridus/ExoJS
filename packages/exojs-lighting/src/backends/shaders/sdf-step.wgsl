// The seed field from the previous round: `xy` is the nearest seed's texel
// coordinate and `z` says whether one was found at all.
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;

@fragment
fn fragmentMain(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    let size = vec2<i32>(textureDimensions(uTexture, 0));
    let here = position.xy;
    let origin = vec2<i32>(here);
    let offset = i32(uniforms.uStep);

    var best = vec2<f32>(0.0, 0.0);
    var found = 0.0;
    var nearest = 0.0;

    // The jump flood's nine taps: this texel and the eight around it at the
    // round's own stride. Each carries the nearest seed ITS neighbourhood knew,
    // which is what lets a round halve the stride and still cover the plane.
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

            if (candidate.z < 0.5) {
                continue;
            }

            let delta = here - candidate.xy;
            let squared = dot(delta, delta);

            if (found == 0.0 || squared < nearest) {
                nearest = squared;
                best = candidate.xy;
                found = 1.0;
            }
        }
    }

    return vec4<f32>(best, found, 1.0);
}
