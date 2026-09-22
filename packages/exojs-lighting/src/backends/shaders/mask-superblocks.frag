#version 300 es
precision highp float;
precision highp int;

uniform sampler2D uTexture;

out vec4 fragColor;

const int MASK_SUPER = 4;

void main() {
    ivec2 size = textureSize(uTexture, 0);
    ivec2 first = ivec2(floor(gl_FragCoord.xy)) * MASK_SUPER;
    float most = 0.0;

    for (int y = 0; y < MASK_SUPER; y++) {
        for (int x = 0; x < MASK_SUPER; x++) {
            ivec2 texel = first + ivec2(x, y);

            if (texel.x >= size.x || texel.y >= size.y) {
                continue;
            }

            most = max(most, texelFetch(uTexture, texel, 0).a);
        }
    }

    fragColor = vec4(most);
}
