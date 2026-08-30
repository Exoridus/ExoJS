struct VertexInput {
    @location(0) position: vec2<f32>,
    @location(1) texcoord: vec2<f32>,
    @location(2) color: vec4<f32>,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) texcoord: vec2<f32>,
    @location(1) color: vec4<f32>,
    @location(2) @interpolate(flat) premultiplySample: u32,
};

struct TintUniform {
    tint: vec4<f32>,
    flags: vec4<f32>,
};

@group(0) @binding(0) var<uniform> uniforms: TintUniform;

@group(1) @binding(0) var meshTexture: texture_2d<f32>;
@group(1) @binding(1) var meshSampler: sampler;

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;
    output.position = vec4<f32>(input.position, 0.0, 1.0);
    output.texcoord = input.texcoord;
    output.color = input.color;
    output.premultiplySample = u32(uniforms.flags.x);
    return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
    let sample = textureSample(meshTexture, meshSampler, input.texcoord);
    let resolvedSample = select(sample, vec4(sample.rgb * sample.a, sample.a), input.premultiplySample == 1u);
    let modulated = resolvedSample * input.color * uniforms.tint;
    return vec4<f32>(modulated.rgb * modulated.a, modulated.a);
}
