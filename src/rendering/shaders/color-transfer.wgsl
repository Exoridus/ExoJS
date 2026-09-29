// Shared colour-space and alpha-association helpers.
//
// Composed into every draw stage that samples colour, so a sampled value is
// associated exactly once and in one place regardless of which backend sampled
// it or which texture class carried it. The GLSL twin of this file is
// `color-transfer.frag`; the two must declare the same helpers with the same
// constants.

// The sRGB electro-optical transfer function, for an authoring byte that
// reaches a linear pipeline without a hardware sRGB view decoding it. A sampleColor
// taken through an sRGB view is already linear: calling this on such a sampleColor
// decodes it twice, so the resolved storage format - not the shader - decides
// whether a transfer function runs at all.
fn srgbToLinear(value: vec3<f32>) -> vec3<f32> {
    // pow() is undefined for a negative base, and internal HDR work may hand
    // this a negative component.
    let clamped = max(value, vec3<f32>(0.0));
    let low = clamped / 12.92;
    let high = pow((clamped + vec3<f32>(0.055)) / 1.055, vec3<f32>(2.4));

    return select(high, low, clamped <= vec3<f32>(0.04045));
}

// The inverse, for an authored colour that must reach an sRGB-encoded
// attachment or a packed authored byte unchanged.
fn linearToSrgb(value: vec3<f32>) -> vec3<f32> {
    let clamped = max(value, vec3<f32>(0.0));
    let low = clamped * 12.92;
    let high = 1.055 * pow(clamped, vec3<f32>(1.0 / 2.4)) - vec3<f32>(0.055);

    return select(high, low, clamped <= vec3<f32>(0.0031308));
}

// The single point where a sampled colour's alpha association is applied.
//
// `premultiplySample` is the engine's resolved answer for the sampled source:
// a straight source arrives unpremultiplied and is associated here, while an
// already-associated source, one normalized at upload, and numeric data are
// passed through untouched. It is never inferred from the backend, from the
// texture class, or from the sampled value itself.
fn associateSampledColor(sampleColor: vec4<f32>, premultiplySample: bool) -> vec4<f32> {
    return select(sampleColor, vec4<f32>(sampleColor.rgb * sampleColor.a, sampleColor.a), premultiplySample);
}

// A native block format with no alpha channel (BC1 RGB) is stored as RGBA where
// a backend requires it, so its sampled alpha is whatever the unused channel
// happens to hold. Force it to one before any association reads it. This is not
// punchthrough BC1, whose alpha is real data and is associated like any other
// straight source, so the two resolve to mutually exclusive flags: an opaque
// source resolves `premultiplySample` false and is never associated.
fn forceOpaqueSampleAlpha(sampleColor: vec4<f32>, opaqueAlpha: bool) -> vec4<f32> {
    return select(sampleColor, vec4<f32>(sampleColor.rgb, 1.0), opaqueAlpha);
}
