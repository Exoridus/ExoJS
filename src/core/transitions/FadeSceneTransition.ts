import { Color } from '#core/Color';
import {
  PhasedSceneTransition,
  type PhasedSceneTransitionOptions,
  type SceneTransitionPhaseContext,
  type SceneTransitionPhaseRequirements,
} from '#core/PhasedSceneTransition';
import { Matrix } from '#math/Matrix';
import { QuadGeometry } from '#rendering/geometry/QuadGeometry';

/**
 * Fade to a color, switch scenes, fade back in. `placement: 'screen'`,
 * `currentFrame: 'direct'`, `outgoingFrame: 'none'` — the live surface
 * renders straight to the screen with no extra texture pass; `render()`
 * only draws the overlay on top. The universal default transition
 * (definition spec §8).
 * @stable
 */
export class FadeSceneTransition extends PhasedSceneTransition {
  /** The color faded to. Default {@link Color.black}. */
  public readonly color: Color;

  /** Reusable unit quad — scaled/translated to the screen bounds every draw, never reallocated. */
  private readonly _quad = new QuadGeometry();
  /** Reusable world matrix mutated per draw instead of allocated per frame. */
  private readonly _transform = new Matrix();
  /** Reusable tint mutated per draw — {@link color}'s RGB plus this frame's alpha. */
  private readonly _tint = new Color();

  public constructor(color: Color = Color.black, options: PhasedSceneTransitionOptions = {}) {
    super(options);
    this.color = color;
  }

  protected override getPhaseRequirements(): SceneTransitionPhaseRequirements {
    return { outgoingFrame: 'none', currentFrame: 'direct' };
  }

  protected override enter(context: SceneTransitionPhaseContext): void {
    this._draw(context);
  }

  protected override exit(context: SceneTransitionPhaseContext): void {
    this._draw(context);
  }

  /** Draw a full-screen quad tinted with {@link color} at `alpha = 1 - presence` — shared by both `enter()` and `exit()`, which are symmetric. */
  private _draw(context: SceneTransitionPhaseContext): void {
    const bounds = context.rendering.screenView.getBounds();
    const width = bounds.right - bounds.left;
    const height = bounds.bottom - bounds.top;

    this._transform.set(width, 0, bounds.left, 0, height, bounds.top);
    this._tint.copy(this.color);
    this._tint.a = 1 - context.presence;

    context.rendering.drawGeometry(this._quad, this._transform, { tint: this._tint });
  }
}
