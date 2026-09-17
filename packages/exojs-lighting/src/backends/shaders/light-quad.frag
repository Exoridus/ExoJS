#version 300 es
precision highp float;

in vec2 v_local;
in vec4 v_tint;
flat in vec2 v_cone;
flat in float v_intensity;
flat in float v_shadowRow;
flat in float v_softness;

// One row per shadowed light: the distance to the nearest occluder along each
// angular bin, as a fraction of the light's radius. A row index below zero
// means this light sees no occluder at all.
uniform sampler2D u_shadow;

out vec4 fragColor;

const float PI = 3.14159265359;
const int SHADOW_TAPS = 5;
/** Fraction of a full turn the widest penumbra spans. */
const float MAX_PENUMBRA = 0.03;
/** Tolerance, in radii, that keeps an occluder's own surface out of its shadow. */
const float SHADOW_BIAS = 0.004;

float shadowTerm(float distance) {
    if (v_shadowRow < 0.0) {
        return 1.0;
    }

    float bins = float(textureSize(u_shadow, 0).x);
    // A kernel narrower than one bin would alias along the bin grid, so one
    // bin is the floor: softness widens the penumbra from there.
    float spread = max(1.0, v_softness * bins * MAX_PENUMBRA);
    float center = (atan(v_local.y, v_local.x) + PI) / (2.0 * PI) * bins - 0.5;
    int row = int(v_shadowRow);
    float lit = 0.0;

    for (int tap = 0; tap < SHADOW_TAPS; tap++) {
        float offset = (float(tap) / float(SHADOW_TAPS - 1) - 0.5) * 2.0 * spread;
        int bin = int(mod(floor(center + offset + 0.5), bins));

        lit += step(distance, texelFetch(u_shadow, ivec2(bin, row), 0).r + SHADOW_BIAS);
    }

    return lit / float(SHADOW_TAPS);
}

void main() {
    // The quad is the light's bounding square in radius-normalized space, so
    // distance is `length(v_local)` and everything past 1 is outside the light.
    float distance = length(v_local);
    float falloff = clamp(1.0 - distance, 0.0, 1.0);

    // A point light writes both cone cosines as -1, which no direction can
    // fail, so one expression serves both shapes without a branch.
    vec2 direction = distance > 0.0 ? v_local / distance : vec2(1.0, 0.0);
    float alignment = direction.x;
    float coneTerm = v_cone.x == v_cone.y ? step(v_cone.x, alignment) : smoothstep(v_cone.x, v_cone.y, alignment);

    fragColor = vec4(v_tint.rgb * (falloff * falloff * coneTerm * v_intensity * shadowTerm(distance)), 1.0);
}
