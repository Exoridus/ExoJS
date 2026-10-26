#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
uniform sampler2D uTexture;
uniform vec2 uResolution;
uniform float uOrientation;
in vec2 vUv;
out vec4 fragColor;

uint hash(uint value) {
    value ^= value >> 16u;
    value *= 0x7feb352du;
    value ^= value >> 15u;
    value *= 0x846ca68bu;
    return value ^ (value >> 16u);
}

vec4 sampleInside(vec2 uv) {
    float inside = step(0.0, uv.x) * step(0.0, uv.y) * step(uv.x, 1.0) * step(uv.y, 1.0);
    return texture(uTexture, uv) * inside;
}

void main() {
    if (uniforms.uStrength == 0.0 && uniforms.uRgbSeparation == 0.0) {
        fragColor = texture(uTexture, vUv);
        return;
    }

    vec2 centered = vUv * 2.0 - 1.0;
    vec2 uv = centered * (1.0 + dot(centered, centered) * 0.07 * uniforms.uStrength) * 0.5 + 0.5;
    vec4 base = sampleInside(uv);
    vec4 red = sampleInside(uv + vec2(uniforms.uRgbSeparation, 0.0));
    vec4 blue = sampleInside(uv - vec2(uniforms.uRgbSeparation, 0.0));
    float alpha = max(base.a, max(red.a, blue.a));
    vec2 domainUv = vec2(vUv.x, 0.5 + (vUv.y - 0.5) * uOrientation);
    uvec2 pixel = uvec2(floor(domainUv * uResolution));
    uint frame = uint(mod(floor(uniforms.uTime * 45.0), 65536.0));
    float noise = float(hash(pixel.x ^ hash(pixel.y) ^ hash(frame)) >> 8u) / 16777216.0;
    float scan = 1.0 - 0.14 * uniforms.uStrength * (0.5 + 0.5 * sin(domainUv.y * 900.0));
    float grain = (noise - 0.5) * 0.12 * uniforms.uStrength;
    float vignette = 1.0 - smoothstep(0.42, 0.8, length(domainUv - 0.5)) * 0.65 * uniforms.uStrength;
    // Each channel is already premultiplied; the added grain must carry coverage too.
    vec3 rgb = (vec3(red.r, base.g, blue.b) * scan + grain * alpha) * vignette;
    fragColor = vec4(max(vec3(0.0), rgb), alpha);
}
