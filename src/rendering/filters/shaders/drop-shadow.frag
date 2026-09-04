#version 300 es
precision mediump float;
uniform sampler2D uTexture;
uniform float uOrientation;
uniform vec4 uShift;
uniform vec4 uColor;
in vec2 vUv;
out vec4 fragColor;
void main() {
    // The shift is a downward offset in domain units; v runs along the domain's
    // y axis on one backend and against it on the other.
    vec2 uv = vUv - vec2(uShift.x, uShift.y * uOrientation);
    // Outside the source there is nothing to cast a shadow: clamp-to-edge
    // sampling would smear the border texel across the shifted band instead.
    float inside = step(0.0, uv.x) * step(0.0, uv.y) * step(uv.x, 1.0) * step(uv.y, 1.0);
    float alpha = texture(uTexture, uv).a * uColor.a * inside;
    fragColor = vec4(uColor.rgb * alpha, alpha);
}
