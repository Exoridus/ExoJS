#version 300 es
precision highp float;
precision highp int;

// The finest cascade, already merged with everything above it.
uniform sampler2D uTexture;

in vec2 vUv;
out vec4 fragColor;

/** The radiance one probe carries, averaged over every direction it holds. */
vec3 probeRadiance(ivec2 probe, int tile) {
    vec3 total = vec3(0.0);

    for (int y = 0; y < tile; y++) {
        for (int x = 0; x < tile; x++) {
            total += texelFetch(uTexture, probe * tile + ivec2(x, y), 0).rgb;
        }
    }

    return total / float(tile * tile);
}

void main() {
    // Flipped on v because WebGL2 writes this target bottom-up: the destination
    // texel at `vUv.y == 0` is the world's BOTTOM edge there and its top here.
    vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
    vec2 world = uniforms.uView.xy + uv * uniforms.uView.zw;
    // Where this fragment sits in the probe grid, in probe units and measured
    // from probe centres, which is what makes the interpolation below linear in
    // world space.
    vec2 place = (world - uniforms.uOrigin) / uniforms.uSpacing - 0.5;
    vec2 weight = fract(place);
    ivec2 base = ivec2(floor(place));
    ivec2 probes = ivec2(uniforms.uProbes);
    int tile = int(uniforms.uTile);
    vec3 total = vec3(0.0);

    // Bilinear between the four probes around this fragment: taking the nearest
    // one would draw the probe grid itself into the picture.
    for (int y = 0; y <= 1; y++) {
        for (int x = 0; x <= 1; x++) {
            ivec2 at = clamp(base + ivec2(x, y), ivec2(0), probes - 1);
            float share = (x == 0 ? 1.0 - weight.x : weight.x) * (y == 0 ? 1.0 - weight.y : weight.y);

            total += probeRadiance(at, tile) * share;
        }
    }

    fragColor = vec4(total + uniforms.uAmbient, 1.0);
}
