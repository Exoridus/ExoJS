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

struct VertexInput {
    // Per-instance (one entry per particle, 40 bytes total).
    @location(0) translation: vec2<f32>,
    @location(1) scale: vec2<f32>,
    @location(2) rotation: f32,
    @location(3) color: vec4<f32>,
    @location(4) uvMin: vec2<f32>,            // pre-resolved frame UV (top-left)
    @location(5) uvMax: vec2<f32>,            // pre-resolved frame UV (bottom-right)
    // Per-vertex, from the mode's mesh geometry.
    @location(6) meshPosition: vec2<f32>,
    @location(7) meshTexcoord: vec2<f32>,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) texcoord: vec2<f32>,
    @location(1) color: vec4<f32>,
};

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
    let localPosition = input.meshPosition;

    let radians = radians(input.rotation);
    let sinValue = sin(radians);
    let cosValue = cos(radians);
    let rotated = vec2<f32>(
        (localPosition.x * (input.scale.x * cosValue)) + (localPosition.y * (input.scale.y * sinValue)) + input.translation.x,
        (localPosition.x * (input.scale.x * -sinValue)) + (localPosition.y * (input.scale.y * cosValue)) + input.translation.y
    );

    var output: VertexOutput;

    output.position = uniforms.projection * uniforms.translation * vec4<f32>(rotated, 0.0, 1.0);
    // The mesh's own UVs address the particle's frame rather than the whole
    // texture, so a mesh particle still selects an atlas frame.
    output.texcoord = mix(input.uvMin, input.uvMax, input.meshTexcoord);
    output.color = vec4(input.color.rgb * input.color.a, input.color.a);

    return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
    let sampled = textureSample(particleTexture, particleSampler, input.texcoord);
    let premultipliedSample = select(sampled, vec4(sampled.rgb * sampled.a, sampled.a), uniforms.flags.x > 0.5);

    return premultipliedSample * input.color;
}
