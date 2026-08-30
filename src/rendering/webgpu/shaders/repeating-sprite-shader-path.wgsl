struct ShaderVIn {
    @location(0) quadBounds: vec4<f32>,  // x0,y0,x1,y1
    @location(1) uvParams:   vec4<f32>,  // tilingX, tilingY, offsetU, offsetV
    @location(2) color:      vec4<f32>,  // RGBA tint
    @location(3) nodeIndex:  u32,
};

@vertex
fn shaderVert(input: ShaderVIn, @builtin(vertex_index) vid: u32) -> VOut {
    var out: VOut;
    let cx = ((vid + 1u) >> 1u) & 1u;
    let cy = vid >> 1u;

    let slot = transforms[input.nodeIndex];

    // Local destination boundaries. In geometry mode (slot.m1.z == 2.0,
    // axis-aligned only) they are snapped to the device grid; destW/destH — which
    // drive the tiling UVs — are then derived from the SNAPPED corners so the
    // tile period stays aligned to the snapped destination width.
    var x0 = input.quadBounds.x;
    var y0 = input.quadBounds.y;
    var x1 = input.quadBounds.z;
    var y1 = input.quadBounds.w;

    if (slot.m1.z == 2.0) {
        let s = deviceSnapScale(slot);
        if (s.z == 1.0) {
            x0 = snapBoundary(x0, s.x);
            x1 = snapBoundary(x1, s.x);
            y0 = snapBoundary(y0, s.y);
            y1 = snapBoundary(y1, s.y);
        }
    }

    let lx = select(x0, x1, cx == 1u);
    let ly = select(y0, y1, cy == 1u);

    let destW = x1 - x0;
    let destH = y1 - y0;

    let wx = slot.m0.x * lx + slot.m0.y * ly + slot.m1.x;
    let wy = slot.m0.z * lx + slot.m0.w * ly + slot.m1.y;
    out.pos = snapPosition(projection.matrix * projection.group * vec4<f32>(wx, wy, 0.0, 1.0), slot);

    let u = select(input.uvParams.z, ((lx - x0) / destW) * input.uvParams.x + input.uvParams.z, destW > 0.0);
    let v = select(input.uvParams.w, ((ly - y0) / destH) * input.uvParams.y + input.uvParams.w, destH > 0.0);
    out.uv    = vec2<f32>(u, v);
    out.color = vec4<f32>(input.color.rgb * input.color.a, input.color.a);
    return out;
}

@fragment
fn shaderFrag(input: VOut) -> @location(0) vec4<f32> {
    return textureSample(spriteTexture, spriteSampler, input.uv) * input.color;
}
