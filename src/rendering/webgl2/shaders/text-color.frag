#version 300 es
precision mediump float;

uniform sampler2D u_nodeData;  // RGBA32F per-node data

flat in int  v_nodeIndex;
flat in uint v_decoration;
     in vec2 v_texcoord;

layout(location = 0) out vec4 fragColor;

void main(void) {
  // texel 2: fillColor (tint multiplier; (1,1,1,1) = no tint)
  vec4 tint   = texelFetch(u_nodeData, ivec2(2, v_nodeIndex), 0);
  vec4 params = texelFetch(u_nodeData, ivec2(6, v_nodeIndex), 0);

  // A decoration quad samples the atlas's white block, so tinting it with the
  // fill is already right; an explicit rule colour replaces the tint outright.
  if (v_decoration == 1u && params.z > 0.5) {
    tint = texelFetch(u_nodeData, ivec2(8, v_nodeIndex), 0);
  }

  vec4 texel = sampleBase(v_textureSlot, v_texcoord);

  // Legacy (colorPipelineEnabled == false): unchanged bit-for-bit - tint is
  // authored straight and was never decoded or premultiplied before this
  // modulate, so white ((1,1,1,1)) is the only tint that leaves texel alone.
  vec4 legacy = texel * tint;

  // Gated: decode the authored tint once and premultiply it, matching the
  // sprite tint convention, before combining with the already-associated
  // sample by a single component-wise multiply.
  vec3 linearTintRgb = srgbToLinear(tint.rgb);
  vec4 tintPremultiplied = vec4(linearTintRgb * tint.a, tint.a);
  vec4 gated = texel * tintPremultiplied;

  fragColor = colorPipelineEnabled ? gated : legacy;
}
