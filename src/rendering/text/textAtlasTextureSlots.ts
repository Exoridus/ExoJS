import { buildSpriteTextureSlotWgsl, composeSpriteMaterialFragmentGlsl, spriteMaterialTextureSlots } from '#rendering/sprite/spriteMaterialSources';

/** Atlas textures rotated through one Text renderer batch. @internal */
export const textAtlasTextureSlots = spriteMaterialTextureSlots;

/** Low bits reserved for Text's dense per-flush node row. @internal */
export const textNodeIndexMask = 0x00ffffff;

/** Bit shift of the atlas-texture slot in the packed per-vertex word. @internal */
export const textAtlasSlotShift = 24;

/** Pack one dense Text node row and atlas slot into the existing 32-bit vertex word. @internal */
export const packTextNodeAtlasSlot = (nodeIndex: number, atlasSlot: number): number => nodeIndex | (atlasSlot << textAtlasSlotShift);

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

/** Inject the shared GLSL slot table into a shipped Text fragment shader. @internal */
export const composeTextAtlasFragmentGlsl = composeSpriteMaterialFragmentGlsl;
