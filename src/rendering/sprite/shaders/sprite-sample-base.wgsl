// Sample this instance's base texture. `packedSlotFlags` is the opaque
// `input.textureSlot` carrier: bits 0..7 select the texture and bit 8 asks
// the engine to convert its unpremultiplied sample to premultiplied alpha.
// `uv` is normally `input.texcoord` but may be any coordinate the effect
// derives from it. Derivatives are taken here, before the per-slot switch, because
// multi-texture batching makes the slot non-uniform across a quad and
// textureSampleGrad is the only sampling form valid in that control flow.
fn sampleBase(packedSlotFlags: u32, uv: vec2<f32>) -> vec4<f32> {
    let slot = packedSlotFlags & 0xffu;
    let sample = sampleTexture(slot, uv, dpdx(uv), dpdy(uv));
    let premultiplySample = ((packedSlotFlags >> 8u) & 1u) == 1u;
    return select(sample, vec4<f32>(sample.rgb * sample.a, sample.a), premultiplySample);
}
