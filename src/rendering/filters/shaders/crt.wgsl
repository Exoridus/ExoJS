@group(0) @binding(0) var<uniform> uResolution: vec2<f32>;
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;
@group(0) @binding(3) var<uniform> uOrientation: f32;

fn hash(input: u32) -> u32 {
    var value = input;
    value = value ^ (value >> 16u);
    value = value * 0x7feb352du;
    value = value ^ (value >> 15u);
    value = value * 0x846ca68bu;
    return value ^ (value >> 16u);
}

fn sampleInside(uv: vec2<f32>) -> vec4<f32> {
    let inside = step(0.0, uv.x) * step(0.0, uv.y) * step(uv.x, 1.0) * step(uv.y, 1.0);
    return textureSampleLevel(uTexture, uSampler, uv, 0.0) * inside;
}

@fragment
fn fragmentMain(@location(0) vUv: vec2<f32>) -> @location(0) vec4<f32> {
    if (uniforms.uStrength == 0.0 && uniforms.uRgbSeparation == 0.0) {
        return textureSampleLevel(uTexture, uSampler, vUv, 0.0);
    }

    let centered = vUv * 2.0 - vec2<f32>(1.0);
    let uv = centered * (1.0 + dot(centered, centered) * 0.07 * uniforms.uStrength) * 0.5 + vec2<f32>(0.5);
    let base = sampleInside(uv);
    let red = sampleInside(uv + vec2<f32>(uniforms.uRgbSeparation, 0.0));
    let blue = sampleInside(uv - vec2<f32>(uniforms.uRgbSeparation, 0.0));
    let alpha = max(base.a, max(red.a, blue.a));
    let domainUv = vec2<f32>(vUv.x, 0.5 + (vUv.y - 0.5) * uOrientation);
    let pixel = vec2<u32>(floor(domainUv * uResolution));
    let frame = u32(floor(uniforms.uTime * 45.0) % 65536.0);
    let noise = f32(hash(pixel.x ^ hash(pixel.y) ^ hash(frame)) >> 8u) / 16777216.0;
    let scan = 1.0 - 0.14 * uniforms.uStrength * (0.5 + 0.5 * sin(domainUv.y * 900.0));
    let grain = (noise - 0.5) * 0.12 * uniforms.uStrength;
    let vignette = 1.0 - smoothstep(0.42, 0.8, length(domainUv - vec2<f32>(0.5))) * 0.65 * uniforms.uStrength;
    // Each channel is already premultiplied; the added grain must carry coverage too.
    let rgb = (vec3<f32>(red.r, base.g, blue.b) * scan + vec3<f32>(grain * alpha)) * vignette;
    return vec4<f32>(max(vec3<f32>(0.0), rgb), alpha);
}
