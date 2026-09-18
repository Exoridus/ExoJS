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
    // so its floor is the texel's INDEX. The index rather than the centre is
    // what is stored: it is a whole number, which the seed format holds
    // exactly across the field, and it is also what indexes the mask again
    // when the resolve reads back where inside the texel the edge runs.
    //
    // Two seed classes in one field: `xy` names the nearest BLOCKING texel and
    // `zw` the nearest OPEN one. Every texel is a seed of exactly one class -
    // itself - so the flood that follows resolves the distance out of a surface
    // and the depth into one in the same rounds.
    bool blocking = texture(uTexture, vUv).a >= SEEDED;
    vec2 index = floor(gl_FragCoord.xy);

    fragColor = blocking ? vec4(index, NONE, NONE) : vec4(NONE, NONE, index);
}
