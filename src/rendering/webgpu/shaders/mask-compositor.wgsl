struct ProjectionUniforms {
    matrix: mat4x4<f32>,
};

@group(0) @binding(0)
var<uniform> projection: ProjectionUniforms;

@group(1) @binding(0)
var contentTexture: texture_2d<f32>;
@group(1) @binding(1)
var contentSampler: sampler;
@group(1) @binding(2)
var maskTexture: texture_2d<f32>;
@group(1) @binding(3)
var maskSampler: sampler;

struct VertexInput {
    @location(0) position: vec2<f32>,
    @location(1) texcoord: vec2<f32>,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) texcoord: vec2<f32>,
};

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;

    output.position = projection.matrix * vec4<f32>(input.position, 0.0, 1.0);
    output.texcoord = input.texcoord;

    return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
    let contentColor = textureSample(contentTexture, contentSampler, input.texcoord);
    let maskAlpha = textureSample(maskTexture, maskSampler, input.texcoord).a;

    return vec4<f32>(contentColor.rgb * maskAlpha, contentColor.a * maskAlpha);
}
