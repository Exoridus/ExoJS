@vertex
fn vertexMain(@builtin(instance_index) instance: u32, @builtin(vertex_index) vid: u32) -> VertexOutput {
    let slotIndex = order[instance];
    let quad = quads[slotIndex];
    let slot = transforms[slotIndex];
    let textureSlot = u32(slot.m1.w);
    let premultiply = (projection.premultiplyMask >> textureSlot) & 1u;

    return spriteVertexCore(quad.bounds, quad.uv, slot.m0, slot.m1, tints[slotIndex], textureSlot | (premultiply << 8u), vid);
}
