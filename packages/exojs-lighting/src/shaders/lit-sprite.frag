#version 300 es
precision highp float;
precision highp int;

// Forward lighting for one sprite fragment: point and cone lights. The engine splices its
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
    // Green above the midpoint means "leans towards the top of the image" in
    // the canonical OpenGL convention, and the top of a sprite is local -y
    // here, so the tangent normal's y is negated on the way in. `normalY`
    // carries the source's own convention and is -1 for a DirectX map, which
    // undoes that negation. Without either, a normal map lights its vertical
    // detail from the wrong side while its horizontal detail stays correct,
    // which is what makes it hard to see.
    vec3 tangentNormal = texture(u_normalMap, v_texcoord).xyz * 2.0 - 1.0;
    tangentNormal.y = -tangentNormal.y * uniforms.normalY;
    vec2 axisX = normalize(vec2(v_basis.x, v_basis.z));
    vec2 axisY = normalize(vec2(v_basis.y, v_basis.w));
    vec3 normal = normalize(vec3(axisX * tangentNormal.x + axisY * tangentNormal.y, tangentNormal.z));

    int count = int(texelFetch(u_lights, ivec2(0, 0), 0).x);
    vec3 lit = texelFetch(u_lights, ivec2(0, 1), 0).rgb;

    for (int index = 0; index < count; index++) {
        vec4 light = texelFetch(u_lights, ivec2(index + 1, 0), 0);
        vec4 tint = texelFetch(u_lights, ivec2(index + 1, 1), 0);
        vec4 cone = texelFetch(u_lights, ivec2(index + 1, 2), 0);
        vec2 toLight = light.xy - v_worldPosition;
        float falloff = clamp(1.0 - length(toLight) / light.z, 0.0, 1.0);
        vec3 direction = normalize(vec3(toLight, tint.w));

        // A point light writes both cone cosines as -1, which no direction can
        // fail, so the cone term is 1 for it and the loop never branches.
        vec2 fromLight = normalize(-toLight);
        float alignment = dot(fromLight, cone.xy);
        float coneTerm = cone.z == cone.w ? step(cone.z, alignment) : smoothstep(cone.z, cone.w, alignment);

        lit += tint.rgb * (max(dot(normal, direction), 0.0) * falloff * falloff * light.w * coneTerm);
    }

    // Emission is added to the light rather than to the colour, so it scales
    // the albedo the same way a light does and a transparent pixel stays
    // transparent instead of glowing through its own alpha.
    fragColor = vec4(base.rgb * (lit + uniforms.emissive), base.a) * v_color;
}
