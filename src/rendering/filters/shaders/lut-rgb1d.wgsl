struct Uniforms {
    uDomain: f32,
};

@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;
@group(1) @binding(0) var<uniform> uniforms: Uniforms;
@group(1) @binding(1) var uLut: texture_2d<f32>;

@fragment
fn fragmentMain(@location(0) vUv: vec2<f32>) -> @location(0) vec4<f32> {
    let src = textureSample(uTexture, uSampler, vUv);
    // The lookup coordinate is the straight colour, not the premultiplied
    // sample - looking a translucent pixel's darkened premultiplied RGB up
    // directly would grade it as if it were a darker straight colour.
    let straight = clamp(select(vec3<f32>(0.0), src.rgb / src.a, src.a > 0.0), vec3<f32>(0.0), vec3<f32>(1.0));
    let n = f32(textureDimensions(uLut).x);

    // Legacy (colorPipelineEnabled == false): the LUT indexes the straight
    // sample directly, no domain conversion - byte-identical to before the
    // colorSpace option existed.
    let legacyCoord = straight * ((n - 1.0) / n) + 0.5 / n;
    let legacy = vec3<f32>(
        textureSample(uLut, uSampler, vec2<f32>(legacyCoord.r, 0.5)).r,
        textureSample(uLut, uSampler, vec2<f32>(legacyCoord.g, 0.5)).g,
        textureSample(uLut, uSampler, vec2<f32>(legacyCoord.b, 0.5)).b,
    );

    // Gated: the straight sample is already linear light under the active
    // pipeline. uDomain selects which domain the LUT was authored in - convert
    // into it before indexing, then convert the graded result back so the
    // output stays linear.
    let domainSrgb = uniforms.uDomain > 0.5;
    let domainRgb = select(straight, linearToSrgb(straight), domainSrgb);
    let gatedCoord = domainRgb * ((n - 1.0) / n) + 0.5 / n;
    let gatedResult = vec3<f32>(
        textureSample(uLut, uSampler, vec2<f32>(gatedCoord.r, 0.5)).r,
        textureSample(uLut, uSampler, vec2<f32>(gatedCoord.g, 0.5)).g,
        textureSample(uLut, uSampler, vec2<f32>(gatedCoord.b, 0.5)).b,
    );
    let gated = select(gatedResult, srgbToLinear(gatedResult), domainSrgb);

    let graded = select(legacy, gated, colorPipelineEnabled);
    return vec4<f32>(graded * src.a, src.a);
}
