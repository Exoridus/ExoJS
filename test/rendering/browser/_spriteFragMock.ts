/**
 * Shared mock source for `#rendering/webgl2/glsl/sprite.frag`.
 *
 * The vitest shaderPlugin stubs every `.vert`/`.frag` import to `""`, so the
 * browser specs re-mock the sprite fragment stage with valid GLSL. This helper
 * is the single copy of that mock. It MUST declare the same `u_texture0..15`
 * sampler set as the production shader: `WebGl2SpriteRenderer#onConnect` pins
 * all 16 sampler uniforms strictly, so a mock with fewer samplers would throw
 * at connect — by design, since silently skipping a missing sampler in
 * production would leave it on texture unit 0 (wrong texture, no error).
 *
 * The texcoord varying name is parameterised because the per-file mock vertex
 * stages use either `v_uv` or `v_texcoord`.
 */
export const createSpriteFragMockSource = (texcoordVarying: 'v_uv' | 'v_texcoord' = 'v_uv'): string => {
  const samplers = Array.from({ length: 16 }, (_, i) => `uniform sampler2D u_texture${i};`).join('\n');
  const dispatch = Array.from({ length: 15 }, (_, i) => `  if (slot == uint(${i})) return texture(u_texture${i}, uv);`).join('\n');

  return `#version 300 es
precision mediump float;
in vec2 ${texcoordVarying};
in vec4 v_color;
flat in uint v_textureSlot;
${samplers}
out vec4 outColor;
vec4 sampleTexture(uint slot, vec2 uv) {
${dispatch}
  return texture(u_texture15, uv);
}
void main() { outColor = sampleTexture(v_textureSlot, ${texcoordVarying}) * v_color; }`;
};
