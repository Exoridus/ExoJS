// The occluder mask. Alpha is coverage, as everything reading it treats it.
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;

/** Mask texels one block covers, on each axis. The transport walk repeats this number. */
const MASK_COARSE: i32 = 8;

@fragment
fn fragmentMain(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    let size = vec2<i32>(textureDimensions(uTexture, 0));
    let first = vec2<i32>(floor(position.xy)) * MASK_COARSE;
    var most = 0.0;

    // A texel of margin on every side, which is what lets a walk skip an
    // unmarked block outright: a stretch inside a block can be stopped by a
    // texel just beyond its edge, at a corner it only touches.
    for (var y = -1; y <= MASK_COARSE; y = y + 1) {
        for (var x = -1; x <= MASK_COARSE; x = x + 1) {
            let texel = first + vec2<i32>(x, y);

            if (texel.x < 0 || texel.y < 0 || texel.x >= size.x || texel.y >= size.y) {
                continue;
            }

            most = max(most, textureLoad(uTexture, texel, 0).a);
        }
    }

    return vec4<f32>(most);
}
