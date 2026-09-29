// Managed-colour alpha normalization: one unblended, 1:1 pass per authored mip
// level, writing the level it is given and nothing else.
//
// The staging texture holds the STRAIGHT source in the destination's own storage
// format, so sampling it already yields linear RGB and the alpha arrives
// untouched. Multiplying by that alpha therefore premultiplies in linear light,
// and writing into a same-format attachment re-encodes on store: an sRGB
// destination keeps E(linearRGB * alpha), not E(linearRGB) * alpha.
//
// The multiply belongs here, before any filtering. A draw-time multiply would
// filter straight RGB independently of alpha and let a fully transparent texel's
// hidden colour bleed across the edge - the fringe this pass exists to remove,
// and one no shader multiply can undo afterwards.

struct LevelScale {
    // Fraction of the staging texture this level fills. A level smaller than the
    // base level lands in the staging texture's top-left corner and must sample
    // only its own sub-rectangle, or it would read the base level's texels.
    scale: vec2<f32>,
    padding: vec2<f32>,
};

@group(0) @binding(0)
var sourceTexture: texture_2d<f32>;
@group(0) @binding(1)
var sourceSampler: sampler;
@group(0) @binding(2)
var<uniform> levelScale: LevelScale;

@vertex
fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> @builtin(position) vec4<f32> {
    var positions = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>(3.0, -1.0),
        vec2<f32>(-1.0, 3.0)
    );

    return vec4<f32>(positions[vertexIndex], 0.0, 1.0);
}

@fragment
fn fragmentMain(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    // Clip space to texture coordinates directly. WebGPU framebuffer row 0 is the
    // top, which is also texture row 0, so this is a row-for-row copy: the
    // identity the plain `writeTexture` path would have produced. A flipped quad
    // would silently invert every normalized texture.
    let uv = position.xy / vec2<f32>(textureDimensions(sourceTexture, 0));
    let texel = textureSample(sourceTexture, sourceSampler, uv * levelScale.scale);

    return vec4<f32>(texel.rgb * texel.a, texel.a);
}
