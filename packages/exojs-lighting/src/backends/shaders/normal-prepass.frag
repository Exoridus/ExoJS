#version 300 es
precision highp float;

in vec2 v_uv;
flat in vec4 v_basis;

// The drawable's own texture, read for its alpha only: the quad is a rectangle
// and the silhouette inside it is what actually has a surface.
uniform sampler2D u_albedo;
uniform sampler2D u_normalMap;

out vec4 fragColor;

void main() {
    float coverage = texture(u_albedo, v_uv).a;

    // Rotated by the instance's local-to-world basis, the same way the forward
    // renderer does it in the sprite stage, so a spinning or mirrored drawable
    // keeps its bumps facing the right way and both renderers agree.
    // Green above the midpoint means "faces up" - the convention every
    // authoring tool writes - and up on screen is world -y here, so the tangent
    // normal's y is negated on the way in. Without it a normal map lights its
    // bevels from the wrong side of the horizon, and only the vertical ones:
    // left and right stay correct, which is what makes it hard to see.
    vec3 tangentNormal = texture(u_normalMap, v_uv).xyz * 2.0 - 1.0;
    tangentNormal.y = -tangentNormal.y;
    vec2 axisX = normalize(vec2(v_basis.x, v_basis.z));
    vec2 axisY = normalize(vec2(v_basis.y, v_basis.w));
    vec3 normal = normalize(vec3(axisX * tangentNormal.x + axisY * tangentNormal.y, tangentNormal.z));

    // Alpha is coverage, not opacity: the light pass reads it as "a surface was
    // described here" and falls back to an unattenuated term where it is zero.
    // Premultiplied, so the pass's ordinary blend resolves an overlap the way
    // the frame did - the topmost opaque surface wins, a translucent one mixes.
    fragColor = vec4((normal * 0.5 + 0.5) * coverage, coverage);
}
