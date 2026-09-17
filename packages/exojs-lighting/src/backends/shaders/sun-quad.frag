#version 300 es
precision highp float;

in vec2 v_sun;
in vec4 v_tint;
flat in vec3 v_toLight;
flat in float v_shadowRow;
flat in float v_softness;
flat in float v_intensity;

// One row per shadowed light. A directional light's row is linear rather than
// polar: bin `i` is a strip across the light's direction, holding how far along
// the light the nearest occluder in that strip sits.
uniform sampler2D u_shadow;
uniform sampler2D u_normal;

out vec4 fragColor;

const int SHADOW_TAPS = 5;
/** Fraction of the strip range the widest penumbra spans. */
const float MAX_PENUMBRA = 0.03;
/** Tolerance, in the row's own units, that keeps an occluder out of its own shadow. */
const float SHADOW_BIAS = 0.004;

float shadowTerm() {
    if (v_shadowRow < 0.0) {
        return 1.0;
    }

    float bins = float(textureSize(u_shadow, 0).x);
    // A kernel narrower than one strip would alias along the strip grid, so one
    // strip is the floor: softness widens the penumbra from there.
    float spread = max(1.0, v_softness * bins * MAX_PENUMBRA);
    float center = v_sun.x * bins - 0.5;
    int row = int(v_shadowRow);
    float lit = 0.0;

    for (int tap = 0; tap < SHADOW_TAPS; tap++) {
        float offset = (float(tap) / float(SHADOW_TAPS - 1) - 0.5) * 2.0 * spread;
        // Clamped rather than wrapped: strips are a line, and the far side of
        // the range is not the near side of it.
        int bin = int(clamp(floor(center + offset + 0.5), 0.0, bins - 1.0));

        lit += step(v_sun.y, texelFetch(u_shadow, ivec2(bin, row), 0).r + SHADOW_BIAS);
    }

    return lit / float(SHADOW_TAPS);
}

/** See the same term in `light-quad.frag`: `1` wherever nothing described a surface. */
float surfaceTerm() {
    vec2 uv = gl_FragCoord.xy / vec2(textureSize(u_normal, 0));
    vec4 encoded = texture(u_normal, uv);

    if (encoded.a <= 0.0) {
        return 1.0;
    }

    vec3 normal = normalize((encoded.rgb / encoded.a) * 2.0 - 1.0);

    return max(dot(normal, v_toLight), 0.0);
}

void main() {
    // No falloff and no cone: a source at no particular distance reaches
    // everything its quad covers, equally.
    fragColor = vec4(v_tint.rgb * (v_intensity * shadowTerm() * surfaceTerm()), 1.0);
}
