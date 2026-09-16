@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;

// Rec. 709 luma - the same weights the rest of the engine desaturates with.
const LUMA_WEIGHTS = vec3<f32>(0.2126, 0.7152, 0.0722);

@fragment
fn fragmentMain(@location(0) vUv: vec2<f32>) -> @location(0) vec4<f32> {
    let premultiplied = textureSample(uTexture, uSampler, vUv);
    let luma = dot(premultiplied.rgb, LUMA_WEIGHTS);
    let knee = uniforms.uKnee;
    // The quadratic arc joins "nothing blooms" to "everything above the
    // threshold blooms" across a band 2*knee wide, so a gradient crossing the
    // threshold does not show the hard line a step() leaves behind.
    var soft = clamp(luma - uniforms.uThreshold + knee, 0.0, 2.0 * knee);
    soft = soft * soft / (4.0 * knee + 1e-5);
    // Only the EXCESS over the threshold blooms, not the whole pixel. An 8-bit
    // target has no headroom above one, so extracting the full colour would let
    // any intensity above one saturate the halo at the first bright pixel.
    let excess = clamp(max(soft, luma - uniforms.uThreshold) / max(luma, 1e-5), 0.0, 1.0);

    // Zero alpha, on purpose: a glow is light the scene EMITS, not coverage it
    // adds. Carrying the extracted alpha instead would composite the halo
    // source-over, so a coloured glow would darken the backdrop it spreads onto
    // and a half-transparent subject would come back opaque.
    return vec4<f32>(premultiplied.rgb * (excess * uniforms.uIntensity), 0.0);
}
