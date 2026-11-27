// The finest cascade read back out as the light arriving at each fragment, shaded
// against the surface normal the prepass described there,
// with the way from the fragment to each probe walked rather than assumed.
//
// The bindings, the version directive and the transport chunk are prepended by
// the module that builds this shader.
//
// A probe is not where the light is wanted: it is up to a probe spacing away,
// and what lies between the two is the receiver's own business. Walking it is
// the same transfer the merge between two levels makes - what got through
// scales the probe's radiance, and what the stretch crossed on the way is
// added to it - so a fragment on the dark side of a wall no longer takes a
// share of a probe on the lit side.

const float TAU = 6.283185307179586;

/** Height of the assumed light direction over the plane, as a ratio of its length along it. */
const float NORMAL_ELEVATION = 0.6;

/**
 * How much of the light arriving along `direction` a surface with this normal
 * takes, relative to a flat surface. See the WGSL half.
 */
float directionTerm(vec3 normal, float coverage, vec2 direction) {
    float shaded = max(normal.z + dot(normal.xy, direction) / NORMAL_ELEVATION, 0.0);

    return mix(1.0, shaded, coverage);
}

/**
 * What the surface takes of each of the four directions the finest level holds,
 * in the order its texels are laid out, as the mean over the quarter turn each
 * ray owns. See the WGSL half.
 */
vec4 directionWeights(vec3 normal, float coverage) {
    vec4 weights = vec4(0.0);

    for (int bin = 0; bin < 4; bin++) {
        float mean = 0.0;

        for (int sub = 0; sub < 4; sub++) {
            float angle = (float(bin) + (float(sub) + 0.5) * 0.25) * (TAU * 0.25);

            mean += directionTerm(normal, coverage, vec2(cos(angle), sin(angle)));
        }

        weights[bin] = mean * 0.25;
    }

    return weights;
}

/** The radiance one probe carries, each of its four directions weighted by what the surface takes of it. */
vec3 probeRadiance(ivec2 probe, vec4 weights) {
    ivec2 first = probe * 2;

    return (weights.x * texelFetch(uTexture, first, 0).rgb
        + weights.y * texelFetch(uTexture, first + ivec2(1, 0), 0).rgb
        + weights.z * texelFetch(uTexture, first + ivec2(0, 1), 0).rgb
        + weights.w * texelFetch(uTexture, first + ivec2(1, 1), 0).rgb) * 0.25;
}

void main() {
    // The destination is the camera's own target, so its texture coordinate is
    // clip space folded into `0..1`. Back through the camera's inverse, which
    // is what puts a turned camera's probes where its pixels are.
    vec2 clip = vUv * 2.0 - 1.0;
    vec2 world = vec2(dot(uniforms.uToWorld.xy, clip), dot(uniforms.uToWorld.zw, clip)) + uniforms.uWorldOffset;
    // Premultiplied by coverage, as the prepass writes it: zero coverage means
    // nothing described a surface here and the fragment is lit as a plane.
    vec4 encoded = texelFetch(uNormal, ivec2(gl_FragCoord.xy), 0);
    float coverage = encoded.a;
    vec3 normal = vec3(0.0, 0.0, 1.0);

    if (coverage > 0.0) {
        normal = normalize((encoded.rgb / coverage) * 2.0 - 1.0);
    }

    vec2 place = (world - uniforms.uOrigin) / uniforms.uSpacing - 0.5;
    vec2 weight = fract(place);
    ivec2 base = ivec2(floor(place));
    ivec2 probes = ivec2(uniforms.uProbes);
    vec4 weights = directionWeights(normal, coverage);
    vec3 total = vec3(0.0);

    for (int y = 0; y <= 1; y++) {
        for (int x = 0; x <= 1; x++) {
            ivec2 at = clamp(base + ivec2(x, y), ivec2(0), probes - 1);
            float share = (x == 0 ? 1.0 - weight.x : weight.x) * (y == 0 ? 1.0 - weight.y : weight.y);
            vec2 probeAt = uniforms.uOrigin + (vec2(at) + 0.5) * uniforms.uSpacing;
            Transfer walked = traceSegment(world, probeAt);
            // What the walk collected came from the way it went.
            vec2 way = probeAt - world;
            vec2 along = dot(way, way) > 0.0 ? normalize(way) : vec2(1.0, 0.0);

            total += share * (walked.radiance * directionTerm(normal, coverage, along) + walked.transmittance * probeRadiance(at, weights));
        }
    }

    fragColor = vec4(total + uniforms.uAmbient, 1.0);
}
