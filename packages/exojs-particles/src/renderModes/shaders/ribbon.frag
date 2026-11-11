#version 300 es
precision highp float;
precision highp sampler2D;

uniform sampler2D u_texture;

// The bound sample's alpha association, set per system from the backend's
// texture policy; the WebGPU stages apply the same flag.
uniform float u_associateSample;

// UVs need full precision on mobile GLES (the lowp default would quantise
// them); colour is linear and may exceed 1 in an HDR working format, so the stage runs at full precision throughout.
in highp vec2 v_texcoord;
in vec4 v_color;

layout(location = 0) out vec4 fragColor;

void main(void) {
    vec4 texel = texture(u_texture, v_texcoord);

    if (u_associateSample > 0.5) {
        texel = vec4(texel.rgb * texel.a, texel.a);
    }

    fragColor = texel * v_color;
}
