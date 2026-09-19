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

/** Narrowest blocker slope a strip is allowed to resolve. See `light-quad.frag`. */
const float MIN_SLOPE = 1e-4;

/**
 * The blocker depth strip `strip` holds. Clamped rather than wrapped: strips
 * are a line, and the far side of the range is not the near side of it.
 */
float depthAt(int strip, int bins, int row) {
    return texelFetch(u_shadow, ivec2(clamp(strip, 0, bins - 1), row), 0).r;
}

/**
 * How much of one strip's own width the light reaches past `depth`. See
 * `light-quad.frag` for why a strip is read as a coverage rather than as a
 * yes or no, and why the slope is the smaller of the two one-sided differences.
 */
float coverageAt(float here, float previous, float next, float depth) {
    float slope = min(abs(here - previous), abs(next - here));

    return clamp(0.5 + (here + SHADOW_BIAS - depth) / max(slope, MIN_SLOPE), 0.0, 1.0);
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
    float previous = depthAt(base - reach - 1, bins, row);
    float here = depthAt(base - reach, bins, row);

    for (int offset = -MAX_HALF; offset <= MAX_HALF; offset++) {
        if (offset < -reach || offset > reach) {
            continue;
        }

        int strip = base + offset;
        float next = depthAt(strip + 1, bins, row);
        float weight = max(0.0, 1.0 - abs(float(strip) - center) / radius);

        if (weight > 0.0) {
            lit += weight * coverageAt(here, previous, next, v_sun.y);
            total += weight;
        }

        previous = here;
        here = next;
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
