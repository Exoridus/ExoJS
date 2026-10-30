#version 300 es
precision highp float;
precision highp sampler2D;

// u_content is the premultiplied drawable, u_mask the mask texture sampled for
// its alpha only; both are sampled through per-texture flips selected by
// u_textureFlipY.x (content) and .y (mask). The mask alpha scales ALL FOUR
// components - RGB is premultiplied, so leaving it unscaled would divide the
// colour by the reduced alpha on the way out.
uniform sampler2D u_content;
uniform sampler2D u_mask;
uniform vec2 u_textureFlipY;

in vec2 v_texcoord;

layout(location = 0) out vec4 fragColor;

void main(void) {
    vec2 contentUv = vec2(v_texcoord.x, mix(v_texcoord.y, 1.0 - v_texcoord.y, u_textureFlipY.x));
    vec2 maskUv = vec2(v_texcoord.x, mix(v_texcoord.y, 1.0 - v_texcoord.y, u_textureFlipY.y));
    vec4 contentColor = texture(u_content, contentUv);
    float maskAlpha = texture(u_mask, maskUv).a;

    fragColor = vec4(contentColor.rgb * maskAlpha, contentColor.a * maskAlpha);
}
