@vertex
fn vertexMain(input: VertexInput, @builtin(vertex_index) vid: u32) -> VertexOutput {
    // This instance's world transform and tint, keyed by nodeIndex into the
    // shared per-frame storage.
    let slot = transforms[input.nodeIndex];

    return spriteVertexCore(input.localBounds, input.uvBounds, slot.m0, slot.m1, tints[input.nodeIndex], input.packedSlotFlags, vid);
}
