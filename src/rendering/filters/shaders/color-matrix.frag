#version 300 es
precision mediump float;
uniform sampler2D uTexture;
in vec2 vUv;
out vec4 fragColor;
void main() {
    vec4 premultiplied = texture(uTexture, vUv);
    float alpha = premultiplied.a;
    vec4 straight = vec4(alpha > 0.0 ? premultiplied.rgb / alpha : vec3(0.0), alpha);

    // The straight sample is already linear light. uDomain selects which domain
    // the matrix coefficients see - convert into it, apply, clamp, then convert
    // back so the result stays linear PMA regardless of the caller's chosen
    // domain.
    bool domainSrgb = uniforms.uDomain > 0.5;
    vec3 domainRgb = domainSrgb ? linearToSrgb(straight.rgb) : straight.rgb;
    vec4 domainInput = vec4(domainRgb, straight.a);
    vec4 transformed =
        vec4(dot(uniforms.uRows[0], domainInput), dot(uniforms.uRows[1], domainInput), dot(uniforms.uRows[2], domainInput), dot(uniforms.uRows[3], domainInput)) +
        uniforms.uBias;
    vec4 graded = clamp(transformed, 0.0, 1.0);
    vec3 outRgb = domainSrgb ? srgbToLinear(graded.rgb) : graded.rgb;

    fragColor = vec4(outRgb * graded.a, graded.a);
}
