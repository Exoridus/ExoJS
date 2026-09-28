#version 300 es
precision mediump float;
uniform sampler2D uTexture;
uniform sampler2D uLut;
in vec2 vUv;
out vec4 fragColor;
void main() {
    vec4 src = texture(uTexture, vUv);
    // The lookup coordinate is the straight colour, not the premultiplied
    // sample - looking a translucent pixel's darkened premultiplied RGB up
    // directly would grade it as if it were a darker straight colour.
    vec3 straight = src.a > 0.0 ? src.rgb / src.a : vec3(0.0);
    float n = float(textureSize(uLut, 0).x);
    vec3 coord = clamp(straight, 0.0, 1.0) * ((n - 1.0) / n) + 0.5 / n;
    float r = texture(uLut, vec2(coord.r, 0.5)).r;
    float g = texture(uLut, vec2(coord.g, 0.5)).g;
    float b = texture(uLut, vec2(coord.b, 0.5)).b;
    fragColor = vec4(vec3(r, g, b) * src.a, src.a);
}
