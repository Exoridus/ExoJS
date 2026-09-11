#version 300 es
// highp, not the mediump the single-sample filters use: a wide kernel sums up
// to 65 samples, and a 10-bit mantissa quantises the tail weights into visible
// bands before the sum is finished.
precision highp float;
uniform sampler2D uTexture;
in vec2 vUv;
out vec4 fragColor;
void main() {
    // Entry 0 carries the centre tap: weight in z, the entry count in w.
    vec4 centre = uniforms.uTaps[0];
    vec4 sum = texture(uTexture, vUv) * centre.z;
    int count = int(centre.w);

    for (int tap = 1; tap < count; tap++) {
        vec4 entry = uniforms.uTaps[tap];

        sum += (texture(uTexture, vUv + entry.xy) + texture(uTexture, vUv - entry.xy)) * entry.z;
    }

    fragColor = sum;
}
