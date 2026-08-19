struct VertexInput {
    @location(0) localBounds: vec4<f32>,
    @location(3) uvBounds: vec4<f32>,
    @location(5) packedSlotFlags: u32, // bits 0..7 = texture slot, bit 8 = premultiply sample
    @location(6) nodeIndex: u32,
};
