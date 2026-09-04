#version 300 es
precision highp float;
precision highp int;

// Forward point lighting for one sprite fragment. The engine splices its
// base-texture slot table and `sampleBase()` in below the precision block.
in vec2 v_texcoord;
in vec4 v_color;
in vec2 v_worldPosition;
flat in vec4 v_basis;

uniform sampler2D u_normalMap;
// Light data is world-space positions and radii, so the sampler has to keep
// full float precision - the fragment-stage default for a sampler is lowp,
// which would quantise a light position to a few hundred distinct values.
uniform highp sampler2D u_lights;

out vec4 fragColor;

void main(void) {
    vec4 base = sampleBase(v_textureSlot, v_texcoord);

    // Rotate the tangent-space normal by the instance's local-to-world basis so
    // a spinning or mirrored sprite keeps its bumps facing the right way.
    vec3 tangentNormal = texture(u_normalMap, v_texcoord).xyz * 2.0 - 1.0;
    vec2 axisX = normalize(vec2(v_basis.x, v_basis.z));
    vec2 axisY = normalize(vec2(v_basis.y, v_basis.w));
    vec3 normal = normalize(vec3(axisX * tangentNormal.x + axisY * tangentNormal.y, tangentNormal.z));

    int count = int(texelFetch(u_lights, ivec2(0, 0), 0).x);
    vec3 lit = texelFetch(u_lights, ivec2(0, 1), 0).rgb;

    for (int index = 0; index < count; index++) {
        vec4 light = texelFetch(u_lights, ivec2(index + 1, 0), 0);
        vec4 tint = texelFetch(u_lights, ivec2(index + 1, 1), 0);
        vec2 toLight = light.xy - v_worldPosition;
        float falloff = clamp(1.0 - length(toLight) / light.z, 0.0, 1.0);
        vec3 direction = normalize(vec3(toLight, tint.w));

        lit += tint.rgb * (max(dot(normal, direction), 0.0) * falloff * falloff * light.w);
    }

    fragColor = vec4(base.rgb * lit, base.a) * v_color;
}
