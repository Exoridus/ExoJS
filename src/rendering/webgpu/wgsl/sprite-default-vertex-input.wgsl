// Per-instance vertex layout (32 bytes per sprite). The four corners
// of the quad are derived from @builtin(vertex_index) 0..3 inside the
// vertex shader — there is no per-vertex stream. The world transform AND the
// tint are fetched from the shared transform storage buffer keyed by nodeIndex
// instead of being packed inline.
struct VertexInput {
    @location(0) localBounds: vec4<f32>,        // left, top, right, bottom (local space)
    @location(3) uvBounds: vec4<f32>,           // uMin, vMin, uMax, vMax (CPU pre-swaps for flipY)
    @location(5) packedSlotFlags: u32,          // bits 0..7 = slot, bit 8 = premultiply
    @location(6) nodeIndex: u32,                // row into the shared transform storage buffer
};
