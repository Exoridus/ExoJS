#version 300 es
precision highp float;
precision highp int;

uniform sampler2D uTexture;

out vec4 fragColor;

void main() {
    ivec2 compact = ivec2(floor(gl_FragCoord.xy));
    int tile = int(uniforms.uTile);
    int compactTile = tile / 2;
    ivec2 probe = compact / compactTile;
    ivec2 within = compact - probe * compactTile;
    int direction = within.y * compactTile + within.x;
    int first = direction * 4;
    vec3 total = vec3(0.0);

    for (int sub = 0; sub < 4; sub++) {
        int angle = first + sub;

        total += texelFetch(uTexture, probe * tile + ivec2(angle % tile, angle / tile), 0).rgb;
    }

    fragColor = vec4(total * 0.25, 1.0);
}
