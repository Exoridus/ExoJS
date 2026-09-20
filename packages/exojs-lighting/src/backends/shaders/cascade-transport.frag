// One cascade level, with the transport operator in place of the sphere trace.
//
// The probe grid, the intervals and the merge are the ones the field walk
// uses; what changes is how a ray finds what is in its way. The operator
// integrates the sources it crosses and stops at the first wall, so the cone
// share, the emission field and the cone field have no part here: a source is
// a shape in the tables, and what a ray collects from it is the length it
// travels inside it.

//
// The bindings, the version directive and the transport chunk itself are
// prepended by the module that builds this shader: the chunk has to be
// declared after the samplers it reads and before this text uses it.

const float TAU = 6.28318530718;

/**
 * The share of a sector of half-width `sector` that a directional light at
 * `away` from the ray takes, so the average over a probe's directions is the
 * light's own intensity however it falls between them.
 */
float sunShare(float depth, float width) {
    return clamp(0.5 + depth / (2.0 * max(width, 0.0001)), 0.0, 1.0);
}

/**
 * What a directional light puts into a ray that reached open sky: its whole
 * radiance concentrated into the rays within its own angular size.
 */
vec3 sky(vec2 direction, float sector) {
    if (uniforms.uSun.w <= 0.0) {
        return vec3(0.0);
    }

    // The rays that see the sun point AT it: against the direction it travels.
    float away = acos(clamp(dot(direction, -uniforms.uSun.xy), -1.0, 1.0));

    return uniforms.uSunColor * (uniforms.uSun.w * sunShare(uniforms.uSun.z - away, sector));
}

/**
 * The cascade above, for one of its probes: the average of the four
 * directions there that subdivide this ray's own. Taking one would lose three
 * quarters of the angular detail the level above paid for.
 */
vec3 coarseRays(ivec2 probe, int direction, int coarseTile) {
    vec3 sum = vec3(0.0);

    for (int sub = 0; sub < 4; sub++) {
        int coarse = direction * 4 + sub;

        sum += texelFetch(uTexture, probe * coarseTile + ivec2(coarse % coarseTile, coarse / coarseTile), 0).rgb;
    }

    return sum * 0.25;
}

float bilinear(vec2 weight, int index) {
    return (index % 2 == 0 ? 1.0 - weight.x : weight.x) * (index / 2 == 0 ? 1.0 - weight.y : weight.y);
}

void main() {
    int tile = int(uniforms.uTile);
    ivec2 texel = ivec2(gl_FragCoord.xy);
    ivec2 probe = texel / tile;

    // The cascade's texture holds the same number of texels at every level, but
    // a level whose probe grid does not divide it leaves a margin that no probe
    // owns.
    if (probe.x >= int(uniforms.uProbes.x) || probe.y >= int(uniforms.uProbes.y)) {
        fragColor = vec4(0.0, 0.0, 0.0, 1.0);

        return;
    }

    ivec2 within = texel - probe * tile;
    int direction = within.y * tile + within.x;
    float sector = TAU / float(tile * tile);
    float angle = (float(direction) + 0.5) * sector;
    vec2 heading = vec2(cos(angle), sin(angle));
    vec2 origin = uniforms.uOrigin + (vec2(probe) + 0.5) * uniforms.uSpacing;
    vec2 near = origin + heading * uniforms.uRange.x;

    if (uniforms.uMerge < 0.5) {
        Transfer walked = traceSegment(near, origin + heading * uniforms.uRange.y);

        // The top of the chain: what got through here reached the sky, and a
        // directional light is what the sky holds.
        fragColor = vec4(walked.radiance + walked.transmittance * sky(heading, 0.5 * sector), 1.0);

        return;
    }

    // The four probes of the coarser grid around this one, bilinearly weighted:
    // the coarser probes sit at twice the spacing, so a probe here lands
    // halfway between two of them. Taking the nearest one would put the probe
    // grid itself into the picture as blocky steps.
    int coarseTile = tile * 2;
    float coarseSpacing = uniforms.uSpacing * 2.0;
    ivec2 coarseProbes = ivec2((int(uniforms.uProbes.x) + 1) / 2, (int(uniforms.uProbes.y) + 1) / 2);
    vec2 place = (vec2(probe) + 0.5) * 0.5 - 0.5;
    vec2 weight = fract(place);
    ivec2 base = ivec2(floor(place));
    vec3 total = vec3(0.0);

    // Each coarser probe's ray in this direction begins a fixed distance from
    // THAT probe, so the walk that meets it goes to where it begins - one walk
    // per coarser probe, in four slightly different directions.
    //
    // The walk is the only thing that decides how much of a coarser probe
    // reaches here: what it let through scales that probe's radiance, and a
    // way that ends on a wall contributes what it collected before the wall
    // and nothing else. The weights stay the plain bilinear ones, unscaled and
    // unnormalised - a way that is shut needs no weight of its own, and
    // spreading its weight over the open ones would report light that arrived
    // by no path at all.
    for (int index = 0; index < 4; index++) {
        ivec2 corner = clamp(base + ivec2(index % 2, index / 2), ivec2(0), coarseProbes - 1);
        vec2 coarseOrigin = uniforms.uOrigin + (vec2(corner) + 0.5) * coarseSpacing;
        Transfer walked = traceSegment(near, coarseOrigin + heading * uniforms.uRange.y);

        total += bilinear(weight, index) * (walked.radiance + walked.transmittance * coarseRays(corner, direction, coarseTile));
    }

    fragColor = vec4(total, 1.0);
}
