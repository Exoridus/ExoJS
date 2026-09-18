#version 300 es
precision highp float;

// The occluder mask. Alpha is coverage: a texel at or above the threshold
// blocks, everything else is open.
uniform sampler2D uTexture;

in vec2 vUv;
out vec4 fragColor;

/** Coverage at or above which a mask texel blocks. */
const float SEEDED = 0.5;
/** Seed coordinate that names no texel. */
const float NONE = -1.0;

void main() {
    // `gl_FragCoord.xy` is the destination texel's own centre on both backends -
    // a render target's row 0 is the row the fragment at 0.5 writes either way -
    // so a seed can be stored as a texel coordinate and read back as one.
    // Half-float holds those exactly to 1024, and the field is never wider.
    //
    // Two seed classes in one field: `xy` names the nearest BLOCKING texel and
    // `zw` the nearest OPEN one. Every texel is a seed of exactly one class -
    // itself - so the flood that follows resolves the distance out of a surface
    // and the depth into one in the same rounds.
    bool blocking = texture(uTexture, vUv).a >= SEEDED;

    fragColor = blocking ? vec4(gl_FragCoord.xy, NONE, NONE) : vec4(NONE, NONE, gl_FragCoord.xy);
}
