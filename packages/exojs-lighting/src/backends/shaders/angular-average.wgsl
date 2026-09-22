@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;

@fragment
fn fragmentMain(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    let compact = vec2<i32>(floor(position.xy));
    let tile = i32(uniforms.uTile);
    let compactTile = tile / 2;
    let probe = compact / compactTile;
    let within = compact - probe * compactTile;
    let direction = within.y * compactTile + within.x;
    let first = direction * 4;
    var total = vec3<f32>(0.0);

    for (var sub = 0; sub < 4; sub = sub + 1) {
        let angle = first + sub;

        total = total + textureLoad(uTexture, probe * tile + vec2<i32>(angle % tile, angle / tile), 0).rgb;
    }

    return vec4<f32>(total * 0.25, 1.0);
}
