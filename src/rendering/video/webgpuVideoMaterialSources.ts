/**
 * WGSL group(1) binding for the WebGPU video renderer's external-texture path:
 * one `texture_external` plus its sampler, sampled via
 * `textureSampleBaseClampToEdge` - the only sampling function `texture_external`
 * supports (no `textureSampleGrad`, no explicit mip level).
 *
 * Unlike a `texture_2d` created from a `rgba8unorm-srgb` view, sampling a
 * `texture_external` never runs a hardware sRGB decode - the WebGPU spec only
 * defines a colour-space *primaries* conversion for it, so the returned RGB is
 * still gamma-encoded. `sampleTexture` decodes it explicitly so this path
 * lands in the same linear space the `texture_2d` fallback's hardware decode
 * already produces. The renderer only takes the external-texture path for a
 * video whose resolved `colorSpace` is `'srgb'` (browser-decoded video's
 * default), so this decode is correct wherever it runs - the same authored-value
 * decode an authored vertex tint gets, because the source kind is fixed for
 * this whole shader.
 * @internal
 */
export const videoExternalTextureGroupWgsl = `
@group(1) @binding(0) var videoTexture: texture_external;
@group(1) @binding(1) var videoSampler: sampler;

fn sampleTexture(slot: u32, uv: vec2<f32>, ddx: vec2<f32>, ddy: vec2<f32>) -> vec4<f32> {
    let sampleColor = textureSampleBaseClampToEdge(videoTexture, videoSampler, uv);
    let linearRgb = srgbToLinear(sampleColor.rgb);

    return vec4<f32>(linearRgb, sampleColor.a);
}
`;
