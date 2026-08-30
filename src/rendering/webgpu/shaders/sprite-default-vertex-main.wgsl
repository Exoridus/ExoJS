@vertex
fn vertexMain(input: VertexInput, @builtin(vertex_index) vid: u32) -> VertexOutput {
    // vid 0..3 → corners in TL, TR, BR, BL order (matches the static index
    // buffer [0,1,2,0,2,3] used for indexed triangle-list drawing). The world
    // transform and the tint are keyed by nodeIndex into the shared per-frame
    // storage: the node tint IS this sprite's tint, which is what lets the path
    // unify with the mesh one and drop the per-instance color stream.
    let slot = transforms[input.nodeIndex];

    return spriteVertexCore(input.localBounds, input.uvBounds, slot.m0, slot.m1, tints[input.nodeIndex], input.packedSlotFlags, vid);
}
