@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
    // Compute screen-space derivatives in uniform control flow before the
    // per-slot switch (see buildSpriteTextureSlotWgsl for why sampling takes
    // explicit derivatives).
    let ddx = dpdx(input.texcoord);
    let ddy = dpdy(input.texcoord);
    let sample = sampleTexture(input.textureSlot & 0xffu, input.texcoord, ddx, ddy);
    let resolvedSample = select(sample, vec4(sample.rgb * sample.a, sample.a), ((input.textureSlot >> 8u) & 1u) == 1u);

    return resolvedSample * input.color;
}
