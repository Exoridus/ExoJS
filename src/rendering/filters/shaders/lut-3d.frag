#version 300 es
precision mediump float;
uniform sampler2D uTexture;
uniform sampler2D uLut;
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
    fragColor = vec4(sampleLut3d(src.rgb), src.a);
}
