#version 300 es
precision mediump float;
uniform sampler2D uTexture;
uniform sampler2D uLut;
uniform float uDomain;
uniform float uLutSize;
in vec2 vUv;
out vec4 fragColor;

vec3 sampleLut3d(vec3 c) {
    float n = uLutSize;
    float scaled = clamp(c.b, 0.0, 1.0) * (n - 1.0);
    float bLow = floor(scaled);
    float bHigh = min(bLow + 1.0, n - 1.0);
    float bFrac = scaled - bLow;
    float invN2 = 1.0 / (n * n);
    float invN = 1.0 / n;
    float halfPx = 0.5 / (n * n);
    float halfRow = 0.5 / n;
    float rOff = clamp(c.r, 0.0, 1.0) * (n - 1.0) * invN2;
    float gOff = clamp(c.g, 0.0, 1.0) * (n - 1.0) * invN + halfRow;
    float uLow = bLow * invN + rOff + halfPx;
    float uHigh = bHigh * invN + rOff + halfPx;
    vec3 lo = texture(uLut, vec2(uLow, gOff)).rgb;
    vec3 hi = texture(uLut, vec2(uHigh, gOff)).rgb;
    return mix(lo, hi, bFrac);
}

void main() {
    vec4 src = texture(uTexture, vUv);
    // The lookup coordinate is the straight colour, not the premultiplied
    // sample - see lut-rgb1d.frag for why.
    vec3 straight = src.a > 0.0 ? src.rgb / src.a : vec3(0.0);

    // Legacy (colorPipelineEnabled == false): the LUT indexes the straight
    // sample directly, no domain conversion - byte-identical to before the
    // colorSpace option existed.
    vec3 legacy = sampleLut3d(straight);

    // Gated: the straight sample is already linear light under the active
    // pipeline. uDomain selects which domain the LUT was authored in - convert
    // into it before indexing, then convert the graded result back so the
    // output stays linear.
    bool domainSrgb = uDomain > 0.5;
    vec3 domainRgb = domainSrgb ? linearToSrgb(straight) : straight;
    vec3 gatedResult = sampleLut3d(domainRgb);
    vec3 gated = domainSrgb ? srgbToLinear(gatedResult) : gatedResult;

    vec3 graded = colorPipelineEnabled ? gated : legacy;
    fragColor = vec4(graded * src.a, src.a);
}
