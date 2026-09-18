// The bounce quad: the camera's own view rectangle drawn into the emission
// field, so that each fragment lands where the frame's pixel is in the world.
// The instance transform maps the unit quad onto that rectangle, and the
// quad's own corners are the frame's texture coordinates. The engine prepends
// the instancing contract.
struct VertexInput {
    @location(0) position: vec2<f32>,
    @location(1) texcoord: vec2<f32>,
    @location(6) nodeIndex: u32,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) texcoord: vec2<f32>,
    // Where this corner sat in the previous frame's camera, which is the
    // frame the light field being read was gathered through.
    @location(1) history: vec2<f32>,
    // Opaque white scaled by the bounce factor.
    @location(2) tint: vec4<f32>,
};

// The frame the camera drew this frame: the albedo of whatever is there.
@group(2) @binding(1) var u_frame: texture_2d<f32>;
@group(2) @binding(2) var u_frameSampler: sampler;
// The light field the cascades gathered LAST frame, which is what lit that
// albedo.
@group(2) @binding(3) var u_light: texture_2d<f32>;
@group(2) @binding(4) var u_lightSampler: sampler;

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;

    output.position = vec4<f32>(exoInstanceClipPosition(input.position, input.nodeIndex), 0.0, 1.0);
    // The corners run 0..1 from clip -1 to +1 on both axes; WebGPU writes the
    // frame top-down, so its texture space has v flipped against clip y.
    output.texcoord = vec2<f32>(input.texcoord.x, 1.0 - input.texcoord.y);

    // The reprojection is affine, so interpolating the corners is exact and
    // the fragment stage needs no matrix of its own.
    let clip = input.texcoord * 2.0 - 1.0;
    let previous = vec2<f32>(dot(uniforms.uReproject.xy, clip), dot(uniforms.uReproject.zw, clip)) + uniforms.uReprojectOffset;

    output.history = vec2<f32>(previous.x, -previous.y) * 0.5 + 0.5;
    output.tint = exoInstanceTint(input.nodeIndex);

    return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
    let frame = textureSample(u_frame, u_frameSampler, input.texcoord);
    // Nothing outside the previous frame, and nothing at all until one has
    // been gathered: the light target holds whatever the driver left there
    // before the first gather and after every resize, and a surface the camera
    // has only just revealed was never lit. Both read as no bounce for a
    // frame, which is a defined value rather than an invented one.
    let known = uniforms.uHistory > 0.5 && input.history.x >= 0.0 && input.history.x <= 1.0 && input.history.y >= 0.0 && input.history.y <= 1.0;

    // `textureSampleLevel` rather than `textureSample`: the read sits behind a
    // condition the compiler cannot prove uniform across the quad, and an
    // implicit-derivative sample is not allowed there. The light field has no
    // mip chain, so naming level zero costs nothing.
    var light = vec3<f32>(0.0);

    if (known) {
        light = textureSampleLevel(u_light, u_lightSampler, input.history, 0.0).rgb;
    }

    // What a lit surface re-emits: its colour under last frame's light, scaled
    // down, and never more than its colour under full light - a surface next
    // to a lamp is lit many times over, and re-emitting that would feed the
    // lamp its own light back every frame. That ceiling is an artistic clamp,
    // not a conservation law: it bounds the feedback rather than accounting
    // for the energy a real surface would absorb. Alpha stays zero, so the
    // mask still reads a wall as a wall; this only gives it a colour for the
    // rays that end on it. A frame of latency is the price of not solving the
    // transport twice.
    return vec4<f32>(frame.rgb * min(light, vec3<f32>(1.0)) * input.tint.rgb, 0.0);
}
