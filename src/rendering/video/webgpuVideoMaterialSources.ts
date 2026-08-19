/**
 * WGSL group(1) binding for the WebGPU video renderer's external-texture path:
 * one `texture_external` plus its sampler, sampled via
 * `textureSampleBaseClampToEdge` — the only sampling function `texture_external`
 * supports (no `textureSampleGrad`, no explicit mip level).
 * @internal
 */
export const videoExternalTextureGroupWgsl = `
@group(1) @binding(0) var videoTexture: texture_external;
@group(1) @binding(1) var videoSampler: sampler;

fn sampleTexture(slot: u32, uv: vec2<f32>, ddx: vec2<f32>, ddy: vec2<f32>) -> vec4<f32> {
    return textureSampleBaseClampToEdge(videoTexture, videoSampler, uv);
}
`;
