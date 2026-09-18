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

/** Widest kernel as a half-width in strips, and the fetch budget. See `light-quad.frag`. */
const int MAX_HALF = 10;
/** Fraction of the strip range the widest penumbra spans. */
const float MAX_PENUMBRA = 0.03;
/** Tolerance, in the row's own units, that keeps an occluder out of its own shadow. */
const float SHADOW_BIAS = 0.004;
/** Kernel half-width, in strips, at zero softness. See `light-quad.frag`. */
const float MIN_RADIUS = 1.5;

/**
 * Whether the light reaches `depth` in strip `strip`.
 *
 * One comparison per strip, and the kernel below filters these ANSWERS - see
 * the same note in `light-quad.frag`. Clamped rather than wrapped: strips are
 * a line, and the far side of the range is not the near side of it.
 */
float visibleAt(int strip, int bins, int row, float depth) {
    return step(depth, texelFetch(u_shadow, ivec2(clamp(strip, 0, bins - 1), row), 0).r + SHADOW_BIAS);
}

float shadowTerm() {
    if (v_shadowRow < 0.0) {
        return 1.0;
    }

    int bins = textureSize(u_shadow, 0).x;
    int row = int(v_shadowRow);
    float radius = min(MIN_RADIUS + max(0.0, v_softness) * float(bins) * MAX_PENUMBRA, float(MAX_HALF));
    float center = v_sun.x * float(bins) - 0.5;
    int base = int(floor(center));
    int reach = int(ceil(radius));
    float lit = 0.0;
    float total = 0.0;

    // Taps on the strips rather than at fixed offsets from the fragment. See
    // the same filter in `light-quad.frag` for why that is what makes it
    // continuous.
    for (int offset = -MAX_HALF; offset <= MAX_HALF; offset++) {
        if (offset < -reach || offset > reach) {
            continue;
        }

        int strip = base + offset;
        float weight = max(0.0, 1.0 - abs(float(strip) - center) / radius);

        if (weight <= 0.0) {
            continue;
        }

        lit += weight * visibleAt(strip, bins, row, v_sun.y);
        total += weight;
    }

    return total > 0.0 ? lit / total : 1.0;
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
