// The finished seed field: `xy` is the nearest seed's texel coordinate.
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;

@fragment
fn fragmentMain(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    let seed = textureLoad(uTexture, vec2<i32>(position.xy), 0);
    var distance = uniforms.uFar;

    if (seed.z >= 0.5) {
        distance = length(position.xy - seed.xy) * uniforms.uScale;
    }

    // Stored as a fraction of the reach rather than in world units: it keeps the
    // whole field inside half-float's precise range whatever the camera covers,
    // and it is what makes the debug view a legible ramp instead of white.
    return vec4<f32>(vec3<f32>(clamp(distance / uniforms.uFar, 0.0, 1.0)), 1.0);
}
