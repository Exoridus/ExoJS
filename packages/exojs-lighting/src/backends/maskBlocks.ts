import {
  CallbackRenderPass,
  createFilterShader,
  type PassContext,
  type ReadonlyRectangle,
  type Rectangle,
  RenderTexture,
  ScaleModes,
  ShaderFilter,
  TextureFormat,
} from '@codexo/exojs';

import maskBlocksFragment from './shaders/mask-blocks.frag';
import maskBlocksWgsl from './shaders/mask-blocks.wgsl';
import maskSuperblocksFragment from './shaders/mask-superblocks.frag';
import maskSuperblocksWgsl from './shaders/mask-superblocks.wgsl';

/**
 * Mask texels one block covers, on each axis. The transport walk and the two
 * mask reductions repeat the number in both GLSL and WGSL, so a change here is
 * a change in five places.
 * @internal
 */
export const MASK_COARSE = 8;

/** Existing mask blocks one superblock covers, on each axis. @internal */
export const MASK_SUPER = 4;

/**
 * Share of superblocks holding a rasterised boundary from which the walk is
 * faster without the superblock level than with it. Below it the level skips
 * enough empty space to pay for itself; above it nearly every superblock is
 * entered anyway and the level only adds work.
 * @internal
 */
export const SUPERBLOCK_DENSE_OCCUPANCY = 0.095;

/**
 * Estimated share of a region's superblocks that hold the boundary of one of
 * `shapes`. A shape larger than two superblocks across counts only its ring: a
 * stretch meets such a shape at its boundary, so its interior never costs the
 * walk a step. Overlap is counted twice, which overstates a crowded region.
 * @internal
 */
export const superblockOccupancy = (
  shapes: ReadonlyArray<{ getBounds(target: Rectangle): Rectangle }>,
  scratch: Rectangle,
  region: ReadonlyRectangle,
  size: number,
): number => {
  const columns = Math.ceil(region.width / size);
  const rows = Math.ceil(region.height / size);
  let occupied = 0;

  for (const drawable of shapes) {
    const shape = drawable.getBounds(scratch);
    const left = Math.max(shape.left, region.left);
    const right = Math.min(shape.right, region.right);
    const top = Math.max(shape.top, region.top);
    const bottom = Math.min(shape.bottom, region.bottom);

    if (right > left && bottom > top) {
      const across = Math.floor((right - region.left) / size) - Math.floor((left - region.left) / size) + 1;
      const down = Math.floor((bottom - region.top) / size) - Math.floor((top - region.top) / size) + 1;

      occupied += across > 2 && down > 2 ? 2 * (across + down) - 4 : across * down;
    }
  }

  return Math.min(1, occupied / Math.max(1, columns * rows));
};

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
