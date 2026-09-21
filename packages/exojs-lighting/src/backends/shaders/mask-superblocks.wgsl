@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;

const MASK_SUPER: i32 = 4;

@fragment
fn fragmentMain(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    let size = vec2<i32>(textureDimensions(uTexture));
    let first = vec2<i32>(floor(position.xy)) * MASK_SUPER;
    var most = 0.0;

    for (var y = 0; y < MASK_SUPER; y = y + 1) {
        for (var x = 0; x < MASK_SUPER; x = x + 1) {
            let texel = first + vec2<i32>(x, y);

            if (texel.x >= size.x || texel.y >= size.y) {
                continue;
            }

            most = max(most, textureLoad(uTexture, texel, 0).a);
        }
    }

    return vec4<f32>(most);
}
