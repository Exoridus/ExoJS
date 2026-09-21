#version 300 es
precision highp float;
precision highp int;

// The occluder mask. Alpha is coverage, as everything reading it treats it.
uniform sampler2D uTexture;

out vec4 fragColor;

/** Mask texels one block covers, on each axis. The transport walk repeats this number. */
const int MASK_COARSE = 8;

void main() {
    ivec2 size = textureSize(uTexture, 0);
    ivec2 first = ivec2(floor(gl_FragCoord.xy)) * MASK_COARSE;
    float most = 0.0;

    // A texel of margin on every side, which is what lets a walk skip an
    // unmarked block outright: a stretch inside a block can be stopped by a
    // texel just beyond its edge, at a corner it only touches.
    for (int y = -1; y <= MASK_COARSE; y++) {
        for (int x = -1; x <= MASK_COARSE; x++) {
            ivec2 texel = first + ivec2(x, y);

            if (texel.x < 0 || texel.y < 0 || texel.x >= size.x || texel.y >= size.y) {
                continue;
            }

            most = max(most, texelFetch(uTexture, texel, 0).a);
        }
    }

    fragColor = vec4(most);
}
