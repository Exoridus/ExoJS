import { Rectangle, TextureFormat } from '@codexo/exojs';

import type { Light } from '../lights/Light';
import type { OccluderField } from '../occluders/OccluderField';
import { FrameLightingBackend, type FrameLightingBackendOptions } from './FrameLightingBackend';
import { MASK_COARSE, MaskBlocks } from './maskBlocks';
import { RadianceField, type RadianceFieldOptions } from './radianceField';
import { transportTableWidth } from './transportGeometry';
import { TransportTextures } from './transportTextures';

const scratchRegion = new Rectangle();

/**
 * The options back, or a refusal.
 *
 * Checked before the base class runs rather than after: a cascade chain lives
 * in float targets from end to end, and a renderer that has already taken its
 * place in the frame slot has to be destroyed to leave it again - which a
 * constructor that throws never gets to do.
 */
const requireFloatTargets = (options: RadianceBackendOptions): RadianceBackendOptions => {
  if (!options.app.rendering.supportsColorFormat(TextureFormat.Rgba16F)) {
    throw new Error('RadianceLighting needs renderable float targets, which this device does not have. Use LightmapLighting.');
  }

  return options;
};

/** Construction options for {@link RadianceBackend}. */
export interface RadianceBackendOptions extends FrameLightingBackendOptions {
  /** Tuning for the cascade chain and the walk it traces. */
  readonly field: RadianceFieldOptions;
}

/**
 * Fills the same light field as the quads, but from a chain of radiance
 * cascades traced over this frame's geometry.
 *
 * Light propagates from what emits rather than falling off inside each light's
 * radius, so a lamp fills the room it stands in, thins with distance instead of
 * ending at a radius, and casts penumbrae that widen the way a source with a
 * size does. What it costs is the walk: the transport tables, the block level
 * over the occluder mask, and the chain itself, none of which a project on the
 * quads links.
 *
 * Needs a device that can render into float targets - a field of radiance has
 * no ceiling to clamp at - and is refused at construction without one.
 * @internal
 */
export class RadianceBackend extends FrameLightingBackend {
  protected readonly _cascading = true;

  /** The block level over the occluder mask, which lets a walk skip whole blocks of it. */
  private readonly _blocks: MaskBlocks;
  /** This frame's occluders and sources as the geometry a ray walks. */
  private readonly _transport: TransportTextures;
  private readonly _radiance: RadianceField;

  public constructor(options: RadianceBackendOptions) {
    super(requireFloatTargets(options));

    this._blocks = new MaskBlocks(this._maskTarget);
    this._transport = new TransportTextures();
    this._radiance = new RadianceField(this._target, this._app.frameTexture, options.field);
    this._attach();
  }

  /** What each block of the occluder mask holds, for the walk that skips over it. @internal */
  public get maskBlocks(): MaskBlocks {
    return this._blocks;
  }

  /** This frame's occluders and sources as the geometry a cascade ray walks. @internal */
  public get transport(): TransportTextures {
    return this._transport;
  }

  protected override _attachMaskReaders(): void {
    this._app.framePasses.addPass(this._blocks.pass);
  }

  protected override _attachFieldPasses(): void {
    this._app.framePasses.addPass(this._radiance.cascadePass);
  }

  protected override _detachOwnPasses(): void {
    this._app.framePasses.removePass(this._blocks.pass);
    this._app.framePasses.removePass(this._radiance.cascadePass);
    this._radiance.destroy();
    this._blocks.destroy();
    this._transport.destroy();
  }

  protected override _publishSources(lights: readonly Light[]): void {
    this._activeCount = this._radiance.collectSources(lights);
  }

  /**
   * Turn this frame's occluders and lights into the tables the walk reads, over
   * the region the mask covers.
   *
   * The cell size follows the block level's: both are indexes over the same
   * field, and a walk that crosses one crosses the other at a comparable rate.
   */
  protected override _writeWalk(lights: readonly Light[], occluders: OccluderField): void {
    if (!this.rasterisesOccluders) {
      this._radiance.useTransport(null);

      return;
    }

    const rasterMask = occluders.drawableCount > 0;

    this._setWalkMaskEnabled(rasterMask);

    this._fieldView.getBounds(scratchRegion);
    this._transport.build(occluders.segments, occluders.count, lights, scratchRegion, Math.max(this._maskTexel() * MASK_COARSE, 1));

    const grid = this._transport.grid;

    this._radiance.useTransport({
      textures: {
        uSegments: this._transport.segments,
        uEmitters: this._transport.emitters,
        uCells: this._transport.cells,
        uIndices: this._transport.indices,
        uMask: this._maskTarget,
        uMaskCoarse: this._blocks.texture,
        uMaskSuper: this._blocks.superTexture,
      },
      revision: this._transport.revision,
      originX: grid.originX,
      originY: grid.originY,
      cellSize: grid.cellSize,
      cellsX: grid.width,
      cellsY: grid.height,
      maskWidth: rasterMask ? this._maskTarget.width : 0,
      maskHeight: rasterMask ? this._maskTarget.height : 0,
      blocksWidth: rasterMask ? this._blocks.texture.width : 0,
      blocksHeight: rasterMask ? this._blocks.texture.height : 0,
      superblocksWidth: rasterMask ? this._blocks.superTexture.width : 0,
      superblocksHeight: rasterMask ? this._blocks.superTexture.height : 0,
      tableWidth: transportTableWidth,
    });
  }

  protected override _updateWalk(texel: number): void {
    this._radiance.update(this._app.rendering.view, this._fieldView, texel, this._ambient);
  }

  protected override _resizeWalk(): void {
    this._blocks.setSize(this._maskTarget.width, this._maskTarget.height);
  }

  protected override _invalidateWalkHistory(): void {
    this._radiance.invalidateHistory();
  }

  protected override _syncWalk(cascading: boolean, rasterMask: boolean): void {
    this._blocks.pass.enabled = rasterMask;
    this._radiance.enabled = cascading;
  }
}
