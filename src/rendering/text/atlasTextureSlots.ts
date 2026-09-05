import {
  buildSpriteMaterialSlotGlsl,
  buildSpriteTextureSlotWgsl,
  composeSpriteMaterialFragmentGlsl,
  spriteMaterialTextureSlots,
} from '#rendering/sprite/materialSources';

/** Atlas textures rotated through one Text renderer batch. @internal */
export const textAtlasTextureSlots = spriteMaterialTextureSlots;

/** Low bits reserved for Text's dense per-flush node row. @internal */
export const textNodeIndexMask = 0x007fffff;

/**
 * Bit marking a quad as a decoration rule rather than a glyph.
 *
 * Taken from the node-row field rather than from the atlas-slot byte: a flush
 * addresses at most a few thousand rows, so giving up half of an eight-million
 * row space costs nothing, while the slot byte is sized by the texture-unit
 * limit and has no spare bit to give.
 * @internal
 */
export const textDecorationFlagBit = 0x00800000;

/** Bit shift of the atlas-texture slot in the packed per-vertex word. @internal */
export const textAtlasSlotShift = 24;

/** Pack one dense Text node row, atlas slot and decoration flag into the 32-bit vertex word. @internal */
export const packTextNodeAtlasSlot = (nodeIndex: number, atlasSlot: number, decoration = false): number =>
  nodeIndex | (decoration ? textDecorationFlagBit : 0) | (atlasSlot << textAtlasSlotShift);

const dimensionCases = Array.from({ length: textAtlasTextureSlots }, (_, slot) =>
  slot < textAtlasTextureSlots - 1
    ? `        case ${slot}u: { return textureDimensions(spriteTexture${slot}, 0); }`
    : `        default: { return textureDimensions(spriteTexture${slot}, 0); }`,
).join('\n');

/** WGSL atlas slot table plus per-slot dimensions used for shadow UV conversion. @internal */
export const textAtlasTextureSlotWgsl = `${buildSpriteTextureSlotWgsl(textAtlasTextureSlots)}

fn atlasTextureDimensions(slot: u32) -> vec2<u32> {
    switch slot {
${dimensionCases}
    }
}`;

/**
 * GLSL slot table for the Text atlases, sampled at fp32.
 *
 * The sprite prologue leaves `sampler2D` at its fragment-stage default, which
 * is `lowp` and right for a colour texture, whose 8 bits per channel it covers.
 * A glyph atlas is a distance field read through `smoothstep` over a band a
 * fraction of a texel wide: there the sampler's step size, 2^-6 at `lowp`,
 * would be the resolution of the antialiased edge itself. Raising the
 * fragment's own `precision` does not reach this - sampler precision is
 * declared separately and governs what `texture()` returns.
 *
 * Desktop ANGLE and SwiftShader compute everything at fp32 whatever the
 * qualifier says, so the declaration is a guarantee for hardware that honours
 * it rather than a fix for a defect visible here.
 * @internal
 */
export const textAtlasPrologueGlsl = buildSpriteMaterialSlotGlsl(textAtlasTextureSlots, 'highp');

/** Inject the Text slot table into a shipped Text fragment shader. @internal */
export const composeTextAtlasFragmentGlsl = (fragment: string): string => composeSpriteMaterialFragmentGlsl(fragment, textAtlasPrologueGlsl);
