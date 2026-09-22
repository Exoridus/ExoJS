// Multiplies the drawn frame by the accumulated light. The engine prepends the
// instancing contract.
struct VertexInput {
    @location(0) position: vec2<f32>,
    @location(1) texcoord: vec2<f32>,
    @location(6) nodeIndex: u32,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) texcoord: vec2<f32>,
};

@group(2) @binding(1) var u_frame: texture_2d<f32>;
@group(2) @binding(2) var u_frameSampler: sampler;
@group(2) @binding(3) var u_light: texture_2d<f32>;
@group(2) @binding(4) var u_lightSampler: sampler;

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;

    output.position = vec4<f32>(exoInstanceClipPosition(input.position, input.nodeIndex), 0.0, 1.0);
    output.texcoord = input.texcoord;

    return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
    let frame = textureSample(u_frame, u_frameSampler, input.texcoord);
    let light = textureSample(u_light, u_lightSampler, input.texcoord).rgb;

    // The frame is premultiplied, so scaling its colour by the light keeps the
    // relationship with its alpha intact and an unlit area goes dark rather
    // than transparent.
    // Scaled AFTER the multiply, so a debug view can be brought into range
    // without touching a light, the transport or the bounce history. One at
    // every setting the renderer is actually asked to draw.
    return vec4<f32>(frame.rgb * light * uniforms.u_exposure, frame.a);
}
