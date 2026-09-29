#version 300 es
precision highp float;
precision highp sampler2D;
uniform sampler2D uTexture;
uniform sampler2D uLut;
in vec2 vUv;
out vec4 fragColor;
void main() {
    vec4 src = texture(uTexture, vUv);
    // The lookup coordinate is the straight colour, not the premultiplied
    // sample - looking a translucent pixel's darkened premultiplied RGB up
    // directly would grade it as if it were a darker straight colour.
    vec3 straight = clamp(src.a > 0.0 ? src.rgb / src.a : vec3(0.0), 0.0, 1.0);
    float n = float(textureSize(uLut, 0).x);

    // The straight sample is already linear light. uniforms.uDomain selects which domain
    // the LUT was authored in - convert into it before indexing, then convert
    // the graded result back so the output stays linear.
    bool domainSrgb = uniforms.uDomain > 0.5;
    vec3 domainRgb = domainSrgb ? linearToSrgb(straight) : straight;
    vec3 gradedCoord = domainRgb * ((n - 1.0) / n) + 0.5 / n;
    vec3 gradedResult =
        vec3(texture(uLut, vec2(gradedCoord.r, 0.5)).r, texture(uLut, vec2(gradedCoord.g, 0.5)).g, texture(uLut, vec2(gradedCoord.b, 0.5)).b);
    vec3 graded = domainSrgb ? srgbToLinear(gradedResult) : gradedResult;

    fragColor = vec4(graded * src.a, src.a);
}
