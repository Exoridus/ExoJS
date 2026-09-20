// How open the way from each probe to the four coarser ones around it is,
// answered by the transport walk rather than by the distance field.
//
// The bindings, the version directive and the transport chunk are prepended by
// the module that builds this shader.
//
// The walk answers exactly: a way is open or it is not. The field's own
// version fades over the last texel before a surface, which keeps a probe grid
// sliding across a wall from switching all at once; the difference belongs to
// the comparison between the two walks rather than to a fudge here.

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

        ways[index] = traceSegment(origin, uniforms.uOrigin + (vec2(corner) + 0.5) * (uniforms.uSpacing * 2.0)).transmittance;
    }

    fragColor = ways;
}
