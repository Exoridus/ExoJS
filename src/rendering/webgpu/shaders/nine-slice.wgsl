struct ProjectionUniforms {
    matrix: mat4x4<f32>,
    group: mat4x4<f32>,
    viewport: vec4<f32>,        // device-pixel snap rect (x, y, width, height)
};

struct TransformSlot {
    m0: vec4<f32>,
    m1: vec4<f32>,
};

@group(0) @binding(0)
var<uniform> projection: ProjectionUniforms;
@group(0) @binding(1)
var<storage, read> transforms: array<TransformSlot>;

@group(1) @binding(0)
var nineSliceTexture: texture_2d<f32>;
@group(1) @binding(1)
var nineSliceSampler: sampler;

struct VertexInput {
    @location(0) quadBounds: vec4<f32>,   // x0, y0, x1, y1
    @location(1) uvBounds: vec4<f32>,     // u0, v0, u1, v1 (normalised, flipY pre-applied)
    @location(2) color: vec4<f32>,        // RGBA tint
    @location(3) nodeIndex: u32,          // transform buffer row
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) texcoord: vec2<f32>,
    @location(1) color: vec4<f32>,
};

// Round one local boundary coordinate to the device grid along an axis whose
// local-to-device scale is scale: floor(L*scale + 0.5) / scale. Pure in the
// boundary value, so two quads sharing a boundary snap identically — seams stay
// closed. Degenerate scales pass the value through unchanged.
fn snapBoundary(localValue: f32, scale: f32) -> f32 {
    if (abs(scale) < 1e-6) {
        return localValue;
    }
    return floor(localValue * scale + 0.5) / scale;
}

@vertex
fn vertexMain(input: VertexInput, @builtin(vertex_index) vid: u32) -> VertexOutput {
    var output: VertexOutput;

    // vid 0..3 → TL, TR, BR, BL (matches static index buffer [0,1,2,0,2,3])
    let cornerX = ((vid + 1u) >> 1u) & 1u;
    let cornerY = vid >> 1u;

    var localX = select(input.quadBounds.x, input.quadBounds.z, cornerX == 1u);
    var localY = select(input.quadBounds.y, input.quadBounds.w, cornerY == 1u);

    let slot = transforms[input.nodeIndex];

    // Geometry boundary snap (slot.m1.z == 2.0, axis-aligned only): round each
    // local corner to the device grid so the quad edges land on whole device
    // pixels. The per-axis device scale is derived from the composed pipeline:
    // device positions of the local origin and the two local unit axes give
    // scaleX/scaleY and the cross-terms. Shared
    // nine-slice quad edges are the same local value, so this pure snap moves
    // both neighbours identically — the internal seams stay closed.
    if (slot.m1.z == 2.0) {
        let vp = projection.viewport.zw;
        let dO = projection.matrix * projection.group * vec4<f32>(slot.m1.x, slot.m1.y, 0.0, 1.0);
        let devO = projection.viewport.xy + (dO.xy * 0.5 + vec2<f32>(0.5)) * vp;
        let dX = projection.matrix * projection.group * vec4<f32>(slot.m1.x + slot.m0.x, slot.m1.y + slot.m0.z, 0.0, 1.0);
        let dY = projection.matrix * projection.group * vec4<f32>(slot.m1.x + slot.m0.y, slot.m1.y + slot.m0.w, 0.0, 1.0);
        let devX = projection.viewport.xy + (dX.xy * 0.5 + vec2<f32>(0.5)) * vp;
        let devY = projection.viewport.xy + (dY.xy * 0.5 + vec2<f32>(0.5)) * vp;
        let scaleX = devX.x - devO.x;
        let scaleY = devY.y - devO.y;
        if (abs(devX.y - devO.y) < 1e-3 && abs(devY.x - devO.x) < 1e-3) {
            localX = snapBoundary(localX, scaleX);
            localY = snapBoundary(localY, scaleY);
        }
    }

    let worldX = slot.m0.x * localX + slot.m0.y * localY + slot.m1.x;
    let worldY = slot.m0.z * localX + slot.m0.w * localY + slot.m1.y;

    var position = projection.matrix * projection.group * vec4<f32>(worldX, worldY, 0.0, 1.0);

    // Render-only pixel snapping (slot.m1.z: 0 = none, non-zero = snap origin).
    // floor(x + 0.5) matches the CPU Math.round policy; WGSL round() is
    // half-to-even. Grid alignment is independent of the y-axis convention
    // because the staged viewport rect is whole device pixels.
    if (slot.m1.z != 0.0) {
        let originClip = projection.matrix * projection.group * vec4<f32>(slot.m1.x, slot.m1.y, 0.0, 1.0);
        let originDevice = projection.viewport.xy + (originClip.xy * 0.5 + vec2<f32>(0.5)) * projection.viewport.zw;
        let snapDelta = (floor(originDevice + vec2<f32>(0.5)) - originDevice) * 2.0 / max(projection.viewport.zw, vec2<f32>(1.0));
        position = vec4<f32>(position.xy + snapDelta, position.z, position.w);
    }
    output.position = position;

    let u = select(input.uvBounds.x, input.uvBounds.z, cornerX == 1u);
    let v = select(input.uvBounds.y, input.uvBounds.w, cornerY == 1u);
    output.texcoord = vec2<f32>(u, v);

    output.color = vec4(input.color.rgb * input.color.a, input.color.a);

    return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
    let sample = textureSample(nineSliceTexture, nineSliceSampler, input.texcoord);
    return sample * input.color;
}
