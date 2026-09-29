// Untyped number uniforms are packed one per 16-byte slot, so every field
// after the first is explicitly aligned to its slot.
struct Uniforms {
    uDomain: f32,
    @align(16) uLutSize: f32,
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
    // The lookup coordinate is the straight colour, not the premultiplied
    // sample - see lut-rgb1d.wgsl for why.
    let straight = select(vec3<f32>(0.0), src.rgb / src.a, src.a > 0.0);

    // The straight sample is already linear light. uDomain selects which domain
    // the LUT was authored in - convert into it before indexing, then convert
    // the graded result back so the output stays linear.
    let domainSrgb = uniforms.uDomain > 0.5;
    let domainRgb = select(straight, linearToSrgb(straight), domainSrgb);
    let result = sampleLut3d(domainRgb);
    let graded = select(result, srgbToLinear(result), domainSrgb);

    return vec4<f32>(graded * src.a, src.a);
}
