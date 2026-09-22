import { Color } from '#core/Color';
import type { Filter } from '#rendering/filters/Filter';
import { drawDrawableDirect } from '#rendering/plan/drawDrawableDirect';
import { Sprite } from '#rendering/sprite/Sprite';
import type { RenderTexture } from '#rendering/texture/RenderTexture';
import { BlendModes } from '#rendering/types';

import { BackendTargetPass } from './BackendTargetPass';
import type { RenderBackend } from './RenderBackend';
import type { RenderingContext } from './RenderingContext';
import { RenderPass, type RenderPassOptions } from './RenderPass';

/** Options for {@link FilterPass}. @advanced */
export interface FilterPassOptions extends RenderPassOptions {
  /**
   * Off-screen destination. `null` or omitted writes the active target (the
   * canvas unless a parent redirected it). Caller-owned and stable across
   * frames; never allocated, pooled, resized or destroyed by the pass. May be
   * the source texture, in which case the chain runs through borrowed
   * intermediates and the result is blitted back.
   */
  readonly target?: RenderTexture | null;
  /**
   * Device pixels per logical unit of the textures this pass runs on, passed to
   * every filter.
   *
   * Filters express their parameters in logical units, so a chain on targets
   * allocated at twice the logical size needs `2` here or every effect comes out
   * half as wide. The default is `1` because the textures are the caller's and
   * nothing about them states a density - the same reason
   * {@link Filter.apply} documents `1` as the honest answer for a hand-rolled
   * chain.
   */
  readonly resolution?: number;
}

/**
 * Runs a {@link Filter} or a chain of them from a source texture into a
 * destination, as one pass inside a {@link RenderPipeline}.
 *
 * ```ts
 * pipeline
 *   .addPass(new RenderNodePass(world, { target: sceneRt, clear: Color.black }))
 *   .addPass(new FilterPass(sceneRt, [bloom, grade]));
 * ```
 *
 * Intermediates between chain stages are borrowed from the backend's
 * render-texture pool for the length of one execute and returned on every path,
 * including when a filter throws. They are sized to the DESTINATION, so a chain
 * neither grows nor shrinks the image: an effect that reaches outside its input
 * (a blur, a glow) is clipped at the destination's edge, which is what a
 * full-frame post-process wants and the one thing a filter at a node does
 * differently - there the capture domain grows to the effect's declared reach,
 * because a node has room around it and a frame does not.
 *
 * An empty chain is a blit, which is the useful degenerate case: it is how a
 * pipeline shows an off-screen target on the canvas.
 *
 * The filters are caller-owned - a filter may be shared with a node or another
 * pass - so {@link destroy} releases only what this pass allocated.
 * @advanced
 */
export class FilterPass extends RenderPass {
  private readonly _source: RenderTexture;
  private readonly _filters: readonly Filter[];
  private readonly _target: RenderTexture | null;
  private readonly _resolution: number;
  /** Staged by {@link execute} for the blit body, which takes no parameters. */
  private _blitInput: RenderTexture | null = null;
  private _blitWidth = 0;
  private _blitHeight = 0;
  private _blitSprite: Sprite | null = null;
  private _blitPass: BackendTargetPass | null = null;

  public constructor(source: RenderTexture, filters: Filter | readonly Filter[] = [], options?: FilterPassOptions) {
    super(options);

    this._source = source;
    this._filters = Array.isArray(filters) ? [...(filters as readonly Filter[])] : [filters as Filter];
    this._target = options?.target ?? null;
    this._resolution = options?.resolution ?? 1;
  }

  /** The chain this pass runs, in order. */
  public get filters(): readonly Filter[] {
    return this._filters;
  }

  public override execute(context: RenderingContext): void {
    const { backend } = context;
    const destination = this._target;
    const width = destination?.width ?? backend.renderTarget.width;
    const height = destination?.height ?? backend.renderTarget.height;

    if (width <= 0 || height <= 0) {
      return;
    }

    let input: RenderTexture = this._source;
    let scratchA: RenderTexture | null = null;
    let scratchB: RenderTexture | null = null;

    try {
      for (let index = 0; index < this._filters.length; index++) {
        const isLast = index === this._filters.length - 1;
        let output: RenderTexture;

        // The last stage writes the destination directly when it can. It cannot
        // when the destination is the source (reading and writing one attachment
        // in a single draw is undefined) or when there is no destination texture
        // at all, and then the result is blitted below.
        if (isLast && destination !== null && destination !== input) {
          output = destination;
        } else {
          // Never the texture being read this stage, so the two alternate.
          if (scratchA === null) {
            scratchA = backend.acquireRenderTexture(width, height);
          }

          if (scratchA !== input) {
            output = scratchA;
          } else {
            scratchB ??= backend.acquireRenderTexture(width, height);
            output = scratchB;
          }
        }

        // In-bounds: `index` < `this._filters.length`.
        this._filters[index]!.apply(backend, input, output, this._resolution);
        input = output;
      }

      if (input !== destination) {
        this._blit(backend, input, destination, width, height);
      }
    } finally {
      if (scratchA !== null) {
        backend.releaseRenderTexture(scratchA);
      }

      if (scratchB !== null) {
        backend.releaseRenderTexture(scratchB);
      }

      this._blitInput = null;
    }
  }

  public override destroy(): void {
    super.destroy();
    this._blitSprite?.destroy();
    this._blitSprite = null;
    this._blitPass = null;
    this._blitInput = null;
  }

  /**
   * Draw `input` across the whole destination. Built on first use rather than in
   * the constructor: a chain that ends on a caller target never blits, and a
   * pass that never blits should not hold a sprite.
   */
  private _blit(backend: RenderBackend, input: RenderTexture, destination: RenderTexture | null, width: number, height: number): void {
    this._blitSprite ??= new Sprite(null);
    this._blitInput = input;
    this._blitWidth = width;
    this._blitHeight = height;

    if (destination === null) {
      this._drawBlit(backend);

      return;
    }

    this._blitPass ??= new BackendTargetPass(target => this._drawBlit(target));
    backend.execute(this._blitPass.retarget(destination, destination.view, Color.transparentBlack));
  }

  private _drawBlit(backend: RenderBackend): void {
    const sprite = this._blitSprite!;

    sprite.setTexture(this._blitInput).setBlendMode(BlendModes.Normal).setTint(Color.white).setPosition(0, 0).setRotation(0).setScale(1, 1);
    sprite.width = this._blitWidth;
    sprite.height = this._blitHeight;

    drawDrawableDirect(sprite, backend);
  }
}
