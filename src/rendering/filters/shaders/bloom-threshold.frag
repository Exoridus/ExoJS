#version 300 es
// highp, not the mediump the other single-sample filters use: the extraction
// divides by the luminance, and a 10-bit mantissa turns that reciprocal into a
// visibly different falloff from the WGSL half, which has no precision
// qualifier and always computes at f32.
precision highp float;
uniform sampler2D uTexture;
in vec2 vUv;
out vec4 fragColor;

// Rec. 709 luma - the same weights the rest of the engine desaturates with.
const vec3 LUMA_WEIGHTS = vec3(0.2126, 0.7152, 0.0722);

void main() {
    vec4 premultiplied = texture(uTexture, vUv);
    float luma = dot(premultiplied.rgb, LUMA_WEIGHTS);
    float knee = uniforms.uKnee;
    // The quadratic arc joins "nothing blooms" to "everything above the
    // threshold blooms" across a band 2*knee wide, so a gradient crossing the
    // threshold does not show the hard line a step() leaves behind.
    float soft = clamp(luma - uniforms.uThreshold + knee, 0.0, 2.0 * knee);
    soft = soft * soft / (4.0 * knee + 1e-5);
    // Only the EXCESS over the threshold blooms, not the whole pixel. An 8-bit
    // target has no headroom above one, so extracting the full colour would let
    // any intensity above one saturate the halo at the first bright pixel.
    float excess = clamp(max(soft, luma - uniforms.uThreshold) / max(luma, 1e-5), 0.0, 1.0);

    // Zero alpha, on purpose: a glow is light the scene EMITS, not coverage it
    // adds. Carrying the extracted alpha instead would composite the halo
    // source-over, so a coloured glow would darken the backdrop it spreads onto
    // and a half-transparent subject would come back opaque.
    fragColor = vec4(premultiplied.rgb * (excess * uniforms.uIntensity), 0.0);
}
