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
    // Outer and inner cone half-angles, and the angle of the axis the cone
    // opens along, offset into `0..2pi`.
    @location(2) @interpolate(flat) cone: vec4<f32>,
    @location(3) tint: vec4<f32>,
};

/** Rec. 709 luminance. The same weighting the reader divides by. */
fn luminance(colour: vec3<f32>) -> f32 {
    return dot(colour, vec3<f32>(0.2126, 0.7152, 0.0722));
}

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;

    output.position = vec4<f32>(exoInstanceClipPosition(input.position, input.nodeIndex), 0.0, 1.0);
    let extent = 1.0 + input.emit.y;
    output.local = vec2<f32>(input.position.x * (input.emit.z + extent), input.position.y * extent);
    output.emit = input.emit;
    output.cone = input.cone;
    output.tint = exoInstanceTint(input.nodeIndex);

    return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
    // The same capsule the emitter's colour fills, halo included, so that
    // wherever a ray reads the colour it can read the cone as well.
    let toSegment = vec2<f32>(input.local.x - clamp(input.local.x, -input.emit.z, input.emit.z), input.local.y);
    let distance = length(toSegment);

    if (distance > 1.0 + input.emit.y) {
        discard;
    }

    // The luminance this spot puts into the emission field at this texel,
    // computed from the same terms the emission pass uses so that the two
    // agree texel for texel. Everything is scaled by it and summed, which is
    // what lets the reader recover both a luminance-weighted mean cone and
    // the share of the emission that is subject to a cone at all.
    let texel = max(input.emit.w, 0.001);
    let glow = clamp((1.0 + input.emit.y + texel - distance) / (2.0 * texel), 0.0, 1.0);
    let weight = luminance(input.tint.rgb) * input.emit.x * glow;

    return vec4<f32>(input.cone.xyz * weight, weight);
}
