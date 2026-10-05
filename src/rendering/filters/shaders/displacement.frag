#version 300 es
precision highp float;
precision highp sampler2D;
uniform sampler2D uTexture;
uniform float uOrientation;
uniform sampler2D uMap;
in vec2 vUv;
out vec4 fragColor;
void main() {
    // The map is an ordinary texture - its row 0 is its top on both backends -
    // while v runs through the effect domain either way up, so the map's own v
    // is vUv.y mirrored about the middle wherever the two disagree.
    vec2 mapUv = vec2(vUv.x, 0.5 + (vUv.y - 0.5) * uOrientation) + uniforms.uOffset.xy;
    vec2 displacement = texture(uMap, mapUv).rg * 2.0 - 1.0;
    vec2 uv = vUv + vec2(displacement.x * uniforms.uScale.x, displacement.y * uniforms.uScale.y * uOrientation);
    // Outside the effect domain there is nothing to pull in: clamp-to-edge
    // sampling would smear the border texel across the displaced band instead.
    float inside = step(0.0, uv.x) * step(0.0, uv.y) * step(uv.x, 1.0) * step(uv.y, 1.0);
    fragColor = texture(uTexture, uv) * inside;
}
