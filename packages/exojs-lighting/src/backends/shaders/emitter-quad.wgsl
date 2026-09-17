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
    // Radiance at the emitter's centre, how far past its shape the radiance
    // extends, half its emitting segment, and half a texel - all in radii.
    @location(2) @interpolate(flat) emit: vec4<f32>,
};

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;

    output.position = vec4<f32>(exoInstanceClipPosition(input.position, input.nodeIndex), 0.0, 1.0);
    // Stretched along the emitter's own axis by its half-length, so a segment
    // emitter is a capsule and one that emits from a point is the disc it was,
    // and widened by the halo the radiance extends past the shape.
    let extent = 1.0 + input.emit.y;
    output.local = vec2<f32>(input.position.x * (input.emit.z + extent), input.position.y * extent);
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
    let distance = length(toSegment);
    let texel = max(input.emit.w, 0.001);
    // Alpha is the SHAPE, and it is what the occluder mask takes: a ray ends
    // on it there. The radiance reaches a halo further out, because a ray that
    // stops short of the shape, or passes just beside it, reads its colour
    // from where it stopped - and outside the halo nothing reads it at all.
    // Linear in the distance, not smoothed: the mask's coverage is read back
    // as the sub-texel position of the edge, and only a linear ramp makes
    // that reading exact.
    let shape = clamp((1.0 + texel - distance) / (2.0 * texel), 0.0, 1.0);
    let glow = clamp((1.0 + input.emit.y + texel - distance) / (2.0 * texel), 0.0, 1.0);

    return vec4<f32>(input.tint.rgb * (input.emit.x * glow), shape);
}
