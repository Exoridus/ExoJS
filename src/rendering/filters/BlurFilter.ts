import { Color } from '#core/Color';
import { BackendTargetPass } from '#rendering/BackendTargetPass';
import { drawDrawableDirect } from '#rendering/plan/drawDrawableDirect';
import type { RenderBackend } from '#rendering/RenderBackend';
import { Sprite } from '#rendering/sprite/Sprite';
import type { RenderTexture } from '#rendering/texture/RenderTexture';
import { BlendModes } from '#rendering/types';

import { Filter } from './Filter';

/** Construction-time options for a {@link BlurFilter}. */
export interface BlurFilterOptions {
  /** Blur extent in LOGICAL units — unchanged by the display's pixel ratio. */
  readonly radius?: number;
  readonly quality?: number;
}

/**
 * Box-blur {@link Filter} implemented as multiple additive sprite passes.
 *
 * The blur is approximated by rendering the input texture `quality * 2 + 1`
 * times offset symmetrically along each axis by up to ±`radius` logical units and
 * blending them additively. Higher `quality` values add more samples and
 * produce a smoother result at the cost of additional draw calls.
 */
export class BlurFilter extends Filter {
  private readonly _sprite: Sprite = new Sprite(null);
  private readonly _sampleTint: Color = Color.white.clone();
  /** One redirect pass, re-pointed per application — see {@link BackendTargetPass.retarget}. */
  private readonly _pass: BackendTargetPass = new BackendTargetPass(backend => this._drawSamples(backend));
  private _radius = 2;
  private _quality = 1;
  /**
   * Target resolution of the pass currently running, staged by {@link apply} so
   * the sample loop can convert {@link radius} from logical units to texels
   * without the pass body taking a parameter it would have to capture.
   */
  private _passResolution = 1;

  public constructor(options: BlurFilterOptions = {}) {
    super();

    this._radius = Math.max(0, options.radius ?? 2);
    this._quality = Math.max(1, Math.floor(options.quality ?? 1));
  }

  /**
   * Blur extent in LOGICAL units.
   *
   * Independent of the display: the filter scales it into target texels itself,
   * so a radius of 8 covers the same on-screen distance at every
   * {@link Filter.resolution} and every device pixel ratio.
   */
  public get radius(): number {
    return this._radius;
  }

  public set radius(radius: number) {
    this._radius = Math.max(0, radius);
  }

  public get quality(): number {
    return this._quality;
  }

  public set quality(quality: number) {
    this._quality = Math.max(1, Math.floor(quality));
  }

  public apply(backend: RenderBackend, input: RenderTexture, output: RenderTexture, resolution = 1): void {
    this._passResolution = resolution;

    const steps = Math.max(1, this._quality * 2 + 1);
    const sampleCount = this._radius <= 0 ? 1 : steps * 2;
    const alpha = 1 / sampleCount;

    this._sampleTint.set(255, 255, 255, alpha);
    this._sprite.setTexture(input).setBlendMode(BlendModes.Additive).setTint(this._sampleTint).setRotation(0).setScale(1, 1);
    this._sprite.width = output.width;
    this._sprite.height = output.height;

    backend.execute(this._pass.retarget(output, output.view, Color.transparentBlack));
  }

  /**
   * The pass body. A method rather than an inline closure so the sample loop
   * reads its parameters off the instance instead of capturing them — the
   * closure would otherwise be rebuilt for every filtered node, every frame.
   */
  private _drawSamples(backend: RenderBackend): void {
    // `radius` is logical; the target is `resolution` texels per logical unit,
    // so the offsets have to scale with it. Without this the blur would shrink
    // to 1/resolution of its authored width the moment targets started
    // inheriting the surface resolution.
    const radius = this._radius * this._passResolution;

    if (radius <= 0) {
      drawDrawableDirect(this._sprite.setPosition(0, 0), backend);

      return;
    }

    const steps = Math.max(1, this._quality * 2 + 1);

    for (let step = 0; step < steps; step++) {
      const t = steps === 1 ? 0 : step / (steps - 1);
      const offset = (t * 2 - 1) * radius;

      drawDrawableDirect(this._sprite.setPosition(offset, 0), backend);
      drawDrawableDirect(this._sprite.setPosition(0, offset), backend);
    }
  }

  public override destroy(): void {
    this._sampleTint.destroy();
    this._sprite.destroy();
  }
}
