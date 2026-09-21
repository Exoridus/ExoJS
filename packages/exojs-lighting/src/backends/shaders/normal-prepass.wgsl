// One normal-prepass quad: the instance transform maps the unit quad onto the
// drawable's own box in world space, and the frame rectangle and local-to-world
// basis travel as instance attributes. The engine prepends the instancing
// contract.
struct VertexInput {
    @location(0) position: vec2<f32>,
    @location(6) nodeIndex: u32,
    @location(7) frame: vec4<f32>,
    @location(8) basis: vec4<f32>,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
    @location(1) @interpolate(flat) basis: vec4<f32>,
};

// The drawable's own texture, read for its alpha only: the quad is a rectangle
// and the silhouette inside it is what actually has a surface.
@group(2) @binding(1) var u_albedo: texture_2d<f32>;
@group(2) @binding(2) var u_albedoSampler: sampler;
@group(2) @binding(3) var u_normalMap: texture_2d<f32>;
@group(2) @binding(4) var u_normalMapSampler: sampler;

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;

    output.position = vec4<f32>(exoInstanceClipPosition(input.position, input.nodeIndex), 0.0, 1.0);
    output.uv = input.frame.xy + input.position * input.frame.zw;
    output.basis = input.basis;

    return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
    let coverage = textureSample(u_albedo, u_albedoSampler, input.uv).a;

    // Rotated by the instance's local-to-world basis, the same way the forward
    // renderer does it in the sprite stage, so a spinning or mirrored drawable
    // keeps its bumps facing the right way and both renderers agree.
    // Green above the midpoint means "leans towards the top of the image" in
    // the canonical OpenGL convention, and the top of a drawable is local -y
    // here, so the tangent normal's y is negated on the way in. A source
    // authored the other way up arrives with its `(b, d)` basis column already
    // negated, which undoes that.
    let encodedNormal = textureSample(u_normalMap, u_normalMapSampler, input.uv).xyz * 2.0 - 1.0;
    let tangentNormal = vec3<f32>(encodedNormal.x, -encodedNormal.y, encodedNormal.z);
    let axisX = normalize(vec2<f32>(input.basis.x, input.basis.z));
    let axisY = normalize(vec2<f32>(input.basis.y, input.basis.w));
    let normal = normalize(vec3<f32>(axisX * tangentNormal.x + axisY * tangentNormal.y, tangentNormal.z));

    // Alpha is coverage, not opacity: the light pass reads it as "a surface was
    // described here" and falls back to an unattenuated term where it is zero.
    // Premultiplied, so the pass's ordinary blend resolves an overlap the way
    // the frame did - the topmost opaque surface wins, a translucent one mixes.
    return vec4<f32>((normal * 0.5 + 0.5) * coverage, coverage);
}
