import { CallbackRenderPass, createFilterShader, type PassContext, RenderTexture, ScaleModes, ShaderFilter, TextureFormat } from '@codexo/exojs';

import maskBlocksFragment from './shaders/mask-blocks.frag';
import maskBlocksWgsl from './shaders/mask-blocks.wgsl';
import maskSuperblocksFragment from './shaders/mask-superblocks.frag';
import maskSuperblocksWgsl from './shaders/mask-superblocks.wgsl';

/**
 * Mask texels one block covers, on each axis. The transport chunk walks blocks
 * of this size and both halves of it repeat the number, so a change here is a
 * change in three places.
 * @internal
 */
export const MASK_COARSE = 8;

/** Existing mask blocks one superblock covers, on each axis. @internal */
export const MASK_SUPER = 4;

/**
 * Reduces the occluder mask to one texel per block, marking a block wherever a
 * mask texel within one texel of it blocks.
 * @internal
 */
export const maskBlocksShader = createFilterShader({ glsl: { fragment: maskBlocksFragment }, wgsl: maskBlocksWgsl });

/** Reduces the conservative block level without adding another margin. @internal */
export const maskSuperblocksShader = createFilterShader({ glsl: { fragment: maskSuperblocksFragment }, wgsl: maskSuperblocksWgsl });

/** Blocks a mask of this size reduces to. @internal */
export const blockGrid = (width: number, height: number): { width: number; height: number } => ({
  width: Math.max(1, Math.ceil(width / MASK_COARSE)),
  height: Math.max(1, Math.ceil(height / MASK_COARSE)),
});

/** Superblocks a block grid of this size reduces to. @internal */
export const superblockGrid = (width: number, height: number): { width: number; height: number } => ({
  width: Math.max(1, Math.ceil(width / MASK_SUPER)),
  height: Math.max(1, Math.ceil(height / MASK_SUPER)),
});

/**
 * What each block of the occluder mask holds, so a walk over the mask can skip
 * a block outright instead of reading its texels.
 *
 * The margin of one texel around each block is what makes skipping sound: a
 * stretch inside a block can be stopped by a texel just beyond its edge - the
 * two that share only the corner it crosses - so a block reduced over its own
 * texels alone would let that stretch through.
 * @internal
 */
export class MaskBlocks {
  /** Both reductions as one pipeline pass, disabled until something reads the hierarchy. */
  public readonly pass: CallbackRenderPass;

  private readonly _mask: RenderTexture;
  private readonly _blocks: RenderTexture;
  private readonly _superblocks: RenderTexture;
  private readonly _filter: ShaderFilter;
  private readonly _superFilter: ShaderFilter;

  public constructor(mask: RenderTexture) {
    this._mask = mask;
    // Unfiltered: a block is read by index, and interpolating two of them
    // would report a block between them that neither describes.
    this._blocks = new RenderTexture(1, 1, { format: TextureFormat.Rgba8, scaleMode: ScaleModes.Nearest });
    this._superblocks = new RenderTexture(1, 1, { format: TextureFormat.Rgba8, scaleMode: ScaleModes.Nearest });
    this._filter = ShaderFilter.from(maskBlocksShader);
    this._superFilter = ShaderFilter.from(maskSuperblocksShader);
    this.pass = new CallbackRenderPass((pass: PassContext) => this._build(pass), { label: 'lighting:mask-blocks', enabled: false });
  }

  /** One texel per block, coverage in alpha as the mask holds it. */
  public get texture(): RenderTexture {
    return this._blocks;
  }

  /** One texel per 4x4 square of the conservative block level. */
  public get superTexture(): RenderTexture {
    return this._superblocks;
  }

  /** Follow the mask's grid, which is the size this reduces. */
  public setSize(width: number, height: number): void {
    const grid = blockGrid(width, height);
    const supergrid = superblockGrid(grid.width, grid.height);

    this._blocks.setSize(grid.width, grid.height);
    this._superblocks.setSize(supergrid.width, supergrid.height);
  }

  public destroy(): void {
    this.pass.destroy();
    this._filter.destroy();
    this._superFilter.destroy();
    this._blocks.destroy();
    this._superblocks.destroy();
  }

  private _build(pass: PassContext): void {
    this._filter.apply(pass.backend, this._mask, this._blocks);
    this._superFilter.apply(pass.backend, this._blocks, this._superblocks);
  }
}
