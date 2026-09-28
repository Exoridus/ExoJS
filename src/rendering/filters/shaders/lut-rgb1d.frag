#version 300 es
precision mediump float;
uniform sampler2D uTexture;
uniform sampler2D uLut;
uniform float uDomain;
in vec2 vUv;
out vec4 fragColor;
void main() {
    vec4 src = texture(uTexture, vUv);
    // The lookup coordinate is the straight colour, not the premultiplied
    // sample - looking a translucent pixel's darkened premultiplied RGB up
    // directly would grade it as if it were a darker straight colour.
    vec3 straight = clamp(src.a > 0.0 ? src.rgb / src.a : vec3(0.0), 0.0, 1.0);
    float n = float(textureSize(uLut, 0).x);

    // Legacy (colorPipelineEnabled == false): the LUT indexes the straight
    // sample directly, no domain conversion - byte-identical to before the
    // colorSpace option existed.
    vec3 legacyCoord = straight * ((n - 1.0) / n) + 0.5 / n;
    vec3 legacy =
        vec3(texture(uLut, vec2(legacyCoord.r, 0.5)).r, texture(uLut, vec2(legacyCoord.g, 0.5)).g, texture(uLut, vec2(legacyCoord.b, 0.5)).b);

    // Gated: the straight sample is already linear light under the active
    // pipeline. uDomain selects which domain the LUT was authored in - convert
    // into it before indexing, then convert the graded result back so the
    // output stays linear.
    bool domainSrgb = uDomain > 0.5;
    vec3 domainRgb = domainSrgb ? linearToSrgb(straight) : straight;
    vec3 gatedCoord = domainRgb * ((n - 1.0) / n) + 0.5 / n;
    vec3 gatedResult =
        vec3(texture(uLut, vec2(gatedCoord.r, 0.5)).r, texture(uLut, vec2(gatedCoord.g, 0.5)).g, texture(uLut, vec2(gatedCoord.b, 0.5)).b);
    vec3 gated = domainSrgb ? srgbToLinear(gatedResult) : gatedResult;

    vec3 graded = colorPipelineEnabled ? gated : legacy;
    fragColor = vec4(graded * src.a, src.a);
}
