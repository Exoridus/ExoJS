#version 300 es
precision lowp float;

uniform sampler2D u_texture;

// UVs need full precision on mobile GLES — especially on the shader path,
// whose tiling UVs can span many repeats and would quantise visibly at lowp.
// The color varying stays lowp for 8-bit output.
in highp vec2 v_texcoord;
in vec4 v_color;

layout(location = 0) out vec4 fragColor;

void main(void) {
    fragColor = texture(u_texture, v_texcoord) * v_color;
}
