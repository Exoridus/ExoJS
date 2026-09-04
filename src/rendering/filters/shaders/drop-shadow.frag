#version 300 es
precision mediump float;
uniform sampler2D uTexture;
uniform vec4 uShift;
uniform vec4 uColor;
in vec2 vUv;
out vec4 fragColor;
void main() {
    vec2 uv = vUv - uShift.xy;
    // Outside the source there is nothing to cast a shadow: clamp-to-edge
    // sampling would smear the border texel across the shifted band instead.
    float inside = step(0.0, uv.x) * step(0.0, uv.y) * step(uv.x, 1.0) * step(uv.y, 1.0);
    float alpha = texture(uTexture, uv).a * uColor.a * inside;
    fragColor = vec4(uColor.rgb * alpha, alpha);
}
