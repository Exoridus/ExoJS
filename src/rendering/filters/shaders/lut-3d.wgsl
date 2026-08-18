struct Uniforms {
    uLutSize: f32,
};

@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;
@group(1) @binding(0) var<uniform> uniforms: Uniforms;
@group(1) @binding(1) var uLut: texture_2d<f32>;

fn sampleLut3d(c: vec3<f32>) -> vec3<f32> {
    let n = uniforms.uLutSize;
    let scaled = clamp(c.b, 0.0, 1.0) * (n - 1.0);
    let bLow = floor(scaled);
    let bHigh = min(bLow + 1.0, n - 1.0);
    let bFrac = scaled - bLow;
    let invN2 = 1.0 / (n * n);
    let invN = 1.0 / n;
    let halfPx = 0.5 / (n * n);
    let halfRow = 0.5 / n;
    let rOff = clamp(c.r, 0.0, 1.0) * (n - 1.0) * invN2;
    let gOff = clamp(c.g, 0.0, 1.0) * (n - 1.0) * invN + halfRow;
    let uLow = bLow * invN + rOff + halfPx;
    let uHigh = bHigh * invN + rOff + halfPx;
    let lo = textureSample(uLut, uSampler, vec2<f32>(uLow, gOff)).rgb;
    let hi = textureSample(uLut, uSampler, vec2<f32>(uHigh, gOff)).rgb;
    return mix(lo, hi, bFrac);
}

@fragment
fn fragmentMain(@location(0) vUv: vec2<f32>) -> @location(0) vec4<f32> {
    let src = textureSample(uTexture, uSampler, vUv);
    return vec4<f32>(sampleLut3d(src.rgb), src.a);
}
