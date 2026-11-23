#version 300 es
precision highp float;
precision highp int;

// Four bounded texture slots retain tile painter order across alternating atlases.
// Explicit textureGrad preserves normal mip selection in divergent slot branches.
uniform sampler2D u_texture0;
uniform sampler2D u_texture1;
uniform sampler2D u_texture2;
uniform sampler2D u_texture3;

in vec2 v_texcoord;
in vec4 v_color;
flat in uint v_textureSlot;

layout(location = 0) out vec4 fragColor;

void main(void) {
    vec2 gradX = dFdx(v_texcoord);
    vec2 gradY = dFdy(v_texcoord);
    vec4 sampleColor;
    if (v_textureSlot == 0u) {
        sampleColor = textureGrad(u_texture0, v_texcoord, gradX, gradY);
    } else if (v_textureSlot == 1u) {
        sampleColor = textureGrad(u_texture1, v_texcoord, gradX, gradY);
    } else if (v_textureSlot == 2u) {
        sampleColor = textureGrad(u_texture2, v_texcoord, gradX, gradY);
    } else {
        sampleColor = textureGrad(u_texture3, v_texcoord, gradX, gradY);
    }
    fragColor = sampleColor * v_color;
}
