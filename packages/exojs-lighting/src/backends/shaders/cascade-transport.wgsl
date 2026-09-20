// One cascade level: every probe ray walked over this frame's geometry.
//
// The operator integrates the sources it crosses and stops at the first wall,
// so a source is a shape in the tables rather than a field of its own, and
// what a ray collects from it is the length it travels inside it.
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
 * What a surface a stretch ended on gives back, from the light that fell on it
 * last frame. See the GLSL half for what has to hold before last frame's light
 * may be read at all.
 */
fn bounced(surface: vec2<f32>, direction: vec2<f32>) -> vec3<f32> {
    if (uniforms.uBounce <= 0.0 || uniforms.uHistoryValid < 0.5) {
        return vec3<f32>(0.0);
    }

    let free = surface - direction * uniforms.uBounceStep;

    if (maskBlocks(vec2<i32>(floor(maskPlace(free))), uniforms.uMaskCells)) {
        return vec3<f32>(0.0);
    }

    // The colour is the surface's own, read where the surface is; the light is
    // what fell on the free side of it. See the GLSL half.
    let onIt = surface + direction * uniforms.uAlbedoStep;
    let clip = vec2<f32>(dot(uniforms.uToClip.xy, free), dot(uniforms.uToClip.zw, free)) + uniforms.uClipOffset;
    let colourClip = vec2<f32>(dot(uniforms.uToClip.xy, onIt), dot(uniforms.uToClip.zw, onIt)) + uniforms.uClipOffset;
    let was = vec2<f32>(dot(uniforms.uReproject.xy, clip), dot(uniforms.uReproject.zw, clip)) + uniforms.uReprojectOffset;
    let here = vec2<f32>(colourClip.x, -colourClip.y) * 0.5 + 0.5;
    let lit = vec2<f32>(clip.x, -clip.y) * 0.5 + 0.5;
    let before = vec2<f32>(was.x, -was.y) * 0.5 + 0.5;

    if (here.x < 0.0 || here.x > 1.0 || here.y < 0.0 || here.y > 1.0 || lit.x < 0.0 || lit.x > 1.0 || lit.y < 0.0 || lit.y > 1.0) {
        return vec3<f32>(0.0);
    }

    if (before.x < 0.0 || before.x > 1.0 || before.y < 0.0 || before.y > 1.0) {
        return vec3<f32>(0.0);
    }

    return textureSampleLevel(uFrame, uFrameSampler, here, 0.0).rgb
        * min(textureSampleLevel(uHistory, uHistorySampler, before, 0.0).rgb, vec3<f32>(1.0))
        * uniforms.uBounce;
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
        let gave = select(vec3<f32>(0.0), bounced(walked.surface, heading), walked.rastered > 0.5);

        // The top of the chain: what got through here reached the sky, and a
        // directional light is what the sky holds.
        return vec4<f32>(walked.radiance + gave + walked.transmittance * sky(heading, 0.5 * sector), 1.0);
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
        // A stretch that ended on a drawable carries what that drawable gives
        // back; one that ended on an outline carries only what it collected.
        let along = normalize(coarseOrigin + heading * uniforms.uRange.y - near);
        let gave = select(vec3<f32>(0.0), bounced(walked.surface, along), walked.rastered > 0.5);

        total = total + bilinear(weight, index) * (walked.radiance + gave + walked.transmittance * coarseRays(corner, direction, coarseTile));
    }

    return vec4<f32>(total, 1.0);
}
