@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;

@fragment
fn fragmentMain(@location(0) vUv: vec2<f32>) -> @location(0) vec4<f32> {
    let premultiplied = textureSample(uTexture, uSampler, vUv);
    let alpha = premultiplied.a;
    let straightRgb = select(vec3<f32>(0.0), premultiplied.rgb / max(alpha, 1e-5), alpha > 0.0);
    let straight = vec4<f32>(straightRgb, alpha);

    // The straight sample is already linear light. uDomain selects which domain
    // the matrix coefficients see - convert into it, apply, clamp, then convert
    // back so the result stays linear PMA regardless of the caller's chosen
    // domain.
    let domainSrgb = uniforms.uDomain > 0.5;
    let domainRgb = select(straight.rgb, linearToSrgb(straight.rgb), domainSrgb);
    let domainInput = vec4<f32>(domainRgb, straight.a);
    let transformed = vec4<f32>(
        dot(uniforms.uRows[0], domainInput),
        dot(uniforms.uRows[1], domainInput),
        dot(uniforms.uRows[2], domainInput),
        dot(uniforms.uRows[3], domainInput),
    ) + uniforms.uBias;
    let graded = clamp(transformed, vec4<f32>(0.0), vec4<f32>(1.0));
    let outRgb = select(graded.rgb, srgbToLinear(graded.rgb), domainSrgb);

    return vec4<f32>(outRgb * graded.a, graded.a);
}
