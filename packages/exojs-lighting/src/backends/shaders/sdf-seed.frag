#version 300 es
precision highp float;

// The occluder mask. Alpha is coverage: a texel at or above the threshold is
// where the field's distance is zero.
uniform sampler2D uTexture;

in vec2 vUv;
out vec4 fragColor;

/** Coverage at or above which a mask texel seeds the field. */
const float SEEDED = 0.5;

void main() {
    // `gl_FragCoord.xy` is the destination texel's own centre on both backends -
    // a render target's row 0 is the row the fragment at 0.5 writes either way -
    // so a seed can be stored as a texel coordinate and read back as one.
    // Half-float holds those exactly to 1024, and the field is never wider.
    fragColor = texture(uTexture, vUv).a >= SEEDED ? vec4(gl_FragCoord.xy, 1.0, 1.0) : vec4(0.0, 0.0, 0.0, 1.0);
}
