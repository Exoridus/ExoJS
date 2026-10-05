// Shared colour-space and alpha-association helpers.
//
// The GLSL ES 3.00 twin of `color-transfer.wgsl`; the two must declare the same
// helpers with the same constants. It is a chunk, not a stage: it carries no
// `#version` and no `main`, because the author or engine owns those.
//
// Every float is precision-qualified. A GLSL ES 3.00 fragment has no default
// float precision, and this text is spliced in ahead of whatever `precision`
// statement a custom material declared.

highp vec3 srgbToLinear(highp vec3 value) {
    // pow() is undefined for a negative base, and internal HDR work may hand
    // this a negative component.
    highp vec3 clamped = max(value, vec3(0.0));
    highp vec3 low = clamped / 12.92;
    highp vec3 high = pow((clamped + vec3(0.055)) / 1.055, vec3(2.4));

    return mix(high, low, lessThanEqual(clamped, vec3(0.04045)));
}

highp vec3 linearToSrgb(highp vec3 value) {
    highp vec3 clamped = max(value, vec3(0.0));
    highp vec3 low = clamped * 12.92;
    highp vec3 high = 1.055 * pow(clamped, vec3(1.0 / 2.4)) - vec3(0.055);

    return mix(high, low, lessThanEqual(clamped, vec3(0.0031308)));
}

// The single point where a sampled colour's alpha association is applied. See
// the WGSL twin for the contract: the flag is resolved by the engine per
// sampled source, never inferred from the backend or the texture class.
highp vec4 associateSampledColor(highp vec4 sampleColor, bool premultiplySample) {
    return premultiplySample ? vec4(sampleColor.rgb * sampleColor.a, sampleColor.a) : sampleColor;
}

// A native block format with no alpha channel is stored as RGBA where a backend
// requires it; force the sampled alpha to one before any association reads it.
// Mutually exclusive with `premultiplySample`, and not punchthrough BC1, whose
// alpha is real data.
highp vec4 forceOpaqueSampleAlpha(highp vec4 sampleColor, bool opaqueAlpha) {
    return opaqueAlpha ? vec4(sampleColor.rgb, 1.0) : sampleColor;
}
