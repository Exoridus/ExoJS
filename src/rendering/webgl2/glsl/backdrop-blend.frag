#version 300 es
precision highp float;

// Backdrop-aware blend compositor (advanced blend modes).
//
// Samples the premultiplied source (the drawable rendered to a texture) and the
// captured premultiplied backdrop (the target contents behind it), computes the
// W3C blend B(Cb, Cs) for the requested mode, and outputs the blended source
// premultiplied by its own alpha. The caller draws this with normal
// (premultiplied source-over) blending, so the GPU composites it over the
// untouched backdrop already in the target — transparent source regions
// (alpha 0) leave the backdrop showing through instead of going black.
//
// Mode values match the BlendModes enum (src/rendering/types.ts).

uniform sampler2D u_source;
uniform sampler2D u_backdrop;
uniform int u_mode;
// 1.0 when the target is opaque (the on-screen root canvas), whose captured
// alpha is unreliable — an opaque framebuffer reports backdrop alpha 0, which
// would make the blend ignore the backdrop. Forces backdrop coverage to full.
uniform float u_opaqueBackdrop;

in vec2 v_texcoord;

layout(location = 0) out vec4 fragColor;

const int MODE_MULTIPLY = 3;
const int MODE_SCREEN = 4;
const int MODE_DARKEN = 5;
const int MODE_LIGHTEN = 6;
const int MODE_OVERLAY = 7;
const int MODE_COLOR_DODGE = 8;
const int MODE_COLOR_BURN = 9;
const int MODE_HARD_LIGHT = 10;
const int MODE_SOFT_LIGHT = 11;
const int MODE_DIFFERENCE = 12;
const int MODE_EXCLUSION = 13;
const int MODE_HUE = 14;
const int MODE_SATURATION = 15;
const int MODE_COLOR = 16;

vec3 unpremultiply(vec4 color) {
    return color.a > 0.0 ? color.rgb / color.a : vec3(0.0);
}

// W3C separable blend B(Cb, Cs) for one channel (straight color in [0, 1]).
float blendChannel(int mode, float cb, float cs) {
    if (mode == MODE_MULTIPLY) {
        return cb * cs;
    }
    if (mode == MODE_SCREEN) {
        return cb + cs - cb * cs;
    }
    if (mode == MODE_DARKEN) {
        return min(cb, cs);
    }
    if (mode == MODE_LIGHTEN) {
        return max(cb, cs);
    }
    if (mode == MODE_OVERLAY) {
        return cb <= 0.5 ? (2.0 * cb * cs) : (1.0 - 2.0 * (1.0 - cb) * (1.0 - cs));
    }
    if (mode == MODE_HARD_LIGHT) {
        return cs <= 0.5 ? (2.0 * cb * cs) : (1.0 - 2.0 * (1.0 - cb) * (1.0 - cs));
    }
    if (mode == MODE_COLOR_DODGE) {
        if (cb <= 0.0) {
            return 0.0;
        }
        return cs >= 1.0 ? 1.0 : min(1.0, cb / (1.0 - cs));
    }
    if (mode == MODE_COLOR_BURN) {
        if (cb >= 1.0) {
            return 1.0;
        }
        return cs <= 0.0 ? 0.0 : 1.0 - min(1.0, (1.0 - cb) / cs);
    }
    if (mode == MODE_SOFT_LIGHT) {
        if (cs <= 0.5) {
            return cb - (1.0 - 2.0 * cs) * cb * (1.0 - cb);
        }
        float d = cb <= 0.25 ? (((16.0 * cb - 12.0) * cb + 4.0) * cb) : sqrt(cb);
        return cb + (2.0 * cs - 1.0) * (d - cb);
    }
    if (mode == MODE_DIFFERENCE) {
        return abs(cb - cs);
    }
    if (mode == MODE_EXCLUSION) {
        return cb + cs - 2.0 * cb * cs;
    }
    return min(cb, cs); // default: Darken
}

vec3 blendSeparable(int mode, vec3 cb, vec3 cs) {
    return vec3(blendChannel(mode, cb.r, cs.r), blendChannel(mode, cb.g, cs.g), blendChannel(mode, cb.b, cs.b));
}

// Non-separable helpers (W3C): operate on the whole color.
float lum(vec3 c) {
    return dot(c, vec3(0.3, 0.59, 0.11));
}

vec3 clipColor(vec3 c) {
    float l = lum(c);
    float n = min(min(c.r, c.g), c.b);
    float x = max(max(c.r, c.g), c.b);

    if (n < 0.0) {
        c = l + ((c - l) * l) / (l - n);
    }
    if (x > 1.0) {
        c = l + ((c - l) * (1.0 - l)) / (x - l);
    }

    return c;
}

vec3 setLum(vec3 c, float l) {
    return clipColor(c + (l - lum(c)));
}

float sat(vec3 c) {
    return max(max(c.r, c.g), c.b) - min(min(c.r, c.g), c.b);
}

// Map the channels so min → 0, max → s, mid → proportional (W3C SetSat result).
vec3 setSat(vec3 c, float s) {
    float mn = min(min(c.r, c.g), c.b);
    float mx = max(max(c.r, c.g), c.b);

    return mx > mn ? (c - mn) * (s / (mx - mn)) : vec3(0.0);
}

vec3 blendNonSeparable(int mode, vec3 cb, vec3 cs) {
    if (mode == MODE_HUE) {
        return setLum(setSat(cs, sat(cb)), lum(cb));
    }
    if (mode == MODE_SATURATION) {
        return setLum(setSat(cb, sat(cs)), lum(cb));
    }
    if (mode == MODE_COLOR) {
        return setLum(cs, lum(cb));
    }
    return setLum(cb, lum(cs)); // default: Luminosity
}

vec3 blendAdvanced(int mode, vec3 cb, vec3 cs) {
    return mode >= MODE_HUE ? blendNonSeparable(mode, cb, cs) : blendSeparable(mode, cb, cs);
}

void main(void) {
    vec4 src = texture(u_source, v_texcoord);
    // The backdrop is captured from the framebuffer (bottom-left origin), so its
    // V axis is flipped relative to the source/quad UVs.
    vec4 dst = texture(u_backdrop, vec2(v_texcoord.x, 1.0 - v_texcoord.y));

    float alphaSource = src.a;
    float alphaBackdrop = max(dst.a, u_opaqueBackdrop);
    vec3 colorSource = unpremultiply(src);
    vec3 colorBackdrop = unpremultiply(dst);

    vec3 blended = blendAdvanced(u_mode, colorBackdrop, colorSource);
    // Cs' = (1 - αb)·Cs + αb·B(Cb, Cs)
    vec3 mixedSource = mix(colorSource, blended, alphaBackdrop);

    // Premultiplied blended source; GPU source-over composites it over backdrop.
    fragColor = vec4(mixedSource * alphaSource, alphaSource);
}
