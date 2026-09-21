// The finest cascade read back out as the light arriving at each fragment,
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

/** The radiance one probe carries, averaged over every direction it holds. */
vec3 probeRadiance(ivec2 probe, int tile) {
    vec3 total = vec3(0.0);

    for (int y = 0; y < tile; y++) {
        for (int x = 0; x < tile; x++) {
            total += texelFetch(uTexture, probe * tile + ivec2(x, y), 0).rgb;
        }
    }

    return total / float(tile * tile);
}

void main() {
    // The destination is the camera's own target, so its texture coordinate is
    // clip space folded into `0..1`. Back through the camera's inverse, which
    // is what puts a turned camera's probes where its pixels are.
    vec2 clip = vUv * 2.0 - 1.0;
    vec2 world = vec2(dot(uniforms.uToWorld.xy, clip), dot(uniforms.uToWorld.zw, clip)) + uniforms.uWorldOffset;
    // Where this fragment sits in the probe grid, in probe units and measured
    // from probe centres, which is what makes the interpolation below linear in
    // world space.
    vec2 place = (world - uniforms.uOrigin) / uniforms.uSpacing - 0.5;
    vec2 weight = fract(place);
    ivec2 base = ivec2(floor(place));
    ivec2 probes = ivec2(uniforms.uProbes);
    int tile = int(uniforms.uTile);
    vec3 total = vec3(0.0);

    // Bilinear between the four probes around this fragment, each reached by
    // its own walk. The weights are the plain ones: a probe the walk cannot
    // reach contributes nothing, and its weight is not handed to the others.
    for (int y = 0; y <= 1; y++) {
        for (int x = 0; x <= 1; x++) {
            ivec2 at = clamp(base + ivec2(x, y), ivec2(0), probes - 1);
            float share = (x == 0 ? 1.0 - weight.x : weight.x) * (y == 0 ? 1.0 - weight.y : weight.y);
            vec2 probeAt = uniforms.uOrigin + (vec2(at) + 0.5) * uniforms.uSpacing;
            Transfer walked = traceSegment(world, probeAt);

            total += share * (walked.radiance + walked.transmittance * probeRadiance(at, tile));
        }
    }

    fragColor = vec4(total + uniforms.uAmbient, 1.0);
}
