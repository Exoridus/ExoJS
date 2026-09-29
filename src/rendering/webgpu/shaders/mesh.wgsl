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
    let resolvedSample = associateSampledColor(sample, input.premultiplySample == 1u);

    // The authored per-vertex colour and per-node tint are decoded once,
    // premultiplied each, then combined with the sample by a single
    // component-wise multiply. `resolvedSample` is already premultiplied, so
    // multiplying the two premultiplied factors into it associates the result
    // exactly once.
    let linearVertexRgb = srgbToLinear(input.color.rgb);
    let vertexPremultiplied = vec4<f32>(linearVertexRgb * input.color.a, input.color.a);
    let linearTintRgb = srgbToLinear(uniforms.tint.rgb);
    let tintPremultiplied = vec4<f32>(linearTintRgb * uniforms.tint.a, uniforms.tint.a);

    return resolvedSample * vertexPremultiplied * tintPremultiplied;
}
