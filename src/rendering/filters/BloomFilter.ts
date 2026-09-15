import { Color } from '#core/Color';
import type { ReadonlyRectangle, Rectangle } from '#math/Rectangle';
import { BackendTargetPass } from '#rendering/BackendTargetPass';
import { drawDrawableDirect } from '#rendering/plan/drawDrawableDirect';
import type { RenderBackend } from '#rendering/RenderBackend';
import { Sprite } from '#rendering/sprite/Sprite';
import type { RenderTexture } from '#rendering/texture/RenderTexture';
import { BlendModes } from '#rendering/types';
import { UniformType } from '#rendering/uniforms/UniformType';

import { BlurFilter } from './BlurFilter';
import { Filter } from './Filter';
import { createFilterShader, ShaderFilter } from './ShaderFilter';
import glslFragment from './shaders/bloom-threshold.frag';
import wgslFragment from './shaders/bloom-threshold.wgsl';

/**
 * Halvings the chain may take. Five takes a 1280-wide frame down to 40 texels,
 * past which a further level carries too few texels to describe a falloff, and
 * it bounds the render textures one application borrows at six.
 */
const MAX_LEVELS = 5;

/**
 * Width of the soft knee as a fraction of the threshold. Fixed rather than
 * exposed: it is the shape of the transition, not a quantity a scene tunes, and
 * every value in the useful range looks like a slightly different threshold.
 */
const KNEE_SOFTNESS = 0.5;

/**
 * The bright-pass source pair, built once and shared by every instance.
 * Exported so the structural parity checks can read the same object the filter
 * runs rather than a copy of it.
 * @internal
 */
export const bloomThresholdShader = createFilterShader({
  glsl: { fragment: glslFragment },
  wgsl: wgslFragment,
  uniforms: { uThreshold: UniformType.Float, uKnee: UniformType.Float, uIntensity: UniformType.Float },
});

/** Construction-time options for a {@link BloomFilter}. */
export interface BloomFilterOptions {
  /**
   * Luminance a pixel needs before it glows, in `0..1`. Rec. 709 luma of the
   * premultiplied input, so a half-transparent white glows like an opaque grey.
   *
   * The knee is soft, which puts this value in the MIDDLE of the transition
   * rather than at a hard cut: light a little below it still contributes a
   * little glow, and a gradient crossing it shows no edge. Default `0.8`.
   */
  readonly threshold?: number;
  /**
   * How much of the extracted highlight is added back. `0` leaves the input
   * untouched, `1` adds the full excess over the threshold, higher values push
   * a brighter glow. Default `1`.
   */
  readonly intensity?: number;
  /**
   * Gaussian standard deviation of the glow in LOGICAL units - the same
   * quantity {@link BlurFilterOptions.strength} takes, unchanged by the
   * display's pixel ratio. Default `8`.
   */
  readonly strength?: number;
  /**
   * Halvings between the input and the blurred level, `1..5`. Raising it widens
   * the soft base of the glow and makes the blur cheaper; lowering it keeps the
   * glow tighter around the highlight. Default `3`.
   */
  readonly levels?: number;
  /** Tap cap for the blur, see {@link BlurFilterOptions.quality}. Derived when omitted. */
  readonly quality?: number;
}

/**
 * A {@link Filter} that adds a soft glow around the bright parts of its input -
 * bloom, in the engine's ordinary sRGB path.
 *
 * Pixels whose luminance passes {@link threshold} are extracted through a soft
 * knee, spread over a chain of {@link levels} half-resolution targets, blurred
 * by {@link strength}, and added back on top of the unchanged input. Only the
 * EXCESS over the threshold glows, so a scene keeps its own colours instead of
 * washing out.
 *
 * ```ts
 * // A glow around the lamps, leaving everything below 70% luminance alone.
 * world.filters = [new BloomFilter({ threshold: 0.7, intensity: 1.4, strength: 12 })];
 * ```
 *
 * The glow reaches `strength * 3` logical units outside its input - the blur's
 * truncation point - plus the spread the halving chain adds on its own, so a
 * subject at rest keeps the room its glow needs.
 *
 * ## Range
 *
 * There is no HDR anywhere in the chain: the input, every intermediate and the
 * result are eight-bit sRGB. The extraction keeps headroom for an
 * {@link intensity} of roughly `1 / (1 - threshold)` before the glow saturates
 * to white, which is where the effect stops getting brighter and starts getting
 * flatter. Grading belongs to {@link LutFilter}, before or after this one.
 *
 * Runs on a {@link ShaderFilter} carrying both a GLSL and a WGSL source, so it
 * works on either backend without the caller choosing one.
 */
export class BloomFilter extends Filter {
  /** `uThreshold`/`uKnee` shape the extraction, `uIntensity` scales what it emits. */
  private readonly _extraction = ShaderFilter.from(bloomThresholdShader);
  private readonly _blur: BlurFilter;
  /**
   * One sprite per draw in the composite: both are batched and resolved at
   * flush, so a single sprite re-pointed between the two draws would sample the
   * same texture twice. Every chain draw lands in a pass of its own, which
   * flushes, so those share one.
   */
  private readonly _chainSprite: Sprite = new Sprite(null);
  private readonly _bloomSprite: Sprite = new Sprite(null);
  private readonly _sourceSprite: Sprite = new Sprite(null);
  private readonly _chainPass: BackendTargetPass = new BackendTargetPass(backend => this._drawChain(backend));
  private readonly _compositePass: BackendTargetPass = new BackendTargetPass(backend => this._drawComposite(backend));
  /**
   * The chain's borrowed targets, held for the length of one application. Sized
   * to the maximum up front so an application borrows and returns without ever
   * growing an array.
   */
  private readonly _levelTextures: Array<RenderTexture | null> = new Array<RenderTexture | null>(MAX_LEVELS).fill(null);
  private _levels: number;
  private _threshold: number;
  private _intensity: number;
  /** Staged by {@link apply} for the pass bodies, which take no parameters. */
  private _passSource: RenderTexture | null = null;
  private _passBloom: RenderTexture | null = null;
  private _passTarget: RenderTexture | null = null;
  private _passChainInput: RenderTexture | null = null;
  private _chainBlendMode: BlendModes = BlendModes.Normal;

  public constructor(options: BloomFilterOptions = {}) {
    super();

    this._levels = clampLevels(options.levels);
    this._threshold = clamp01(options.threshold ?? 0.8);
    this._intensity = Math.max(0, options.intensity ?? 1);
    this._blur = new BlurFilter({ strength: options.strength ?? 8, ...(options.quality !== undefined && { quality: options.quality }) });
    this._writeExtraction();
  }

  /** Luminance a pixel needs before it glows, in `0..1` - the middle of a soft transition, not a hard cut. */
  public get threshold(): number {
    return this._threshold;
  }

  public set threshold(threshold: number) {
    const next = clamp01(threshold);

    if (this._threshold !== next) {
      this._threshold = next;
      this._writeExtraction();
      this.invalidate();
    }
  }

  /** How much of the extracted highlight is added back. `0` leaves the input untouched. */
  public get intensity(): number {
    return this._intensity;
  }

  public set intensity(intensity: number) {
    const next = Math.max(0, intensity);

    if (this._intensity !== next) {
      this._intensity = next;
      this._writeExtraction();
      this.invalidate();
    }
  }

  /** Gaussian standard deviation of the glow in logical units. */
  public get strength(): number {
    return this._blur.strength;
  }

  public set strength(strength: number) {
    if (this._blur.strength !== Math.max(0, strength)) {
      this._blur.strength = strength;
      this.invalidate();
    }
  }

  /** Halvings between the input and the blurred level, `1..5`. */
  public get levels(): number {
    return this._levels;
  }

  public set levels(levels: number) {
    const next = clampLevels(levels);

    if (this._levels !== next) {
      this._levels = next;
      this.invalidate();
    }
  }

  /** Tap cap for the blur, see {@link BlurFilterOptions.quality}. */
  public get quality(): number {
    return this._blur.quality;
  }

  public set quality(quality: number) {
    const previous = this._blur.quality;

    this._blur.quality = quality;

    if (this._blur.quality !== previous) {
      this.invalidate();
    }
  }

  /**
   * The blur's own truncated reach, plus what the halving chain spreads by
   * itself: each bilinear halving pulls light one texel further and the
   * upsample walks the same distance back, which lands inside `2^levels`
   * logical units at a resolution of one - the widest case, since a higher
   * resolution only makes those texels smaller.
   */
  public override getOutputBounds(input: ReadonlyRectangle, output: Rectangle): void {
    // Asked of the blur rather than recomputed here, so the two can never
    // disagree about how far a given strength reaches.
    this._blur.getOutputBounds(input, output);

    const chainReach = 2 ** this._levels;

    output.set(output.x - chainReach, output.y - chainReach, output.width + chainReach * 2, output.height + chainReach * 2);
  }

  public apply(backend: RenderBackend, input: RenderTexture, output: RenderTexture, resolution = 1): void {
    const levels = this._levels;
    const held = this._levelTextures;
    let blurred: RenderTexture | null = null;

    // Every intermediate is borrowed from the backend's pool rather than owned:
    // one filter may be attached to nodes of several sizes and to both backends
    // at once, and a glowing node would otherwise create and destroy a whole
    // chain of render textures per frame.
    try {
      let width = output.width;
      let height = output.height;

      for (let level = 0; level < levels; level++) {
        width = Math.max(1, width >> 1);
        height = Math.max(1, height >> 1);
        held[level] = backend.acquireRenderTexture(width, height);
      }

      // Extraction and the first halving are one draw: the fullscreen quad
      // resolves a half-size target through the bilinear sampler anyway, so a
      // separate full-resolution extraction target would only cost fill rate.
      this._extraction.apply(backend, input, held[0]!, resolution);

      for (let level = 1; level < levels; level++) {
        this._blit(backend, held[level - 1]!, held[level]!, BlendModes.Normal, Color.transparentBlack);
      }

      const smallest = held[levels - 1]!;

      blurred = backend.acquireRenderTexture(smallest.width, smallest.height);
      // `strength` is logical units of the FINAL image, while the level it runs
      // on carries `resolution / 2^levels` texels per logical unit. Handing the
      // blur the unscaled resolution would double the glow's width for every
      // level added, so `levels` could not be a cost knob.
      this._blur.apply(backend, smallest, blurred, resolution / 2 ** levels);

      let accumulated = blurred;

      for (let level = levels - 1; level > 0; level--) {
        this._blit(backend, accumulated, held[level - 1]!, BlendModes.Additive, null);
        accumulated = held[level - 1]!;
      }

      this._passSource = input;
      this._passBloom = accumulated;
      this._passTarget = output;
      backend.execute(this._compositePass.retarget(output, output.view, Color.transparentBlack));
    } finally {
      this._passSource = null;
      this._passBloom = null;
      this._passTarget = null;
      this._passChainInput = null;

      if (blurred !== null) {
        backend.releaseRenderTexture(blurred);
      }

      for (let level = levels - 1; level >= 0; level--) {
        // In-bounds: `level` < `levels` <= MAX_LEVELS, the array's own length.
        const texture = held[level]!;

        held[level] = null;

        if (texture !== null) {
          backend.releaseRenderTexture(texture);
        }
      }
    }
  }

  public override destroy(): void {
    super.destroy();
    this._extraction.destroy();
    this._blur.destroy();
    this._chainSprite.destroy();
    this._bloomSprite.destroy();
    this._sourceSprite.destroy();
  }

  private _writeExtraction(): void {
    const { uThreshold, uKnee, uIntensity } = this._extraction.uniforms;

    uThreshold.set(this._threshold);
    uKnee.set(this._threshold * KNEE_SOFTNESS);
    uIntensity.set(this._intensity);
  }

  /**
   * Draw `input` across the whole of `target`, which is what makes one chain
   * step a bilinear halving or doubling. A `clearColor` of `null` keeps what
   * the target already holds, so an additive step accumulates into it.
   */
  private _blit(backend: RenderBackend, input: RenderTexture, target: RenderTexture, blendMode: BlendModes, clearColor: Color | null): void {
    this._passChainInput = input;
    this._passTarget = target;
    this._chainBlendMode = blendMode;
    backend.execute(this._chainPass.retarget(target, target.view, clearColor));
  }

  private _drawChain(backend: RenderBackend): void {
    const target = this._passTarget!;

    drawDrawableDirect(this._stage(this._chainSprite, this._passChainInput!, target.width, target.height, this._chainBlendMode), backend);
  }

  private _drawComposite(backend: RenderBackend): void {
    const target = this._passTarget!;

    drawDrawableDirect(this._stage(this._sourceSprite, this._passSource!, target.width, target.height, BlendModes.Normal), backend);
    drawDrawableDirect(this._stage(this._bloomSprite, this._passBloom!, target.width, target.height, BlendModes.Additive), backend);
  }

  private _stage(sprite: Sprite, texture: RenderTexture, width: number, height: number, blendMode: BlendModes): Sprite {
    sprite.setTexture(texture).setBlendMode(blendMode).setTint(Color.white).setPosition(0, 0).setRotation(0).setScale(1, 1);
    sprite.width = width;
    sprite.height = height;

    return sprite;
  }
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** A whole number of halvings inside the range the chain is built for. */
const clampLevels = (levels: number | undefined): number => (levels === undefined ? 3 : Math.min(MAX_LEVELS, Math.max(1, Math.floor(levels))));
