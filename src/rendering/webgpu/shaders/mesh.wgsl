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

    // Legacy (colorPipelineEnabled == false): unchanged bit-for-bit, including
    // its erroneous second `* alpha` - preserved verbatim until the gate opens.
    let legacyModulated = resolvedSample * input.color * uniforms.tint;
    let legacy = vec4<f32>(legacyModulated.rgb * legacyModulated.a, legacyModulated.a);

    // Gated: decode the authored per-vertex colour and per-node tint once,
    // premultiply each, then combine with the sample by a single component-wise
    // multiply - removing the legacy path's erroneous second `* alpha`.
    let linearVertexRgb = select(input.color.rgb, srgbToLinear(input.color.rgb), colorPipelineEnabled);
    let vertexPremultiplied = vec4<f32>(linearVertexRgb * input.color.a, input.color.a);
    let linearTintRgb = select(uniforms.tint.rgb, srgbToLinear(uniforms.tint.rgb), colorPipelineEnabled);
    let tintPremultiplied = vec4<f32>(linearTintRgb * uniforms.tint.a, uniforms.tint.a);
    let gated = resolvedSample * vertexPremultiplied * tintPremultiplied;

    return select(legacy, gated, colorPipelineEnabled);
}
