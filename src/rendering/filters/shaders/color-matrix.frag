#version 300 es
precision mediump float;
uniform sampler2D uTexture;
uniform vec4 uRow0;
uniform vec4 uRow1;
uniform vec4 uRow2;
uniform vec4 uRow3;
uniform vec4 uBias;
in vec2 vUv;
out vec4 fragColor;
void main() {
    vec4 premultiplied = texture(uTexture, vUv);
    float alpha = premultiplied.a;
    vec4 straight = vec4(alpha > 0.0 ? premultiplied.rgb / alpha : vec3(0.0), alpha);
    vec4 graded = clamp(vec4(dot(uRow0, straight), dot(uRow1, straight), dot(uRow2, straight), dot(uRow3, straight)) + uBias, 0.0, 1.0);
    fragColor = vec4(graded.rgb * graded.a, graded.a);
}
