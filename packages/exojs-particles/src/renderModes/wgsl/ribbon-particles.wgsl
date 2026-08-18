struct ProjectionUniforms {
    projection: mat4x4<f32>,
    translation: mat4x4<f32>,
    flags: vec4<f32>,
    localBounds: vec4<f32>,    // quadMin.xy, quadSize.xy — unused by this mode
    uvBounds: vec4<f32>,       // uvMin.xy, uvMax.xy — unused by this mode
};

@group(0) @binding(0)
var<uniform> uniforms: ProjectionUniforms;

@group(1) @binding(0)
var particleTexture: texture_2d<f32>;

@group(1) @binding(1)
var particleSampler: sampler;

// Per-vertex attributes (two vertices per particle, 20 bytes each).
struct VertexInput {
    @location(0) position: vec2<f32>,         // strip vertex in system-local space
    @location(1) texcoord: vec2<f32>,         // u along the strip, v across it
    @location(2) color: vec4<f32>,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) texcoord: vec2<f32>,
    @location(1) color: vec4<f32>,
};

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;

    // The strip is already expanded on the CPU — each vertex carries its final
    // system-local position, so there is no per-particle transform to rebuild here.
    output.position = uniforms.projection * uniforms.translation * vec4<f32>(input.position, 0.0, 1.0);
    output.texcoord = input.texcoord;
    output.color = vec4(input.color.rgb * input.color.a, input.color.a);

    return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
    let sample = textureSample(particleTexture, particleSampler, input.texcoord);
    let premultipliedSample = select(sample, vec4(sample.rgb * sample.a, sample.a), uniforms.flags.x > 0.5);

    return premultipliedSample * input.color;
}
