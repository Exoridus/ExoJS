struct GeoVIn {
    @location(0) quadBounds: vec4<f32>,  // x0,y0,x1,y1
    @location(1) uvBounds:   vec4<f32>,  // u0,v0,u1,v1 (normalised, flipY pre-applied)
    @location(2) color:      vec4<f32>,  // RGBA tint
    @location(3) nodeIndex:  u32,
};

@vertex
fn geoVert(input: GeoVIn, @builtin(vertex_index) vid: u32) -> VOut {
    var out: VOut;
    let cx = ((vid + 1u) >> 1u) & 1u;
    let cy = vid >> 1u;

    let slot = transforms[input.nodeIndex];

    var lx = select(input.quadBounds.x, input.quadBounds.z, cx == 1u);
    var ly = select(input.quadBounds.y, input.quadBounds.w, cy == 1u);

    // Geometry boundary snap (slot.m1.z == 2.0, axis-aligned only): round each
    // local corner to the device grid so the segment edges land on whole device
    // pixels. Shared repeat-segment edges are the same local value, so this pure
    // snap moves both neighbours identically — the internal seams stay closed.
    if (slot.m1.z == 2.0) {
        let s = deviceSnapScale(slot);
        if (s.z == 1.0) {
            lx = snapBoundary(lx, s.x);
            ly = snapBoundary(ly, s.y);
        }
    }

    let wx = slot.m0.x * lx + slot.m0.y * ly + slot.m1.x;
    let wy = slot.m0.z * lx + slot.m0.w * ly + slot.m1.y;
    out.pos = snapPosition(projection.matrix * projection.group * vec4<f32>(wx, wy, 0.0, 1.0), slot);

    let u = select(input.uvBounds.x, input.uvBounds.z, cx == 1u);
    let v = select(input.uvBounds.y, input.uvBounds.w, cy == 1u);
    out.uv    = vec2<f32>(u, v);
    out.color = vec4<f32>(input.color.rgb * input.color.a, input.color.a);
    return out;
}

@fragment
fn geoFrag(input: VOut) -> @location(0) vec4<f32> {
    return textureSample(spriteTexture, spriteSampler, input.uv) * input.color;
}
