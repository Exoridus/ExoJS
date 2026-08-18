struct VertexInput {
    @location(0) position: vec2<f32>,
    @location(1) texcoord: vec2<f32>,
    @location(2) color: vec4<f32>,
    @location(6) nodeIndex: u32,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) texcoord: vec2<f32>,
    @location(1) color: vec4<f32>,
    @location(2) tint: vec4<f32>,
    @location(3) @interpolate(flat) premultiplySample: u32,
};

struct TransformSlot {
    m0: vec4<f32>,
    m1: vec4<f32>,
};

struct TransformUniforms {
    projection: mat3x3<f32>,
    group: mat3x3<f32>,
    flags: vec4<f32>,
    viewport: vec4<f32>,        // device-pixel snap rect (x, y, width, height)
};

@group(0) @binding(0) var<uniform> uniforms: TransformUniforms;
@group(0) @binding(1) var<storage, read> transforms: array<TransformSlot>;
// Packed rgba8 tint (r|g|b|a, 8 bits each, unpacked via unpack4x8unorm), one
// u32 per instance.
@group(0) @binding(2) var<storage, read> tints: array<u32>;

@group(1) @binding(0) var meshTexture: texture_2d<f32>;
@group(1) @binding(1) var meshSampler: sampler;

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
    // Shared TransformSlot convention: m0 = (a, b, c, d), m1 = (tx, ty, snapMode, 0),
    // so world = (a*x + b*y + tx, c*x + d*y + ty) — identical to the sprite
    // WGSL and the WebGL2 vertex shaders (see src/rendering/affinePacking.ts).
    // Tint is its own packed rgba8 word, unpacked to 0..1 by the GPU.
    let slot = transforms[input.nodeIndex];
    let tint = unpack4x8unorm(tints[input.nodeIndex]);
    let world = vec3<f32>(
        slot.m0.x * input.position.x + slot.m0.y * input.position.y + slot.m1.x,
        slot.m0.z * input.position.x + slot.m0.w * input.position.y + slot.m1.y,
        1.0
    );

    var output: VertexOutput;
    var position = vec4<f32>((uniforms.projection * uniforms.group * world).xy, 0.0, 1.0);

    // Render-only pixel snapping (slot.m1.z: 0 = none, non-zero = snap origin).
    // Snap the node ORIGIN's device-pixel position and rigid-shift the whole
    // primitive by the same delta. floor(x + 0.5) matches the CPU Math.round
    // policy; WGSL round() is half-to-even. Grid alignment is independent of the
    // y-axis convention because the staged viewport rect is whole device pixels.
    if (slot.m1.z != 0.0) {
        let originClip = (uniforms.projection * uniforms.group * vec3<f32>(slot.m1.x, slot.m1.y, 1.0)).xy;
        let originDevice = uniforms.viewport.xy + (originClip * 0.5 + vec2<f32>(0.5)) * uniforms.viewport.zw;
        let snapDelta = (floor(originDevice + vec2<f32>(0.5)) - originDevice) * 2.0 / max(uniforms.viewport.zw, vec2<f32>(1.0));
        position = vec4<f32>(position.xy + snapDelta, position.z, position.w);
    }
    output.position = position;
    output.texcoord = input.texcoord;
    output.color = input.color;
    output.tint = tint;
    output.premultiplySample = u32(uniforms.flags.x);
    return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
    let sample = textureSample(meshTexture, meshSampler, input.texcoord);
    let resolvedSample = select(sample, vec4(sample.rgb * sample.a, sample.a), input.premultiplySample == 1u);
    let modulated = resolvedSample * input.color * input.tint;
    return vec4<f32>(modulated.rgb * modulated.a, modulated.a);
}
