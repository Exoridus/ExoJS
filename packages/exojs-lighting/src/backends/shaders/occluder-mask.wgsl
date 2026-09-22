// One occluder segment rasterised into the mask, two texels wide, its coverage
// fading across that width. The engine prepends the instancing contract.
struct VertexInput {
    @location(0) position: vec2<f32>,
    @location(6) nodeIndex: u32,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    // Distance across the segment, in texels, -1..1.
    @location(0) across: f32,
};

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;

    output.position = vec4<f32>(exoInstanceClipPosition(input.position, input.nodeIndex), 0.0, 1.0);
    // The quad's own y runs -0.5..0.5 across the segment, which the transform
    // makes a texel to either side of the edge.
    output.across = input.position.y * 2.0;

    return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
    // Full coverage on the edge, none a texel away, and linear between: what
    // reads the mask takes a texel's coverage as where inside it the edge
    // runs, so the edge is placed to a fraction of a texel rather than snapped
    // to the grid - and a wall at an angle casts a straight shadow instead of a
    // stepped one. Lifted a little above the ramp, so that a segment lying
    // exactly on a texel boundary - a tile edge, most of the time - still
    // seeds the texels on both sides rather than neither: at half a texel out
    // the coverage is then six tenths, not the threshold itself.
    let coverage = clamp(1.1 - abs(input.across), 0.0, 1.0);

    return vec4<f32>(coverage, coverage, coverage, coverage);
}
