#version 300 es
precision highp float;
precision highp sampler2D;
uniform sampler2D uTexture;
uniform sampler2D uLut;
in vec2 vUv;
out vec4 fragColor;

vec3 sampleLut3d(vec3 c) {
    float n = uniforms.uLutSize;
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

    // The straight sample is already linear light. uniforms.uDomain selects which domain
    // the LUT was authored in - convert into it before indexing, then convert
    // the graded result back so the output stays linear.
    bool domainSrgb = uniforms.uDomain > 0.5;
    vec3 domainRgb = domainSrgb ? linearToSrgb(straight) : straight;
    vec3 result = sampleLut3d(domainRgb);
    vec3 graded = domainSrgb ? srgbToLinear(result) : result;

    fragColor = vec4(graded * src.a, src.a);
}
