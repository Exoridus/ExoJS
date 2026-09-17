// One emitter. The instance transform carries its position and its own size as
// a scale, so the geometry is a unit quad and the fragment stage measures in
// emitter radii. The engine prepends the instancing contract.
struct VertexInput {
    @location(0) position: vec2<f32>,
    @location(6) nodeIndex: u32,
    @location(7) emit: vec4<f32>,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) local: vec2<f32>,
    @location(1) tint: vec4<f32>,
    // Radiance at the emitter's centre, how much of its radius fades, and half
    // its emitting segment in the same radii.
    @location(2) @interpolate(flat) emit: vec4<f32>,
};

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;

    output.position = vec4<f32>(exoInstanceClipPosition(input.position, input.nodeIndex), 0.0, 1.0);
    // Stretched along the emitter's own axis by its half-length, so a segment
    // emitter is a capsule and one that emits from a point is the disc it was.
    output.local = vec2<f32>(input.position.x * (input.emit.z + 1.0), input.position.y);
    output.tint = exoInstanceTint(input.nodeIndex);
    output.emit = input.emit;

    return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
    // A capsule rather than the quad it is drawn as: an emitter is a source
    // with a size, and a square source would put corners into every shadow it
    // casts. A half-length of zero leaves the disc it was.
    let toSegment = vec2<f32>(input.local.x - clamp(input.local.x, -input.emit.z, input.emit.z), input.local.y);
    let edge = smoothstep(1.0, 1.0 - max(input.emit.y, 0.001), length(toSegment));

    return vec4<f32>(input.tint.rgb * (input.emit.x * edge), 1.0);
}
