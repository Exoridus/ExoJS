#version 300 es
precision highp float;
precision highp int;

// The finished seed field: `xy` is the nearest seed's texel coordinate.
uniform sampler2D uTexture;

out vec4 fragColor;

void main() {
    vec4 seed = texelFetch(uTexture, ivec2(gl_FragCoord.xy), 0);
    float distance = seed.z < 0.5 ? uniforms.uFar : length(gl_FragCoord.xy - seed.xy) * uniforms.uScale;

    // Stored as a fraction of the reach rather than in world units: it keeps the
    // whole field inside half-float's precise range whatever the camera covers,
    // and it is what makes the debug view a legible ramp instead of white.
    fragColor = vec4(vec3(clamp(distance / uniforms.uFar, 0.0, 1.0)), 1.0);
}
