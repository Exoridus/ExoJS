#version 300 es
precision highp float;
precision highp int;

// The seed field from the previous round: `xy` is the index of the nearest
// blocking texel and `zw` that of the nearest open one, each `-1` where none
// was found yet. An index names its texel's centre at `index + 0.5`.
uniform sampler2D uTexture;

out vec4 fragColor;

void main() {
    ivec2 size = textureSize(uTexture, 0);
    vec2 here = gl_FragCoord.xy;
    ivec2 origin = ivec2(here);
    int offset = int(uniforms.uStep);
    vec2 blocking = vec2(-1.0);
    vec2 open = vec2(-1.0);
    float nearestBlocking = 1e30;
    float nearestOpen = 1e30;

    // The jump flood's nine taps: this texel and the eight around it at the
    // round's own stride. Each carries the nearest seed ITS neighbourhood knew,
    // which is what lets a round halve the stride and still cover the plane.
    // Both classes ride the same taps, so the second field costs no fetches.
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

            if (candidate.x >= 0.0) {
                vec2 delta = here - (candidate.xy + 0.5);
                float squared = dot(delta, delta);

                if (squared < nearestBlocking) {
                    nearestBlocking = squared;
                    blocking = candidate.xy;
                }
            }

            if (candidate.z >= 0.0) {
                vec2 delta = here - (candidate.zw + 0.5);
                float squared = dot(delta, delta);

                if (squared < nearestOpen) {
                    nearestOpen = squared;
                    open = candidate.zw;
                }
            }
        }
    }

    fragColor = vec4(blocking, open);
}
