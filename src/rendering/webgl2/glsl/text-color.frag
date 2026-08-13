#version 300 es
precision mediump float;

uniform sampler2D u_nodeData;  // RGBA32F per-node data

flat in int  v_nodeIndex;
     in vec2 v_texcoord;

layout(location = 0) out vec4 fragColor;

void main(void) {
  // texel 2: fillColor (tint multiplier; (1,1,1,1) = no tint)
  vec4 tint   = texelFetch(u_nodeData, ivec2(2, v_nodeIndex), 0);
  vec4 texel  = sampleBase(v_textureSlot, v_texcoord);
  fragColor   = texel * tint;
}
