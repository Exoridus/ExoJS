// One cascade level, with the transport operator in place of the sphere trace.
//
// The probe grid, the intervals and the merge are the ones the field walk
// uses; what changes is how a ray finds what is in its way. The operator
// integrates the sources it crosses and stops at the first wall, so the cone
// share, the emission field and the cone field have no part here: a source is
// a shape in the tables, and what a ray collects from it is the length it
// travels inside it.
//
// The bindings and the transport chunk itself are prepended by the module that
// builds this shader: the chunk has to be declared after the textures it reads
// and before this text uses it.

const TAU: f32 = 6.28318530718;

/**
 * The share of a sector that a directional light takes, so the average over a
 * probe's directions is the light's own intensity however it falls between
 * them.
 */
fn sunShare(depth: f32, width: f32) -> f32 {
    return clamp(0.5 + depth / (2.0 * max(width, 0.0001)), 0.0, 1.0);
}

/**
 * What a directional light puts into a ray that reached open sky: its whole
 * radiance concentrated into the rays within its own angular size.
 */
fn sky(direction: vec2<f32>, sector: f32) -> vec3<f32> {
    if (uniforms.uSun.w <= 0.0) {
        return vec3<f32>(0.0);
    }

    // The rays that see the sun point AT it: against the direction it travels.
    let away = acos(clamp(dot(direction, -uniforms.uSun.xy), -1.0, 1.0));

    return uniforms.uSunColor * (uniforms.uSun.w * sunShare(uniforms.uSun.z - away, sector));
}

/**
 * The cascade above, for one of its probes: the average of the four
 * directions there that subdivide this ray's own. Taking one would lose three
 * quarters of the angular detail the level above paid for.
 */
fn coarseRays(probe: vec2<i32>, direction: i32, coarseTile: i32) -> vec3<f32> {
    var sum = vec3<f32>(0.0);

    for (var sub = 0; sub < 4; sub = sub + 1) {
        let coarse = direction * 4 + sub;

        sum = sum + textureLoad(uTexture, probe * coarseTile + vec2<i32>(coarse % coarseTile, coarse / coarseTile), 0).rgb;
    }

    return sum * 0.25;
}

fn bilinear(weight: vec2<f32>, index: i32) -> f32 {
    return select(weight.x, 1.0 - weight.x, index % 2 == 0) * select(weight.y, 1.0 - weight.y, index / 2 == 0);
}

@fragment
fn fragmentMain(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    let tile = i32(uniforms.uTile);
    let texel = vec2<i32>(floor(position.xy));
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
    let near = origin + heading * uniforms.uRange.x;

    if (uniforms.uMerge < 0.5) {
        let walked = traceSegment(near, origin + heading * uniforms.uRange.y);

        // The top of the chain: what got through here reached the sky, and a
        // directional light is what the sky holds.
        return vec4<f32>(walked.radiance + walked.transmittance * sky(heading, 0.5 * sector), 1.0);
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
    var total = vec3<f32>(0.0);

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
    for (var index = 0; index < 4; index = index + 1) {
        let corner = clamp(base + vec2<i32>(index % 2, index / 2), vec2<i32>(0), coarseProbes - vec2<i32>(1));
        let coarseOrigin = uniforms.uOrigin + (vec2<f32>(corner) + 0.5) * coarseSpacing;
        let walked = traceSegment(near, coarseOrigin + heading * uniforms.uRange.y);

        total = total + bilinear(weight, index) * (walked.radiance + walked.transmittance * coarseRays(corner, direction, coarseTile));
    }

    return vec4<f32>(total, 1.0);
}
