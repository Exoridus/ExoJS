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
var tileTexture: texture_2d<f32>;
@group(1) @binding(1)
var tileSampler: sampler;

struct VertexInput {
    @location(0) quadBounds: vec4<f32>,   // x0, y0, x1, y1
    @location(1) uvBounds: vec4<f32>,     // uMin, vMin, uMax, vMax (flipX/Y + texture flipY baked)
    @location(2) color: vec4<f32>,        // RGBA tint (layer opacity in alpha)
    @location(3) tileWord: u32,           // transform row (bits 0..28) | diagonal (bit 29)
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) texcoord: vec2<f32>,
    @location(1) color: vec4<f32>,
};

@vertex
fn vertexMain(input: VertexInput, @builtin(vertex_index) vid: u32) -> VertexOutput {
    var output: VertexOutput;

    // vid 0..3 → TL, TR, BR, BL (matches static index buffer [0,1,2,0,2,3])
    let cornerX = ((vid + 1u) >> 1u) & 1u;
    let cornerY = vid >> 1u;

    let localX = select(input.quadBounds.x, input.quadBounds.z, cornerX == 1u);
    let localY = select(input.quadBounds.y, input.quadBounds.w, cornerY == 1u);

    let row = input.tileWord & {{tileRowMask}}u;
    let diagonal = (input.tileWord & {{tileDiagonalBit}}u) != 0u;

    let slot = transforms[row];
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

    // Tile orientation: diagonal transposes the corner-coordinate axes; flipX/Y
    // are baked into the UV corner ordering by the CPU writer.
    var su = cornerX;
    var sv = cornerY;
    if (diagonal) {
        let t = su;
        su = sv;
        sv = t;
    }

    let u = select(input.uvBounds.x, input.uvBounds.z, su == 1u);
    let v = select(input.uvBounds.y, input.uvBounds.w, sv == 1u);
    output.texcoord = vec2<f32>(u, v);

    output.color = vec4(input.color.rgb * input.color.a, input.color.a);

    return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
    let sample = textureSample(tileTexture, tileSampler, input.texcoord);
    return sample * input.color;
}
