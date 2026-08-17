import { Color } from '#core/Color';
import type { ReadonlyRectangle, Rectangle } from '#math/Rectangle';
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
  /**
   * Taps per side of each sweep: a sweep takes `quality * 2 + 1` of them,
   * spread evenly across `[-radius, +radius]`. It buys smoothness, not reach.
   *
   * Because the taps always span the whole radius, their SPACING is
   * `radius / quality` — so a wide blur wants a higher quality or the kernel
   * shows as bands. Default `1`, which is three taps: cheap, and honest only
   * for small radii.
   */
  readonly quality?: number;
}

/**
 * Gaussian blur {@link Filter}, run as two separable passes.
 *
 * The input is swept along X into a scratch target, then that scratch is swept
 * along Y into the output, each sweep taking `quality * 2 + 1` taps spread over
 * ±`radius` logical units and weighted by a Gaussian. Because the two sweeps are
 * chained rather than summed, the effective 2D kernel is their product — a real
 * isotropic blur that reaches diagonally as well as along the axes.
 *
 * (Summing the two sweeps into one target instead, which is what this filter
 * used to do, produces a cross: a pixel diagonally off a corner is touched by
 * neither sweep and stays black at any radius.)
 *
 * Higher `quality` values add taps and smooth the result at the cost of extra
 * draw calls; they do not change how far the blur reaches.
 */
export class BlurFilter extends Filter {
  private readonly _sprite: Sprite = new Sprite(null);
  private readonly _sampleTint: Color = Color.white.clone();
  /** One redirect pass per axis, re-pointed per application — see {@link BackendTargetPass.retarget}. */
  private readonly _horizontalPass: BackendTargetPass = new BackendTargetPass(backend => this._drawSamples(backend, true));
  private readonly _verticalPass: BackendTargetPass = new BackendTargetPass(backend => this._drawSamples(backend, false));
  private _radius = 2;
  private _quality = 1;
  /**
   * Normalised Gaussian tap weights, one per tap, rebuilt only when `quality`
   * changes. They are independent of `radius`: a tap's weight is a function of
   * its position as a FRACTION of the radius (see {@link _rebuildWeights}), so
   * scaling the radius scales the offsets and leaves the weights alone.
   */
  private _weights: Float32Array;
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
    this._weights = new Float32Array(0);
    this._rebuildWeights();
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
    const next = Math.max(0, radius);

    if (this._radius !== next) {
      this._radius = next;
      this.invalidate();
    }
  }

  /** Taps per side of each sweep — see {@link BlurFilterOptions.quality}. */
  public get quality(): number {
    return this._quality;
  }

  public set quality(quality: number) {
    const next = Math.max(1, Math.floor(quality));

    if (this._quality !== next) {
      this._quality = next;
      this._rebuildWeights();
      this.invalidate();
    }
  }

  /**
   * Gaussian weights for the current tap count, normalised to sum to 1.
   *
   * Taps sit evenly across `[-radius, +radius]`, so tap `k` is at the fraction
   * `t ∈ [-1, 1]` of the radius. Choosing `σ = radius / 2` makes the weight
   * `exp(-t² / 2σ'²)` with `σ' = 1/2`, i.e. `exp(-2t²)` — a pure function of
   * `t`, which is why the radius never enters here. The outermost tap keeps
   * `e⁻² ≈ 0.135` of the centre's weight: far enough down to look Gaussian,
   * far enough up that the declared reach is actually used rather than being
   * a radius the kernel truncates away to nothing.
   */
  private _rebuildWeights(): void {
    const taps = this._quality * 2 + 1;

    if (this._weights.length !== taps) {
      this._weights = new Float32Array(taps);
    }

    let total = 0;

    for (let tap = 0; tap < taps; tap++) {
      const t = taps === 1 ? 0 : (tap / (taps - 1)) * 2 - 1;
      const weight = Math.exp(-2 * t * t);

      this._weights[tap] = weight;
      total += weight;
    }

    for (let tap = 0; tap < taps; tap++) {
      // In-bounds: tap < taps === this._weights.length.
      this._weights[tap] /= total;
    }
  }

  /**
   * The blur reaches `radius` logical units outside its input on every edge.
   *
   * Read off the sampling loop rather than assumed: each sweep draws its source
   * at offsets spread evenly over `[-radius, +radius]`, so the horizontal sweep
   * moves a value at most `radius` in x and the vertical one at most `radius`
   * in y. Chaining them means a value can travel `radius` in BOTH — the corner
   * of the box, which is exactly what this rectangle already declares.
   * `quality` adds taps between those extremes and does not change the reach.
   */
  public override getOutputBounds(input: ReadonlyRectangle, output: Rectangle): void {
    const radius = this._radius;

    output.set(input.x - radius, input.y - radius, input.width + radius * 2, input.height + radius * 2);
  }

  public apply(backend: RenderBackend, input: RenderTexture, output: RenderTexture, resolution = 1): void {
    this._passResolution = resolution;

    if (this._radius <= 0) {
      this._stage(input, output);
      backend.execute(this._verticalPass.retarget(output, output.view, Color.transparentBlack));

      return;
    }

    // The horizontal sweep needs somewhere to land that is not `output` — the
    // vertical sweep reads every texel of it, so the two cannot share a target.
    // Borrowed from the backend's pool rather than allocated: a blurred node
    // would otherwise create and destroy a full-size render texture per frame.
    const scratch = backend.acquireRenderTexture(output.width, output.height);

    try {
      this._stage(input, scratch);
      backend.execute(this._horizontalPass.retarget(scratch, scratch.view, Color.transparentBlack));

      this._stage(scratch, output);
      backend.execute(this._verticalPass.retarget(output, output.view, Color.transparentBlack));
    } finally {
      backend.releaseRenderTexture(scratch);
    }
  }

  /** Point the shared sprite at one sweep's source, sized to its target. */
  private _stage(source: RenderTexture, target: RenderTexture): void {
    this._sprite.setTexture(source).setBlendMode(BlendModes.Additive).setRotation(0).setScale(1, 1);
    this._sprite.width = target.width;
    this._sprite.height = target.height;
  }

  /**
   * One sweep's body. A method rather than an inline closure so the sample loop
   * reads its parameters off the instance instead of capturing them — the
   * closure would otherwise be rebuilt for every filtered node, every frame.
   */
  private _drawSamples(backend: RenderBackend, horizontal: boolean): void {
    // `radius` is logical; the target is `resolution` texels per logical unit,
    // so the offsets have to scale with it. Without this the blur would shrink
    // to 1/resolution of its authored width the moment targets started
    // inheriting the surface resolution.
    const radius = this._radius * this._passResolution;

    if (radius <= 0) {
      this._sampleTint.set(255, 255, 255, 1);
      drawDrawableDirect(this._sprite.setTint(this._sampleTint).setPosition(0, 0), backend);

      return;
    }

    const taps = this._weights.length;

    for (let tap = 0; tap < taps; tap++) {
      const t = taps === 1 ? 0 : (tap / (taps - 1)) * 2 - 1;
      const offset = t * radius;

      // Additive blending scales each draw by the sprite's tint alpha, so the
      // tap weight rides in as alpha and the sweep sums to a weighted average.
      // `setTint` copies, so the shared colour can be rewritten per tap.
      this._sampleTint.set(255, 255, 255, this._weights[tap]);
      this._sprite.setTint(this._sampleTint);

      drawDrawableDirect(this._sprite.setPosition(horizontal ? offset : 0, horizontal ? 0 : offset), backend);
    }
  }

  public override destroy(): void {
    super.destroy();
    this._sampleTint.destroy();
    this._sprite.destroy();
  }
}
