#version 300 es
precision highp float;
precision highp int;

// The cascade above this one, already merged. A 1x1 placeholder stands in for
// the top of the chain, where `uMerge` is zero and nothing reads it.
uniform sampler2D uTexture;
// The distance to the nearest thing a ray can hit, as a fraction of `uFar`.
uniform sampler2D uDistance;
// What emits, at the same place in the world as the distance field.
uniform sampler2D uEmission;

out vec4 fragColor;

const float TAU = 6.28318530718;
/** Hard ceiling on a ray's walk. Sphere tracing converges in far fewer. */
const int MAX_STEPS = 64;

/**
 * World position to a lookup in the screen-sized fields.
 *
 * Flipped on v because WebGL2 writes a render target bottom-up and both fields
 * are render targets. The WGSL half needs no flip.
 */
vec2 fieldUv(vec2 world) {
    vec2 uv = (world - uniforms.uView.xy) / uniforms.uView.zw;

    return vec2(uv.x, 1.0 - uv.y);
}

/**
 * Walk one ray over this cascade's own interval.
 *
 * Returns the radiance it found in `rgb` and, in `a`, how much of the ray got
 * through - which is what the cascade above is then scaled by.
 *
 * A ray is a CONE, not a line: it owns one angular sector of its probe, so at
 * distance `t` it covers `t * tan(pi / directions)` across. Weighting a hit by
 * how much of that footprint the surface fills is what makes the result
 * continuous in the scene's geometry. With a binary hit, a source a few texels
 * across is found by a whole number of rays, that number changes as the source
 * moves, and the field flickers - measured at 15 to 25 percent for a quarter of
 * a probe spacing.
 */
vec4 trace(vec2 origin, vec2 direction) {
    float minStep = max(uniforms.uTexel, 0.0001);
    float travelled = uniforms.uRange.x;

    for (int taken = 0; taken < MAX_STEPS; taken++) {
        if (travelled >= uniforms.uRange.y) {
            break;
        }

        vec2 uv = fieldUv(origin + direction * travelled);

        // Outside the camera there is no field, and a ray that leaves it cannot
        // be told apart from one that found nothing - so it carries on as
        // unoccluded rather than ending in shadow.
        if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
            break;
        }

        float distance = texture(uDistance, uv).r * uniforms.uFar;
        // The ray's own width here, never below a texel: the field cannot
        // resolve anything finer, and a zero-width cone is the binary hit again.
        float footprint = max(minStep, travelled * uniforms.uCone);

        // Sphere tracing: a step of the distance to the nearest surface cannot
        // pass through one, which is what makes a whole cascade affordable
        // where marching a texel at a time is not.
        if (distance <= footprint) {
            // Sampled past the surface rather than at the point the walk
            // stopped at: the stop is short of what it hit, and an emitter's
            // radiance is inside it, not in the gap.
            vec3 emission = texture(uEmission, fieldUv(origin + direction * (travelled + distance + minStep))).rgb;
            float coverage = clamp(1.0 - distance / footprint, 0.0, 1.0);

            return vec4(emission * coverage, 1.0 - coverage);
        }

        travelled += max(distance, minStep);
    }

    return vec4(0.0, 0.0, 0.0, 1.0);
}

/** One direction of one probe in the cascade above, as a texel of it. */
vec3 coarseRay(ivec2 probe, int direction, int tile) {
    ivec2 within = ivec2(direction % tile, direction / tile);

    return texelFetch(uTexture, probe * tile + within, 0).rgb;
}

/**
 * What the cascade above carries for this ray: its four finer-grained
 * directions, averaged, bilinearly interpolated between the four probes of its
 * own coarser grid.
 *
 * Both halves matter. Taking one direction would lose three quarters of the
 * angular detail the level above paid for, and taking the nearest probe would
 * put the probe grid itself into the picture as blocky steps.
 */
vec3 merged(ivec2 probe, int direction, int tile) {
    int coarseTile = tile * 2;
    ivec2 coarseProbes = ivec2((int(uniforms.uProbes.x) + 1) / 2, (int(uniforms.uProbes.y) + 1) / 2);
    // This probe's place in the coarser grid: the coarser probes sit at twice
    // the spacing, so a probe here lands halfway between two of them.
    vec2 place = (vec2(probe) + 0.5) * 0.5 - 0.5;
    vec2 weight = fract(place);
    ivec2 base = ivec2(floor(place));
    vec3 total = vec3(0.0);

    for (int y = 0; y <= 1; y++) {
        for (int x = 0; x <= 1; x++) {
            ivec2 at = clamp(base + ivec2(x, y), ivec2(0), coarseProbes - 1);
            float share = (x == 0 ? 1.0 - weight.x : weight.x) * (y == 0 ? 1.0 - weight.y : weight.y);
            vec3 sum = vec3(0.0);

            for (int sub = 0; sub < 4; sub++) {
                sum += coarseRay(at, direction * 4 + sub, coarseTile);
            }

            total += sum * (0.25 * share);
        }
    }

    return total;
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
    float angle = (float(direction) + 0.5) / float(tile * tile) * TAU;
    vec2 origin = uniforms.uOrigin + (vec2(probe) + 0.5) * uniforms.uSpacing;
    vec4 walked = trace(origin, vec2(cos(angle), sin(angle)));

    // Scaled by what got through: a ray that ended on a surface is already
    // carrying that surface's radiance, and one that grazed it carries part of
    // both.
    if (uniforms.uMerge > 0.5 && walked.a > 0.0) {
        walked.rgb += walked.a * merged(probe, direction, tile);
    }

    fragColor = vec4(walked.rgb, 1.0);
}
