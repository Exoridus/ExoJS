struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) texcoord: vec2<f32>,
    @location(1) color: vec4<f32>,
    // Opaque packed slot/flag word: bits 0..7 select the batch texture slot,
    // bit 8 asks for the sample to be converted to premultiplied alpha. Pass it
    // unchanged to sampleBase(); custom fragments must not interpret it.
    @location(2) @interpolate(flat) textureSlot: u32,
    // World-space position of this fragment and the instance's local-to-world
    // basis (a, b, c, d), for effects that need to know where the sprite sits or
    // how it is oriented, such as lighting a tangent-space normal map.
    @location(3) worldPosition: vec2<f32>,
    @location(4) @interpolate(flat) basis: vec4<f32>,
};

// Round one local boundary coordinate to the device grid along an axis whose
// local-to-device scale is scale: floor(L*scale + 0.5) / scale. Pure in the
// boundary value, so two quads sharing a boundary snap identically — seams stay
// closed.
fn snapBoundary(localValue: f32, scale: f32) -> f32 {
    if (abs(scale) < 1e-6) {
        return localValue;
    }
    return floor(localValue * scale + 0.5) / scale;
}

// One sprite corner, from its already-resolved record: local bounds, UV bounds
// (CPU pre-swaps for flipY), the world transform as m0 = (a, b, c, d) /
// m1 = (tx, ty, snapMode, *), the packed rgba8 tint word, and the opaque
// slot/flag word to forward. `vid` is 0..3 in TL/TR/BR/BL order.
fn spriteVertexCore(
    localBounds: vec4<f32>,
    uvBounds: vec4<f32>,
    m0: vec4<f32>,
    m1: vec4<f32>,
    tintWord: u32,
    packedSlotFlags: u32,
    vid: u32,
) -> VertexOutput {
    var output: VertexOutput;

    let cornerX = ((vid + 1u) >> 1u) & 1u;
    let cornerY = vid >> 1u;

    var localX = select(localBounds.x, localBounds.z, cornerX == 1u);
    var localY = select(localBounds.y, localBounds.w, cornerY == 1u);

    let tint = unpack4x8unorm(tintWord);

    // Geometry boundary snap (m1.z == 2.0, axis-aligned only): round each local
    // corner to the device grid so the quad edges land on whole device pixels.
    // The per-axis device scale is derived from the composed pipeline.
    if (m1.z == 2.0) {
        let vp = projection.viewport.zw;
        let dO = projection.matrix * projection.group * vec4<f32>(m1.x, m1.y, 0.0, 1.0);
        let devO = projection.viewport.xy + (dO.xy * 0.5 + vec2<f32>(0.5)) * vp;
        let dX = projection.matrix * projection.group * vec4<f32>(m1.x + m0.x, m1.y + m0.z, 0.0, 1.0);
        let dY = projection.matrix * projection.group * vec4<f32>(m1.x + m0.y, m1.y + m0.w, 0.0, 1.0);
        let devX = projection.viewport.xy + (dX.xy * 0.5 + vec2<f32>(0.5)) * vp;
        let devY = projection.viewport.xy + (dY.xy * 0.5 + vec2<f32>(0.5)) * vp;
        let scaleX = devX.x - devO.x;
        let scaleY = devY.y - devO.y;
        if (abs(devX.y - devO.y) < 1e-3 && abs(devY.x - devO.x) < 1e-3) {
            localX = snapBoundary(localX, scaleX);
            localY = snapBoundary(localY, scaleY);
        }
    }

    let worldX = m0.x * localX + m0.y * localY + m1.x;
    let worldY = m0.z * localX + m0.w * localY + m1.y;

    var position = projection.matrix * projection.group * vec4<f32>(worldX, worldY, 0.0, 1.0);

    // Render-only pixel snapping (m1.z: 0 = none, non-zero = snap origin): snap
    // the node ORIGIN's device-pixel position and rigid-shift the whole
    // primitive by the same delta. floor(x + 0.5) matches the CPU Math.round
    // policy; WGSL round() is half-to-even. Grid alignment is independent of the
    // y-axis convention because the staged viewport rect is whole device pixels.
    if (m1.z != 0.0) {
        let originClip = projection.matrix * projection.group * vec4<f32>(m1.x, m1.y, 0.0, 1.0);
        let originDevice = projection.viewport.xy + (originClip.xy * 0.5 + vec2<f32>(0.5)) * projection.viewport.zw;
        let snapDelta = (floor(originDevice + vec2<f32>(0.5)) - originDevice) * 2.0 / max(projection.viewport.zw, vec2<f32>(1.0));
        position = vec4<f32>(position.xy + snapDelta, position.z, position.w);
    }

    output.position = position;

    let u = select(uvBounds.x, uvBounds.z, cornerX == 1u);
    let v = select(uvBounds.y, uvBounds.w, cornerY == 1u);
    output.texcoord = vec2<f32>(u, v);

    output.color = vec4<f32>(tint.rgb * tint.a, tint.a);
    output.textureSlot = packedSlotFlags;
    output.worldPosition = vec2<f32>(worldX, worldY);
    output.basis = m0;

    return output;
}
