// One emitter's cone, written over the same capsule its colour fills. The
// engine prepends the instancing contract.
struct VertexInput {
    @location(0) position: vec2<f32>,
    @location(6) nodeIndex: u32,
    @location(7) emit: vec4<f32>,
    @location(8) cone: vec4<f32>,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) local: vec2<f32>,
    @location(1) @interpolate(flat) emit: vec4<f32>,
    // Outer and inner cone half-angles, the angle of the axis the cone opens
    // along offset into `0..2pi`, and a count of one.
    @location(2) @interpolate(flat) cone: vec4<f32>,
};

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;

    output.position = vec4<f32>(exoInstanceClipPosition(input.position, input.nodeIndex), 0.0, 1.0);
    let extent = 1.0 + input.emit.y;
    output.local = vec2<f32>(input.position.x * (input.emit.z + extent), input.position.y * extent);
    output.emit = input.emit;
    output.cone = input.cone;

    return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
    // The same capsule the emitter's colour fills, halo included, so that
    // wherever a ray reads the colour it can read the cone as well. Summed
    // with whatever is already there: the count in `a` is what tells a reader
    // whether the sum describes one emitter or several.
    let toSegment = vec2<f32>(input.local.x - clamp(input.local.x, -input.emit.z, input.emit.z), input.local.y);

    if (length(toSegment) > 1.0 + input.emit.y) {
        discard;
    }

    return input.cone;
}
