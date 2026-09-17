// The cascade above this one, already merged. A 1x1 placeholder stands in for
// the top of the chain, where `uMerge` is zero and nothing reads it.
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;
// Distance out of the nearest surface in `r`, and that plus the depth into
// one in `g`, both as a fraction of `uFar`.
@group(1) @binding(1) var uDistance: texture_2d<f32>;
@group(1) @binding(2) var uDistanceSampler: sampler;
// What emits, at the same place in the world as the distance field. Alpha is
// the emitter's shape; a surface with none is a wall, and its colour there is
// what it bounces.
@group(1) @binding(3) var uEmission: texture_2d<f32>;
@group(1) @binding(4) var uEmissionSampler: sampler;
// Per probe of this level, how much of the way to each of the four coarser
// probes around it is open: `x` to the one left and above, `y` right and
// above, `z` left and below, `w` right and below.
@group(1) @binding(5) var uVisibility: texture_2d<f32>;
@group(1) @binding(6) var uVisibilitySampler: sampler;
// Wherever a source's colour is, its cone: outer and inner cosines in `rg`,
// the axis in `ba`. Zero where nothing described one.
@group(1) @binding(7) var uEmitterCone: texture_2d<f32>;
@group(1) @binding(8) var uEmitterConeSampler: sampler;

const TAU: f32 = 6.28318530718;
/**
 * Hard ceiling on a ray's walk. Sphere tracing converges in far fewer in the
 * open; the ceiling is what a ray running along a wall spends, a texel or two
 * at a time, before it gives up on the far end of a coarse interval.
 */
const MAX_STEPS: i32 = 128;
/**
 * Distance, in texels, at or below which a sample is on a surface: what a
 * walk lands within when it steps by the field's own value.
 */
const HIT: f32 = 0.25;
/** Emission coverage below which a surface is a wall rather than a source. */
const WALL: f32 = 0.05;
/** Depth that says "no encounter pending". */
const NOTHING: f32 = -1e8;

/**
 * World position to a lookup in the fields, which cover the camera's view and
 * a margin around it, turned and scaled as the camera is. WebGPU writes a
 * render target top-down, so clip `+y` is the first row.
 */
fn fieldUv(world: vec2<f32>) -> vec2<f32> {
    let clip = vec2<f32>(dot(uniforms.uToField.xy, world), dot(uniforms.uToField.zw, world)) + uniforms.uFieldOffset;

    return vec2<f32>(clip.x, -clip.y) * 0.5 + 0.5;
}

/**
 * The share of a cone of half-width `width` that a surface takes when the
 * cone's axis reaches `depth` into it - negative when the axis misses it by
 * that much. A box cone: what is inside is what is covered, so the shares of
 * neighbouring rays add up to one wherever a surface's edge falls.
 */
fn share(depth: f32, width: f32) -> f32 {
    return clamp(0.5 + depth / (2.0 * max(width, 0.0001)), 0.0, 1.0);
}

fn emissionAt(world: vec2<f32>) -> vec4<f32> {
    return textureSampleLevel(uEmission, uEmissionSampler, fieldUv(world), 0.0);
}

fn distanceAt(world: vec2<f32>) -> vec2<f32> {
    let stored = textureSampleLevel(uDistance, uDistanceSampler, fieldUv(world), 0.0).rg * uniforms.uFar;

    return vec2<f32>(stored.x, stored.y - stored.x);
}

/**
 * A source's colour where a ray reads it, through the source's cone: light
 * leaves the source along the ray, against the direction the ray walked, and
 * a cone light gives none of it outside its own opening. A point light wrote
 * both cosines as -1, which no direction can fail; a wall wrote nothing.
 */
fn sourceColour(colourAt: vec2<f32>, direction: vec2<f32>) -> vec3<f32> {
    let uv = fieldUv(colourAt);
    let colour = textureSampleLevel(uEmission, uEmissionSampler, uv, 0.0).rgb;
    let cone = textureSampleLevel(uEmitterCone, uEmitterConeSampler, uv, 0.0);

    if (dot(cone.zw, cone.zw) < 0.5) {
        return colour;
    }

    let alignment = dot(-direction, normalize(cone.zw));

    var coneTerm = smoothstep(cone.x, cone.y, alignment);

    if (cone.x == cone.y) {
        coneTerm = step(cone.x, alignment);
    }

    return colour * coneTerm;
}

/**
 * What a walk amounts to with its open encounter settled: the radiance found
 * in `rgb`, what got through in `a`.
 */
fn settle(found: vec3<f32>, through: f32, depth: f32, width: f32, colourAt: vec2<f32>, direction: vec2<f32>) -> vec4<f32> {
    if (depth == NOTHING) {
        return vec4<f32>(found, through);
    }

    let taken = share(depth, width);

    return vec4<f32>(found + through * taken * sourceColour(colourAt, direction), through * (1.0 - taken));
}

/**
 * What a directional light puts into a ray that reached open sky: its whole
 * radiance concentrated into the rays within its own angular size, shared
 * between neighbouring rays by the same box cone as everything else, so the
 * average over a probe's directions is the light's intensity.
 */
fn sky(direction: vec2<f32>, sector: f32) -> vec3<f32> {
    if (uniforms.uSun.w <= 0.0) {
        return vec3<f32>(0.0);
    }

    // The rays that see the sun point AT it: against the direction it travels.
    let away = acos(clamp(dot(direction, -uniforms.uSun.xy), -1.0, 1.0));

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
fn trace(origin: vec2<f32>, direction: vec2<f32>, ends: vec4<f32>) -> array<vec4<f32>, 4> {
    let minStep = max(uniforms.uTexel, 0.0001);
    let end = max(max(ends.x, ends.y), max(ends.z, ends.w));

    var results: array<vec4<f32>, 4>;
    var travelled = uniforms.uRange.x;
    var through = 1.0;
    var found = vec3<f32>(0.0);
    // The encounter still open: how deep the axis has reached into (or how
    // close it came to) the surface at hand, where its colour is read, at what
    // travel, and how wide the cone was there.
    var depth = NOTHING;
    var colourAt = vec2<f32>(0.0);
    var atTravel = 0.0;
    var width = minStep;
    var inside = false;
    // A source the walk BEGINS inside of belongs to the level below, whose
    // interval it straddles: the ray that merges this one has walked it, and
    // scaling that ray's remainder by a second reading of the same source is
    // what put a bright ring at every interval boundary. The finest level has
    // no level below it, and keeps what it starts in.
    var skipping = false;
    // Just out of a source: the field still reads that source, and a near
    // miss of it would count it twice.
    var leaving = false;
    var previous = 1e8;
    var stepped = 0.0;
    var entered = 0.0;
    var reported = vec4<bool>(false);

    for (var taken: i32 = 0; taken < MAX_STEPS; taken = taken + 1) {
        // Each end is reported by the first sample at or past it: what the ray
        // amounts to there is what it had settled by then, plus a near miss
        // whose closest point lies before it - one further on is the coarser
        // ray's to find. An end reached inside a source waits for the exit:
        // the coarser ray starts inside that source and leaves it alone, so
        // this ray has to carry the whole of it, and how much that is cannot
        // be known before the far side.
        for (var index: i32 = 0; index < 4; index = index + 1) {
            if (!reported[index] && !inside && travelled >= ends[index]) {
                results[index] = settle(found, through, select(NOTHING, depth, atTravel <= ends[index]), width, colourAt, direction);
                reported[index] = true;
            }
        }

        if (travelled >= end) {
            break;
        }

        let here = origin + direction * travelled;
        let uv = fieldUv(here);

        // Outside the fields there is nothing known, and a ray that leaves them
        // cannot be told apart from one that found nothing - so it carries on
        // as unoccluded rather than ending in shadow.
        if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
            break;
        }

        let field = distanceAt(here);
        // The ray's own half-width here. NOT floored at a texel: the widths of a
        // probe's rays have to tile the circle for their shares to add up to
        // one, and near the start of an interval a ray is narrower than a texel.
        let cone = travelled * uniforms.uCone;

        if (field.x <= HIT * minStep) {
            if (!inside) {
                // A pending near miss of the surface being entered is this
                // same surface, approached; one left further back is not.
                if (depth != NOTHING && travelled - atTravel > 2.0 * max(width, minStep)) {
                    let settled = settle(found, through, depth, width, colourAt, direction);

                    found = settled.rgb;
                    through = settled.a;
                }

                // Read a step in, where a source's colour is and a wall's
                // bounce sits, rather than on the edge the walk stopped at.
                let within = here + direction * minStep;
                let emission = emissionAt(within);

                if (emission.a < WALL) {
                    found = found + through * emission.rgb;
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

            if (!skipping && field.y > depth) {
                depth = field.y;
                atTravel = travelled;
                width = cone;
            }

            previous = 1e8;
            travelled = travelled + max(field.y, minStep);

            continue;
        }

        if (inside) {
            // The deepest point of a chord is its middle, and the samples along
            // it were a texel apart: read the depth there once, exactly, rather
            // than settle for the nearest sample to it.
            if (!skipping) {
                let midway = 0.5 * (entered + travelled);
                let there = distanceAt(origin + direction * midway);

                if (there.y > depth) {
                    depth = there.y;
                    atTravel = midway;
                    width = midway * uniforms.uCone;
                }
            }

            let settled = settle(found, through, depth, width, colourAt, direction);

            found = settled.rgb;
            through = settled.a;
            inside = false;
            skipping = false;
            leaving = true;
            depth = NOTHING;
        }

        if (leaving) {
            leaving = field.x <= max(cone, minStep);
        } else if (previous < 1e7) {
            // The closest the segment from the previous sample to this one
            // came to the surface, from the two distances at its ends and the
            // segment's own length - the nearest point is between the samples,
            // not at either of them. A first sample has no segment: the surface
            // it reads may be beside the ray, or behind where it began, and
            // only the second sample can tell.
            let along = clamp((stepped * stepped + field.x * field.x - previous * previous) / (2.0 * stepped), 0.0, stepped);
            let nearest = sqrt(max(field.x * field.x - along * along, 0.0));

            if (-nearest > depth) {
                let foot = here - direction * along;

                // The estimate assumes a flat surface; the field read at the
                // foot of it is the truth for a curved one, and never further.
                depth = -min(nearest, distanceAt(foot).x);
                colourAt = foot;
                atTravel = travelled - along;
                width = max(travelled - along, 0.0) * uniforms.uCone;
            }
        }

        previous = field.x;
        // Sphere tracing: a step of the distance to the nearest surface cannot
        // pass through one, which is what makes a whole cascade affordable
        // where marching a texel at a time is not.
        stepped = max(field.x, minStep);
        travelled = travelled + stepped;
    }

    let settled = settle(found, through, depth, width, colourAt, direction);

    for (var index: i32 = 0; index < 4; index = index + 1) {
        if (!reported[index]) {
            results[index] = settled;
        }
    }

    return results;
}

/**
 * The cascade above, for one of its probes: the average of the four
 * directions there that subdivide this ray's own. Taking one would lose three
 * quarters of the angular detail the level above paid for.
 */
fn coarseRays(probe: vec2<i32>, direction: i32, coarseTile: i32) -> vec3<f32> {
    var sum = vec3<f32>(0.0);

    for (var sub: i32 = 0; sub < 4; sub = sub + 1) {
        let coarse = direction * 4 + sub;

        sum = sum + textureLoad(uTexture, probe * coarseTile + vec2<i32>(coarse % coarseTile, coarse / coarseTile), 0).rgb;
    }

    return sum * 0.25;
}

fn bilinear(weight: vec2<f32>, index: i32) -> f32 {
    let alongX = select(weight.x, 1.0 - weight.x, index % 2 == 0);
    let alongY = select(weight.y, 1.0 - weight.y, index / 2 == 0);

    return alongX * alongY;
}

@fragment
fn fragmentMain(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    let tile = i32(uniforms.uTile);
    let texel = vec2<i32>(position.xy);
    let probe = texel / tile;

    // The cascade's texture holds the same number of texels at every level, but
    // a level whose probe grid does not divide it leaves a margin that no probe
    // owns.
    if (probe.x >= i32(uniforms.uProbes.x) || probe.y >= i32(uniforms.uProbes.y)) {
        return vec4<f32>(0.0, 0.0, 0.0, 1.0);
    }

    let within = texel - probe * tile;
    let direction = within.y * tile + within.x;
    let sector = TAU / f32(tile * tile);
    let angle = (f32(direction) + 0.5) * sector;
    let heading = vec2<f32>(cos(angle), sin(angle));
    let origin = uniforms.uOrigin + (vec2<f32>(probe) + 0.5) * uniforms.uSpacing;

    if (uniforms.uMerge < 0.5) {
        let walked = trace(origin, heading, vec4<f32>(uniforms.uRange.y));

        // The top of the chain: what got through here reached the sky, and a
        // directional light is what the sky holds.
        return vec4<f32>(walked[0].rgb + walked[0].a * sky(heading, 0.5 * sector), 1.0);
    }

    // The four probes of the coarser grid around this one, bilinearly weighted:
    // the coarser probes sit at twice the spacing, so a probe here lands
    // halfway between two of them. Taking the nearest one would put the probe
    // grid itself into the picture as blocky steps.
    let coarseTile = tile * 2;
    let coarseSpacing = uniforms.uSpacing * 2.0;
    let coarseProbes = vec2<i32>((i32(uniforms.uProbes.x) + 1) / 2, (i32(uniforms.uProbes.y) + 1) / 2);
    let place = (vec2<f32>(probe) + 0.5) * 0.5 - 0.5;
    let weight = fract(place);
    let base = vec2<i32>(floor(place));
    // Weighted as well by how much of the way to each coarser probe is open: a
    // probe beside a wall would otherwise take half its light from probes on
    // the far side of it, and the wall's shadow would glow along its edge.
    let open = textureLoad(uVisibility, probe, 0);

    var corners: array<vec2<i32>, 4>;
    var ends = vec4<f32>(0.0);
    var shares = vec4<f32>(0.0);

    // Each coarser probe's ray in this direction begins a fixed distance from
    // THAT probe, which along this ray is short of or past where this level's
    // interval ends by the probe's own offset. Ending the walk there, per
    // probe, is what makes the two intervals meet: one end for all four would
    // leave a gap towards the probes ahead and count the band twice towards
    // the ones behind, and either shows as a ring of blotches at the boundary.
    for (var index: i32 = 0; index < 4; index = index + 1) {
        let corner = clamp(base + vec2<i32>(index % 2, index / 2), vec2<i32>(0, 0), coarseProbes - vec2<i32>(1, 1));
        let coarseOrigin = uniforms.uOrigin + (vec2<f32>(corner) + 0.5) * coarseSpacing;

        corners[index] = corner;
        ends[index] = uniforms.uRange.y + dot(coarseOrigin - origin, heading);
        shares[index] = bilinear(weight, index) * open[index];
    }

    var totalShare = shares.x + shares.y + shares.z + shares.w;

    // Every way blocked: fall back to the plain weights rather than to darkness.
    if (totalShare <= 0.0) {
        for (var index: i32 = 0; index < 4; index = index + 1) {
            shares[index] = bilinear(weight, index);
        }

        totalShare = 1.0;
    }

    let results = trace(origin, heading, ends);

    var total = vec3<f32>(0.0);

    for (var index: i32 = 0; index < 4; index = index + 1) {
        var walked = results[index];

        // Scaled by what got through: a ray that ended on a surface is already
        // carrying that surface's radiance, and one that grazed it carries
        // part of both.
        if (walked.a > 0.0) {
            walked = vec4<f32>(walked.rgb + walked.a * coarseRays(corners[index], direction, coarseTile), walked.a);
        }

        total = total + walked.rgb * (shares[index] / totalShare);
    }

    return vec4<f32>(total, 1.0);
}
