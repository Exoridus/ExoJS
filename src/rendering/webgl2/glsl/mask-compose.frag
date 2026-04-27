#version 300 es
precision lowp float;

uniform sampler2D u_content;
uniform sampler2D u_mask;

in vec2 v_texcoord;

layout(location = 0) out vec4 fragColor;

void main(void) {
    vec4 contentColor = texture(u_content, v_texcoord);
    float maskAlpha = texture(u_mask, v_texcoord).a;

    fragColor = vec4(contentColor.rgb * maskAlpha, contentColor.a * maskAlpha);
}
