#version 300 es
precision highp float;

uniform sampler2D uSource;
uniform float uExposureScale;
uniform float uToneMapping;
uniform float uTransparentCanvas;
uniform vec3 uMatteColor;

in vec2 vUv;
out vec4 fragColor;

// Values beyond this magnitude saturate at the SDR/tone-map ceiling instead of
// reaching an actual floating-point infinity, which would turn the reinhard
// division into NaN.
const float outputHuge = 3.0e38;

void main() {
    vec4 src = texture(uSource, vUv);
    bool transparent = uTransparentCanvas > 0.5;

    // Transparent target: unassociate before the transform, re-associate the
    // encoded result afterwards. Opaque target: composite the linear PMA
    // color over the clear-color matte first, so a partially covered pixel is
    // never brightened by an unassociate it should not receive.
    vec3 unassociated = src.a > 0.0 ? src.rgb / src.a : vec3(0.0);
    vec3 composited = src.rgb + (1.0 - src.a) * uMatteColor;
    vec3 straight = transparent ? unassociated : composited;

    vec3 raw = straight * uExposureScale;
    vec3 sanitized = mix(raw, vec3(0.0), notEqual(raw, raw));
    vec3 exposed = min(max(sanitized, vec3(0.0)), vec3(outputHuge));

    vec3 reinhard = exposed / (vec3(1.0) + exposed);
    vec3 clampedSdr = min(exposed, vec3(1.0));
    vec3 mapped = uToneMapping > 0.5 ? reinhard : clampedSdr;

    vec3 encoded = linearToSrgb(mapped);
    float outAlpha = transparent ? src.a : 1.0;
    vec3 finalRgb = transparent ? encoded * src.a : encoded;

    fragColor = vec4(finalRgb, outAlpha);
}
