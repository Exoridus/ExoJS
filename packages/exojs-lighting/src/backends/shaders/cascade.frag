#version 300 es
precision highp float;
precision highp int;

// The cascade above this one, already merged. A 1x1 placeholder stands in for
// the top of the chain, where `uMerge` is zero and nothing reads it.
uniform sampler2D uTexture;
// Distance out of the nearest surface in `r`, and that plus the depth into
// one in `g`, both as a fraction of `uFar`.
uniform sampler2D uDistance;
// What emits, at the same place in the world as the distance field. Alpha is
// the emitter's shape; a surface with none is a wall, and its colour there is
// what it bounces.
uniform sampler2D uEmission;
// Per probe of this level, how much of the way to each of the four coarser
// probes around it is open: `x` to the one left and above, `y` right and
// above, `z` left and below, `w` right and below.
uniform sampler2D uVisibility;
// Wherever a source's colour is, its cone: outer and inner cosines in `rg`,
// the axis in `ba`. Zero where nothing described one.
uniform sampler2D uEmitterCone;

out vec4 fragColor;

const float TAU = 6.28318530718;
/**
 * Hard ceiling on a ray's walk. Sphere tracing converges in far fewer in the
 * open; the ceiling is what a ray running along a wall spends, a texel or two
 * at a time, before it gives up on the far end of a coarse interval.
 */
const int MAX_STEPS = 128;
/**
 * Distance, in texels, at or below which a sample is on a surface: what a
 * walk lands within when it steps by the field's own value.
 */
const float HIT = 0.25;
/** Emission coverage below which a surface is a wall rather than a source. */
const float WALL = 0.05;
/** Depth that says "no encounter pending". */
const float NOTHING = -1e8;

/**
 * World position to a lookup in the fields, which cover the camera's view and
 * a margin around it, turned and scaled as the camera is.
 *
 * Flipped on v because WebGL2 writes a render target bottom-up and every field
 * is a render target. The WGSL half flips the other way.
 */
vec2 fieldUv(vec2 world) {
    vec2 clip = vec2(dot(uniforms.uToField.xy, world), dot(uniforms.uToField.zw, world)) + uniforms.uFieldOffset;

    return clip * 0.5 + 0.5;
}

/**
 * The share of a cone of half-width `width` that a surface takes when the
 * cone's axis reaches `depth` into it - negative when the axis misses it by
 * that much. A box cone: what is inside is what is covered, so the shares of
 * neighbouring rays add up to one wherever a surface's edge falls.
 */
float share(float depth, float width) {
    return clamp(0.5 + depth / (2.0 * max(width, 0.0001)), 0.0, 1.0);
}

/**
 * A source's colour where a ray reads it, through the source's cone: light
 * leaves the source along the ray, against the direction the ray walked, and
 * a cone light gives none of it outside its own opening. A point light wrote
 * both cosines as -1, which no direction can fail; a wall wrote nothing.
 */
vec3 sourceColour(vec2 colourAt, vec2 direction) {
    vec2 uv = fieldUv(colourAt);
    vec3 colour = texture(uEmission, uv).rgb;
    vec4 cone = texture(uEmitterCone, uv);

    if (dot(cone.zw, cone.zw) < 0.5) {
        return colour;
    }

    float alignment = dot(-direction, normalize(cone.zw));
    float coneTerm = cone.x == cone.y ? step(cone.x, alignment) : smoothstep(cone.x, cone.y, alignment);

    return colour * coneTerm;
}

/**
 * What a walk amounts to with its open encounter settled: the radiance found
 * in `rgb`, what got through in `a`.
 */
vec4 settle(vec3 found, float through, float depth, float width, vec2 colourAt, vec2 direction) {
    if (depth == NOTHING) {
        return vec4(found, through);
    }

    float taken = share(depth, width);

    return vec4(found + through * taken * sourceColour(colourAt, direction), through * (1.0 - taken));
}

/**
 * What a directional light puts into a ray that reached open sky: its whole
 * radiance concentrated into the rays within its own angular size, shared
 * between neighbouring rays by the same box cone as everything else, so the
 * average over a probe's directions is the light's intensity.
 */
vec3 sky(vec2 direction, float sector) {
    if (uniforms.uSun.w <= 0.0) {
        return vec3(0.0);
    }

    // The rays that see the sun point AT it: against the direction it travels.
    float away = acos(clamp(dot(direction, -uniforms.uSun.xy), -1.0, 1.0));

    return uniforms.uSunColor * (uniforms.uSun.w * share(uniforms.uSun.z - away, sector));
}

/**
 * Walk one ray, and report what it amounts to at each of four travel
 * distances - one per probe of the cascade above that this ray will be merged
 * with, at the distance where that probe's own ray in this direction begins.
 *
 * A ray is a CONE, not a line: it owns one angular sector of its probe, so at
 * distance `t` it is `t * tan(pi / directions)` wide to either side, and the
 * rays of one probe tile the circle. What a source takes of a ray is the share
 * of that width its own edge cuts off, measured from how deep the ray's axis
 * reaches into it or how narrowly the axis misses it. Weighted that way the
 * rays of a probe see a source as exactly its angular size, wherever it sits
 * between their directions; with a binary hit, or a hit weighted by whatever
 * the walk happened to read at its last step, a source a few texels across is
 * found by a whole number of rays, that number changes as the source moves,
 * and the field breaks into blotches that flicker.
 *
 * A source is walked THROUGH to find how deep the axis went, and the cone's
 * remainder carries on past it. A wall is not: it takes the whole cone, since
 * the part of the cone that missed the wall's edge here would hit its face a
 * step further on - and what it puts into the ray is whatever the wall itself
 * bounces.
 */
void trace(vec2 origin, vec2 direction, vec4 ends, out vec4 results[4]) {
    float minStep = max(uniforms.uTexel, 0.0001);
    float end = max(max(ends.x, ends.y), max(ends.z, ends.w));
    float travelled = uniforms.uRange.x;
    float through = 1.0;
    vec3 found = vec3(0.0);
    // The encounter still open: how deep the axis has reached into (or how
    // close it came to) the surface at hand, where its colour is read, at what
    // travel, and how wide the cone was there.
    float depth = NOTHING;
    vec2 colourAt = vec2(0.0);
    float atTravel = 0.0;
    float width = minStep;
    bool inside = false;
    // A source the walk BEGINS inside of belongs to the level below, whose
    // interval it straddles: the ray that merges this one has walked it, and
    // scaling that ray's remainder by a second reading of the same source is
    // what put a bright ring at every interval boundary. The finest level has
    // no level below it, and keeps what it starts in.
    bool skipping = false;
    // Just out of a source: the field still reads that source, and a near
    // miss of it would count it twice.
    bool leaving = false;
    float previous = 1e8;
    float stepped = 0.0;
    float entered = 0.0;
    bvec4 reported = bvec4(false);

    for (int taken = 0; taken < MAX_STEPS; taken++) {
        // Each end is reported by the first sample at or past it: what the ray
        // amounts to there is what it had settled by then, plus a near miss
        // whose closest point lies before it - one further on is the coarser
        // ray's to find. An end reached inside a source waits for the exit:
        // the coarser ray starts inside that source and leaves it alone, so
        // this ray has to carry the whole of it, and how much that is cannot
        // be known before the far side.
        for (int index = 0; index < 4; index++) {
            if (!reported[index] && !inside && travelled >= ends[index]) {
                results[index] = settle(found, through, atTravel <= ends[index] ? depth : NOTHING, width, colourAt, direction);
                reported[index] = true;
            }
        }

        if (travelled >= end) {
            break;
        }

        vec2 here = origin + direction * travelled;
        vec2 uv = fieldUv(here);

        // Outside the fields there is nothing known, and a ray that leaves them
        // cannot be told apart from one that found nothing - so it carries on
        // as unoccluded rather than ending in shadow.
        if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
            break;
        }

        vec2 field = texture(uDistance, uv).rg * uniforms.uFar;

        field.g -= field.r;

        // The ray's own half-width here. NOT floored at a texel: the widths of a
        // probe's rays have to tile the circle for their shares to add up to
        // one, and near the start of an interval a ray is narrower than a texel.
        float cone = travelled * uniforms.uCone;

        if (field.r <= HIT * minStep) {
            if (!inside) {
                // A pending near miss of the surface being entered is this
                // same surface, approached; one left further back is not.
                if (depth != NOTHING && travelled - atTravel > 2.0 * max(width, minStep)) {
                    vec4 settled = settle(found, through, depth, width, colourAt, direction);

                    found = settled.rgb;
                    through = settled.a;
                }

                // Read a step in, where a source's colour is and a wall's
                // bounce sits, rather than on the edge the walk stopped at.
                vec2 within = here + direction * minStep;
                vec4 emission = texture(uEmission, fieldUv(within));

                if (emission.a < WALL) {
                    found += through * emission.rgb;
                    through = 0.0;
                    depth = NOTHING;

                    break;
                }

                inside = true;
                skipping = taken == 0 && uniforms.uRange.x > 0.0;
                depth = NOTHING;
                colourAt = within;
                entered = travelled;
            }

            if (!skipping && field.g > depth) {
                depth = field.g;
                atTravel = travelled;
                width = cone;
            }

            previous = 1e8;
            travelled += max(field.g, minStep);

            continue;
        }

        if (inside) {
            // The deepest point of a chord is its middle, and the samples along
            // it were a texel apart: read the depth there once, exactly, rather
            // than settle for the nearest sample to it.
            if (!skipping) {
                float midway = 0.5 * (entered + travelled);
                vec2 there = texture(uDistance, fieldUv(origin + direction * midway)).rg * uniforms.uFar;

                if (there.g - there.r > depth) {
                    depth = there.g - there.r;
                    atTravel = midway;
                    width = midway * uniforms.uCone;
                }
            }

            vec4 settled = settle(found, through, depth, width, colourAt, direction);

            found = settled.rgb;
            through = settled.a;
            inside = false;
            skipping = false;
            leaving = true;
            depth = NOTHING;
        }

        if (leaving) {
            leaving = field.r <= max(cone, minStep);
        } else if (previous < 1e7) {
            // The closest the segment from the previous sample to this one
            // came to the surface, from the two distances at its ends and the
            // segment's own length - the nearest point is between the samples,
            // not at either of them. A first sample has no segment: the surface
            // it reads may be beside the ray, or behind where it began, and
            // only the second sample can tell.
            float along = clamp((stepped * stepped + field.r * field.r - previous * previous) / (2.0 * stepped), 0.0, stepped);
            float nearest = sqrt(max(field.r * field.r - along * along, 0.0));

            if (-nearest > depth) {
                vec2 foot = here - direction * along;

                // The estimate assumes a flat surface; the field read at the
                // foot of it is the truth for a curved one, and never further.
                depth = -min(nearest, texture(uDistance, fieldUv(foot)).r * uniforms.uFar);
                colourAt = foot;
                atTravel = travelled - along;
                width = max(travelled - along, 0.0) * uniforms.uCone;
            }
        }

        previous = field.r;
        // Sphere tracing: a step of the distance to the nearest surface cannot
        // pass through one, which is what makes a whole cascade affordable
        // where marching a texel at a time is not.
        stepped = max(field.r, minStep);
        travelled += stepped;
    }

    vec4 settled = settle(found, through, depth, width, colourAt, direction);

    for (int index = 0; index < 4; index++) {
        if (!reported[index]) {
            results[index] = settled;
        }
    }
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
    vec4 results[4];

    if (uniforms.uMerge < 0.5) {
        trace(origin, heading, vec4(uniforms.uRange.y), results);

        // The top of the chain: what got through here reached the sky, and a
        // directional light is what the sky holds.
        fragColor = vec4(results[0].rgb + results[0].a * sky(heading, 0.5 * sector), 1.0);

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
    // Weighted as well by how much of the way to each coarser probe is open: a
    // probe beside a wall would otherwise take half its light from probes on
    // the far side of it, and the wall's shadow would glow along its edge.
    vec4 open = texelFetch(uVisibility, probe, 0);
    ivec2 corners[4];
    vec4 ends;
    vec4 shares;

    // Each coarser probe's ray in this direction begins a fixed distance from
    // THAT probe, which along this ray is short of or past where this level's
    // interval ends by the probe's own offset. Ending the walk there, per
    // probe, is what makes the two intervals meet: one end for all four would
    // leave a gap towards the probes ahead and count the band twice towards
    // the ones behind, and either shows as a ring of blotches at the boundary.
    for (int index = 0; index < 4; index++) {
        ivec2 corner = clamp(base + ivec2(index % 2, index / 2), ivec2(0), coarseProbes - 1);
        vec2 coarseOrigin = uniforms.uOrigin + (vec2(corner) + 0.5) * coarseSpacing;

        corners[index] = corner;
        ends[index] = uniforms.uRange.y + dot(coarseOrigin - origin, heading);
        shares[index] = bilinear(weight, index) * open[index];
    }

    float totalShare = shares.x + shares.y + shares.z + shares.w;

    // Every way blocked: fall back to the plain weights rather than to darkness.
    if (totalShare <= 0.0) {
        for (int index = 0; index < 4; index++) {
            shares[index] = bilinear(weight, index);
        }

        totalShare = 1.0;
    }

    trace(origin, heading, ends, results);

    vec3 total = vec3(0.0);

    for (int index = 0; index < 4; index++) {
        vec4 walked = results[index];

        // Scaled by what got through: a ray that ended on a surface is already
        // carrying that surface's radiance, and one that grazed it carries
        // part of both.
        if (walked.a > 0.0) {
            walked.rgb += walked.a * coarseRays(corners[index], direction, coarseTile);
        }

        total += walked.rgb * (shares[index] / totalShare);
    }

    fragColor = vec4(total, 1.0);
}
