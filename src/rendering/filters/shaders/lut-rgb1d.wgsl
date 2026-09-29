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

    // The straight sample is already linear light. uDomain selects which domain
    // the LUT was authored in - convert into it before indexing, then convert
    // the graded result back so the output stays linear.
    let domainSrgb = uniforms.uDomain > 0.5;
    let domainRgb = select(straight, linearToSrgb(straight), domainSrgb);
    let gradedCoord = domainRgb * ((n - 1.0) / n) + 0.5 / n;
    let result = vec3<f32>(
        textureSample(uLut, uSampler, vec2<f32>(gradedCoord.r, 0.5)).r,
        textureSample(uLut, uSampler, vec2<f32>(gradedCoord.g, 0.5)).g,
        textureSample(uLut, uSampler, vec2<f32>(gradedCoord.b, 0.5)).b,
    );
    let graded = select(result, srgbToLinear(result), domainSrgb);

    return vec4<f32>(graded * src.a, src.a);
}
