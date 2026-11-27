// The finest cascade read back out as the light arriving at each fragment, shaded
// against the surface normal the prepass described there,
// with the way from the fragment to each probe walked rather than assumed.
//
// The bindings and the transport chunk are prepended by the module that builds
// this shader.
//
// A probe is not where the light is wanted: it is up to a probe spacing away,
// and what lies between the two is the receiver's own business. Walking it is
// the same transfer the merge between two levels makes - what got through
// scales the probe's radiance, and what the stretch crossed on the way is
// added to it - so a fragment on the dark side of a wall no longer takes a
// share of a probe on the lit side.

const TAU: f32 = 6.283185307179586;

/** Height of the assumed light direction over the plane, as a ratio of its length along it. */
const NORMAL_ELEVATION: f32 = 0.6;

/**
 * How much of the light arriving along `direction` a surface with this normal
 * takes, relative to a flat surface.
 *
 * The probes carry the radiance of a plane, so a direction has no height of its
 * own. A surface is lit as if every ray came in from a fixed elevation, and the
 * term is divided by what a flat normal would take: a flat surface keeps the
 * light it had without normals exactly, and the angular mean of a tilted one is
 * only changed by what the horizon clamps off.
 */
fn directionTerm(normal: vec3<f32>, coverage: f32, direction: vec2<f32>) -> f32 {
    let shaded = max(normal.z + dot(normal.xy, direction) / NORMAL_ELEVATION, 0.0);

    return mix(1.0, shaded, coverage);
}

/**
 * What the surface takes of each of the four directions the finest level holds,
 * in the order its texels are laid out. Each is the mean of the term over the
 * quarter turn its ray owns rather than its value at the ray's centre, so a
 * light moving across a sector does not shade a bump with a hard edge.
 */
fn directionWeights(normal: vec3<f32>, coverage: f32) -> vec4<f32> {
    var weights = vec4<f32>(0.0);

    for (var bin = 0; bin < 4; bin = bin + 1) {
        var mean = 0.0;

        for (var sub = 0; sub < 4; sub = sub + 1) {
            let angle = (f32(bin) + (f32(sub) + 0.5) * 0.25) * (TAU * 0.25);

            mean = mean + directionTerm(normal, coverage, vec2<f32>(cos(angle), sin(angle)));
        }

        weights[bin] = mean * 0.25;
    }

    return weights;
}

/** The radiance one probe carries, each of its four directions weighted by what the surface takes of it. */
fn probeRadiance(probe: vec2<i32>, weights: vec4<f32>) -> vec3<f32> {
    let first = probe * 2;

    return (weights.x * textureLoad(uTexture, first, 0).rgb
        + weights.y * textureLoad(uTexture, first + vec2<i32>(1, 0), 0).rgb
        + weights.z * textureLoad(uTexture, first + vec2<i32>(0, 1), 0).rgb
        + weights.w * textureLoad(uTexture, first + vec2<i32>(1, 1), 0).rgb) * 0.25;
}

@fragment
fn fragmentMain(@builtin(position) position: vec4<f32>, @location(0) vUv: vec2<f32>) -> @location(0) vec4<f32> {
    // The destination is the camera's own target, so its texture coordinate is
    // clip space folded into `0..1`, the other way up than in the GLSL half.
    let clip = vec2<f32>(vUv.x * 2.0 - 1.0, 1.0 - vUv.y * 2.0);
    let world = vec2<f32>(dot(uniforms.uToWorld.xy, clip), dot(uniforms.uToWorld.zw, clip)) + uniforms.uWorldOffset;
    // Premultiplied by coverage, as the prepass writes it: zero coverage means
    // nothing described a surface here and the fragment is lit as a plane.
    let encoded = textureLoad(uNormal, vec2<i32>(floor(position.xy)), 0);
    let coverage = encoded.a;
    var normal = vec3<f32>(0.0, 0.0, 1.0);

    if (coverage > 0.0) {
        normal = normalize((encoded.rgb / coverage) * 2.0 - 1.0);
    }

    let place = (world - uniforms.uOrigin) / uniforms.uSpacing - 0.5;
    let weight = fract(place);
    let base = vec2<i32>(floor(place));
    let probes = vec2<i32>(uniforms.uProbes);
    let weights = directionWeights(normal, coverage);
    var total = vec3<f32>(0.0);

    for (var y = 0; y <= 1; y = y + 1) {
        for (var x = 0; x <= 1; x = x + 1) {
            let at = clamp(base + vec2<i32>(x, y), vec2<i32>(0), probes - vec2<i32>(1));
            let share = select(weight.x, 1.0 - weight.x, x == 0) * select(weight.y, 1.0 - weight.y, y == 0);
            let probeAt = uniforms.uOrigin + (vec2<f32>(at) + 0.5) * uniforms.uSpacing;
            let walked = traceSegment(world, probeAt);
            // What the walk collected came from the way it went.
            let way = probeAt - world;
            let along = select(vec2<f32>(1.0, 0.0), normalize(way), dot(way, way) > 0.0);

            total = total + share * (walked.radiance * directionTerm(normal, coverage, along) + walked.transmittance * probeRadiance(at, weights));
        }
    }

    return vec4<f32>(total + uniforms.uAmbient, 1.0);
}
