struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) texcoord: vec2<f32>,
};

@group(0) @binding(0)
var sourceTexture: texture_2d<f32>;
@group(0) @binding(1)
var sourceSampler: sampler;

@vertex
fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    var positions = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>(3.0, -1.0),
        vec2<f32>(-1.0, 3.0)
    );
    // Y is flipped vs the position array: NDC Y points up, but texture UV
    // Y points down (UV (0,0) is the top-left of the source). Matching the
    // two ensures that the output texture's top-left pixel samples from the
    // source's top-left, so every mip level has the same orientation as the
    // level above it. Prior to this, odd mip levels were rendered upside
    // down, producing visible texture flips at view-size doublings.
    var texcoords = array<vec2<f32>, 3>(
        vec2<f32>(0.0, 1.0),
        vec2<f32>(2.0, 1.0),
        vec2<f32>(0.0, -1.0)
    );
    var output: VertexOutput;

    output.position = vec4<f32>(positions[vertexIndex], 0.0, 1.0);
    output.texcoord = texcoords[vertexIndex];

    return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
    return textureSample(sourceTexture, sourceSampler, input.texcoord);
}
