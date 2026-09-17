#version 300 es
precision highp float;
precision highp int;

// The seed field from the previous round: `xy` is the nearest seed's texel
// coordinate and `z` says whether one was found at all.
uniform sampler2D uTexture;

out vec4 fragColor;

void main() {
    ivec2 size = textureSize(uTexture, 0);
    vec2 here = gl_FragCoord.xy;
    ivec2 origin = ivec2(here);
    int offset = int(uniforms.uStep);
    vec2 best = vec2(0.0);
    float found = 0.0;
    float nearest = 0.0;

    // The jump flood's nine taps: this texel and the eight around it at the
    // round's own stride. Each carries the nearest seed ITS neighbourhood knew,
    // which is what lets a round halve the stride and still cover the plane.
    for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
            ivec2 at = origin + ivec2(x, y) * offset;

            // Outside the field there is no answer, and clamping to the edge
            // would invent one: an edge texel's seed would spread inwards as if
            // the wall continued past the border.
            if (at.x < 0 || at.y < 0 || at.x >= size.x || at.y >= size.y) {
                continue;
            }

            vec4 candidate = texelFetch(uTexture, at, 0);

            if (candidate.z < 0.5) {
                continue;
            }

            vec2 delta = here - candidate.xy;
            float squared = dot(delta, delta);

            if (found == 0.0 || squared < nearest) {
                nearest = squared;
                best = candidate.xy;
                found = 1.0;
            }
        }
    }

    fragColor = vec4(best, found, 1.0);
}
