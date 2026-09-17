#version 300 es
precision highp float;
precision highp int;

// The distance field: distance out of the nearest surface in `r`, as a
// fraction of `uFar`.
uniform sampler2D uTexture;

out vec4 fragColor;

/** Hard ceiling on a walk. The way to a neighbouring probe is a few texels. */
const int MAX_STEPS = 32;

/** World position to a lookup in the field. See the cascade shader. */
vec2 fieldUv(vec2 world) {
    vec2 clip = vec2(dot(uniforms.uToField.xy, world), dot(uniforms.uToField.zw, world)) + uniforms.uFieldOffset;

    return clip * 0.5 + 0.5;
}

/**
 * How open the straight way from `from` to `to` is: one where nothing comes
 * within a texel of it, falling to zero as a surface crosses it. A wall
 * between two probes then cuts the merge between them, and the fall is
 * gradual so a probe grid sliding over the wall does not switch.
 */
float open(vec2 from, vec2 to) {
    vec2 way = to - from;
    float length_ = length(way);

    if (length_ <= 0.0) {
        return 1.0;
    }

    vec2 direction = way / length_;
    float minStep = max(uniforms.uTexel, 0.0001);
    float travelled = 0.0;
    float nearest = 1e8;

    for (int taken = 0; taken < MAX_STEPS && travelled < length_; taken++) {
        vec2 uv = fieldUv(from + direction * travelled);

        if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
            break;
        }

        float distance = texture(uTexture, uv).r * uniforms.uFar;

        nearest = min(nearest, distance);
        travelled += max(distance, minStep);
    }

    return clamp(nearest / minStep, 0.0, 1.0);
}

void main() {
    ivec2 probe = ivec2(gl_FragCoord.xy);

    if (probe.x >= int(uniforms.uProbes.x) || probe.y >= int(uniforms.uProbes.y)) {
        fragColor = vec4(1.0);

        return;
    }

    // The same four coarser probes the cascade merges from, in the same order.
    ivec2 coarseProbes = ivec2((int(uniforms.uProbes.x) + 1) / 2, (int(uniforms.uProbes.y) + 1) / 2);
    vec2 place = (vec2(probe) + 0.5) * 0.5 - 0.5;
    ivec2 base = ivec2(floor(place));
    vec2 origin = uniforms.uOrigin + (vec2(probe) + 0.5) * uniforms.uSpacing;
    vec4 ways;

    for (int index = 0; index < 4; index++) {
        ivec2 corner = clamp(base + ivec2(index % 2, index / 2), ivec2(0), coarseProbes - 1);

        ways[index] = open(origin, uniforms.uOrigin + (vec2(corner) + 0.5) * (uniforms.uSpacing * 2.0));
    }

    fragColor = ways;
}
