#version 300 es
precision lowp float;

// highp: an HDR float RenderTexture's values can exceed the [0, 1] range
// lowp guarantees on GLES hardware that actually enforces the qualifier
// (desktop ANGLE/SwiftShader compute everything at fp32 regardless); an 8-bit
// colour texture already fits comfortably inside it.
uniform highp sampler2D u_texture;

// UVs need full precision on mobile GLES (the lowp default would quantise
// them); color varyings stay lowp for 8-bit output.
in highp vec2 v_texcoord;
in vec4 v_color;
in vec4 v_tint;

layout(location = 0) out vec4 fragColor;

void main(void) {
    highp vec4 sampleColor = texture(u_texture, v_texcoord);

    // Legacy (colorPipelineEnabled == false): unchanged bit-for-bit, including
    // its erroneous second `* alpha` - preserved verbatim until the gate opens.
    highp vec4 legacyBase = sampleColor * v_color * v_tint;
    highp vec4 legacy = vec4(legacyBase.rgb * legacyBase.a, legacyBase.a);

    // Gated: decode the authored per-vertex colour and per-node tint once,
    // premultiply each, then combine with the sample by a single component-wise
    // multiply - removing the legacy path's erroneous second `* alpha`.
    highp vec3 linearVertexRgb = colorPipelineEnabled ? srgbToLinear(v_color.rgb) : v_color.rgb;
    highp vec4 vertexPremultiplied = vec4(linearVertexRgb * v_color.a, v_color.a);
    highp vec3 linearTintRgb = colorPipelineEnabled ? srgbToLinear(v_tint.rgb) : v_tint.rgb;
    highp vec4 tintPremultiplied = vec4(linearTintRgb * v_tint.a, v_tint.a);
    highp vec4 gated = sampleColor * vertexPremultiplied * tintPremultiplied;

    fragColor = colorPipelineEnabled ? gated : legacy;
}
