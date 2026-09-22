#version 300 es
precision mediump float;
uniform sampler2D uTexture;
in vec2 vUv;
out vec4 fragColor;
void main() {
    vec4 premultiplied = texture(uTexture, vUv);
    float alpha = premultiplied.a;
    vec4 straight = vec4(alpha > 0.0 ? premultiplied.rgb / alpha : vec3(0.0), alpha);
    vec4 graded = clamp(
        vec4(dot(uniforms.uRows[0], straight), dot(uniforms.uRows[1], straight), dot(uniforms.uRows[2], straight), dot(uniforms.uRows[3], straight)) +
            uniforms.uBias,
        0.0,
        1.0
    );
    fragColor = vec4(graded.rgb * graded.a, graded.a);
}
