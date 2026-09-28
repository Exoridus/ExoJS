// Untyped number uniforms are packed one per 16-byte slot, so every field
// after the first is explicitly aligned to its slot.
struct Uniforms {
    uExposureScale: f32,
    @align(16) uToneMapping: f32,
    @align(16) uTransparentCanvas: f32,
    @align(16) uMatteColor: vec3<f32>,
};

@group(0) @binding(0) var uSource: texture_2d<f32>;
@group(0) @binding(1) var uSampler: sampler;
@group(1) @binding(0) var<uniform> uniforms: Uniforms;

// Values beyond this magnitude saturate at the SDR/tone-map ceiling instead of
// reaching an actual floating-point infinity, which would turn the reinhard
// division into NaN.
const outputHuge: f32 = 3.0e38;

@fragment
fn fragmentMain(@location(0) vUv: vec2<f32>) -> @location(0) vec4<f32> {
    let src = textureSample(uSource, uSampler, vUv);
    let transparent = uniforms.uTransparentCanvas > 0.5;

    // Transparent target: unassociate before the transform, re-associate the
    // encoded result afterwards. Opaque target: composite the linear PMA
    // color over the clear-color matte first, so a partially covered pixel is
    // never brightened by an unassociate it should not receive.
    let unassociated = select(vec3<f32>(0.0), src.rgb / src.a, src.a > 0.0);
    let composited = src.rgb + (1.0 - src.a) * uniforms.uMatteColor;
    let straight = select(composited, unassociated, transparent);

    let raw = straight * uniforms.uExposureScale;
    let sanitized = select(raw, vec3<f32>(0.0), raw != raw);
    let exposed = min(max(sanitized, vec3<f32>(0.0)), vec3<f32>(outputHuge));

    let reinhard = exposed / (vec3<f32>(1.0) + exposed);
    let clampedSdr = min(exposed, vec3<f32>(1.0));
    let mapped = select(clampedSdr, reinhard, uniforms.uToneMapping > 0.5);

    let encoded = linearToSrgb(mapped);
    let outAlpha = select(1.0, src.a, transparent);
    let finalRgb = select(encoded, encoded * src.a, transparent);

    return vec4<f32>(finalRgb, outAlpha);
}
