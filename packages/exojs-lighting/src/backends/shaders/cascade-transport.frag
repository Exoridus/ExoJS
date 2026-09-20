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
 * What a surface a stretch ended on gives back, from the light that fell on it
 * last frame.
 *
 * Only a rasterised surface has anything to give: it is a drawable the camera
 * also drew, so the frame holds its albedo where it stands. A segment is an
 * outline with no material, and this returns nothing for one.
 *
 * Three things have to hold before last frame's light may be read at all. The
 * sample has to sit on the side of the surface the stretch came from, which a
 * step back along the ray gives. That place has to be open NOW, or a wall that
 * has moved into it would hand out the light that stood there before it. And
 * the place has to have been inside the previous frame, since a surface the
 * camera has only just revealed was never lit.
 *
 * What comes out is an artistic term, not a solved bounce: a factor, the
 * albedo, and last frame's light clamped at one so a surface beside a lamp
 * cannot feed the lamp its own light back.
 */
vec3 bounced(vec2 surface, vec2 direction) {
    if (uniforms.uBounce <= 0.0 || uniforms.uHistoryValid < 0.5) {
        return vec3(0.0);
    }

    vec2 free = surface - direction * uniforms.uBounceStep;

    if (maskBlocks(ivec2(floor(maskPlace(free))), uniforms.uMaskCells)) {
        return vec3(0.0);
    }

    // The colour is the surface's own, read where the surface is; the light
    // is what fell on the free side of it. Reading both in one place would
    // either tint the bounce with whatever stands in front of the surface or
    // read the light from inside it.
    vec2 onIt = surface + direction * (uniforms.uBounceStep * 0.5);
    vec2 clip = vec2(dot(uniforms.uToClip.xy, free), dot(uniforms.uToClip.zw, free)) + uniforms.uClipOffset;
    vec2 colourClip = vec2(dot(uniforms.uToClip.xy, onIt), dot(uniforms.uToClip.zw, onIt)) + uniforms.uClipOffset;
    vec2 was = vec2(dot(uniforms.uReproject.xy, clip), dot(uniforms.uReproject.zw, clip)) + uniforms.uReprojectOffset;
    vec2 here = colourClip * 0.5 + 0.5;
    vec2 lit = clip * 0.5 + 0.5;
    vec2 before = was * 0.5 + 0.5;

    if (here.x < 0.0 || here.x > 1.0 || here.y < 0.0 || here.y > 1.0 || lit.x < 0.0 || lit.x > 1.0 || lit.y < 0.0 || lit.y > 1.0) {
        return vec3(0.0);
    }

    if (before.x < 0.0 || before.x > 1.0 || before.y < 0.0 || before.y > 1.0) {
        return vec3(0.0);
    }

    return texture(uFrame, here).rgb * min(texture(uHistory, before).rgb, vec3(1.0)) * uniforms.uBounce;
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
        vec3 gave = walked.rastered > 0.5 ? bounced(walked.surface, heading) : vec3(0.0);

        // The top of the chain: what got through here reached the sky, and a
        // directional light is what the sky holds.
        fragColor = vec4(walked.radiance + gave + walked.transmittance * sky(heading, 0.5 * sector), 1.0);

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
        // A stretch that ended on a drawable carries what that drawable gives
        // back; one that ended on an outline carries only what it collected.
        vec3 gave = walked.rastered > 0.5 ? bounced(walked.surface, normalize(coarseOrigin + heading * uniforms.uRange.y - near)) : vec3(0.0);

        total += bilinear(weight, index) * (walked.radiance + gave + walked.transmittance * coarseRays(corner, direction, coarseTile));
    }

    fragColor = vec4(total, 1.0);
}
