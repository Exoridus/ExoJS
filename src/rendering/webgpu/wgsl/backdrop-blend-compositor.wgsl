struct ProjectionUniforms {
    matrix: mat4x4<f32>,
};

struct BlendUniforms {
    mode: u32,
    opaqueBackdrop: f32,
};

@group(0) @binding(0)
var<uniform> projection: ProjectionUniforms;

@group(1) @binding(0)
var sourceTexture: texture_2d<f32>;
@group(1) @binding(1)
var sourceSampler: sampler;
@group(1) @binding(2)
var backdropTexture: texture_2d<f32>;
@group(1) @binding(3)
var backdropSampler: sampler;

@group(2) @binding(0)
var<uniform> blend: BlendUniforms;

struct VertexInput {
    @location(0) position: vec2<f32>,
    @location(1) texcoord: vec2<f32>,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) texcoord: vec2<f32>,
};

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;

    output.position = projection.matrix * vec4<f32>(input.position, 0.0, 1.0);
    output.texcoord = input.texcoord;

    return output;
}

fn unpremultiply(color: vec4<f32>) -> vec3<f32> {
    if (color.a > 0.0) {
        return color.rgb / color.a;
    }

    return vec3<f32>(0.0);
}

// W3C separable blend B(Cb, Cs) for one channel (straight color in [0, 1]).
// Mode values match the BlendModes enum (src/rendering/types.ts).
fn blendChannel(mode: u32, cb: f32, cs: f32) -> f32 {
    switch mode {
        case 3u { return cb * cs; }                 // Multiply
        case 4u { return cb + cs - cb * cs; }       // Screen
        case 5u { return min(cb, cs); }             // Darken
        case 6u { return max(cb, cs); }             // Lighten
        case 7u { return select(1.0 - 2.0 * (1.0 - cb) * (1.0 - cs), 2.0 * cb * cs, cb <= 0.5); }  // Overlay
        case 8u {                                   // ColorDodge
            if (cb <= 0.0) { return 0.0; }
            return select(min(1.0, cb / (1.0 - cs)), 1.0, cs >= 1.0);
        }
        case 9u {                                   // ColorBurn
            if (cb >= 1.0) { return 1.0; }
            return select(1.0 - min(1.0, (1.0 - cb) / cs), 0.0, cs <= 0.0);
        }
        case 10u { return select(1.0 - 2.0 * (1.0 - cb) * (1.0 - cs), 2.0 * cb * cs, cs <= 0.5); } // HardLight
        case 11u {                                  // SoftLight
            if (cs <= 0.5) { return cb - (1.0 - 2.0 * cs) * cb * (1.0 - cb); }
            let d = select(sqrt(cb), ((16.0 * cb - 12.0) * cb + 4.0) * cb, cb <= 0.25);
            return cb + (2.0 * cs - 1.0) * (d - cb);
        }
        case 12u { return abs(cb - cs); }           // Difference
        case 13u { return cb + cs - 2.0 * cb * cs; } // Exclusion
        default { return min(cb, cs); }             // Darken
    }
}

fn blendSeparable(mode: u32, cb: vec3<f32>, cs: vec3<f32>) -> vec3<f32> {
    return vec3<f32>(blendChannel(mode, cb.x, cs.x), blendChannel(mode, cb.y, cs.y), blendChannel(mode, cb.z, cs.z));
}

// Non-separable helpers (W3C): operate on the whole color.
fn lum(c: vec3<f32>) -> f32 {
    return dot(c, vec3<f32>(0.3, 0.59, 0.11));
}

fn clipColor(input: vec3<f32>) -> vec3<f32> {
    var c = input;
    let l = lum(c);
    let n = min(min(c.x, c.y), c.z);
    let x = max(max(c.x, c.y), c.z);

    if (n < 0.0) { c = l + ((c - l) * l) / (l - n); }
    if (x > 1.0) { c = l + ((c - l) * (1.0 - l)) / (x - l); }

    return c;
}

fn setLum(c: vec3<f32>, l: f32) -> vec3<f32> {
    return clipColor(c + (l - lum(c)));
}

fn sat(c: vec3<f32>) -> f32 {
    return max(max(c.x, c.y), c.z) - min(min(c.x, c.y), c.z);
}

// Map the channels so min -> 0, max -> s, mid -> proportional (W3C SetSat result).
fn setSat(c: vec3<f32>, s: f32) -> vec3<f32> {
    let mn = min(min(c.x, c.y), c.z);
    let mx = max(max(c.x, c.y), c.z);

    return select(vec3<f32>(0.0), (c - mn) * (s / (mx - mn)), mx > mn);
}

fn blendNonSeparable(mode: u32, cb: vec3<f32>, cs: vec3<f32>) -> vec3<f32> {
    switch mode {
        case 14u { return setLum(setSat(cs, sat(cb)), lum(cb)); }  // Hue
        case 15u { return setLum(setSat(cb, sat(cs)), lum(cb)); }  // Saturation
        case 16u { return setLum(cs, lum(cb)); }                   // Color
        default { return setLum(cb, lum(cs)); }                    // Luminosity
    }
}

fn blendAdvanced(mode: u32, cb: vec3<f32>, cs: vec3<f32>) -> vec3<f32> {
    if (mode >= 14u) { return blendNonSeparable(mode, cb, cs); }
    return blendSeparable(mode, cb, cs);
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
    let src = textureSample(sourceTexture, sourceSampler, input.texcoord);
    // copyTextureToTexture preserves the target's top-left orientation, so the
    // backdrop is sampled at the same UV as the quad — no V-flip (unlike the
    // WebGL2 framebuffer-blit path, which reads bottom-left order).
    let dst = textureSample(backdropTexture, backdropSampler, input.texcoord);

    let alphaSource = src.a;
    // An opaque target (the on-screen root canvas, alphaMode 'opaque') has an
    // unreliable captured alpha; force full backdrop coverage so the blend is
    // not skipped. Offscreen RenderTextures carry real alpha.
    let alphaBackdrop = max(dst.a, blend.opaqueBackdrop);
    let colorSource = unpremultiply(src);
    let colorBackdrop = unpremultiply(dst);

    let blended = blendAdvanced(blend.mode, colorBackdrop, colorSource);
    // Cs' = (1 - αb)·Cs + αb·B(Cb, Cs)
    let mixedSource = mix(colorSource, blended, alphaBackdrop);

    // Premultiplied blended source; the GPU source-over composites it over the
    // untouched backdrop already in the target (αs = 0 passes the backdrop through).
    return vec4<f32>(mixedSource * alphaSource, alphaSource);
}
