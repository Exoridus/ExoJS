import { Color } from '#core/Color';
import {
  PhasedSceneTransition,
  type PhasedSceneTransitionOptions,
  type SceneTransitionPhaseContext,
  type SceneTransitionPhaseRequirements,
} from '#core/PhasedSceneTransition';
import { Matrix } from '#math/Matrix';
import { QuadGeometry } from '#rendering/geometry/QuadGeometry';

/** Per-session scratch state for {@link FadeSceneTransition} — never shared with the (immutable, reusable-across-navigations) definition instance. */
interface FadePhaseState {
  readonly quad: QuadGeometry;
  readonly transform: Matrix;
  readonly tint: Color;
}

/**
 * Fade to a color, switch scenes, fade back in. `placement: 'screen'`,
 * `currentFrame: 'direct'`, `outgoingFrame: 'none'` — the live surface
 * renders straight to the screen with no extra texture pass; `render()`
 * only draws the overlay on top. The universal default transition
 * (definition spec §8).
 * @stable
 */
export class FadeSceneTransition extends PhasedSceneTransition<FadePhaseState> {
  /** The color faded to. Default {@link Color.black}. */
  public readonly color: Color;

  public constructor(color: Color = Color.black, options: PhasedSceneTransitionOptions = {}) {
    super(options);
    this.color = color;
  }

  protected override getPhaseRequirements(): SceneTransitionPhaseRequirements {
    return { outgoingFrame: 'none', currentFrame: 'direct' };
  }

  protected override createPhaseState(): FadePhaseState {
    return { quad: new QuadGeometry(), transform: new Matrix(), tint: new Color() };
  }

  protected override enter(context: SceneTransitionPhaseContext, state: FadePhaseState): void {
    this._draw(context, state);
  }

  protected override exit(context: SceneTransitionPhaseContext, state: FadePhaseState): void {
    this._draw(context, state);
  }

  /** Draw a full-screen quad tinted with {@link color} at `alpha = 1 - presence` — shared by both `enter()` and `exit()`, which are symmetric. */
  private _draw(context: SceneTransitionPhaseContext, state: FadePhaseState): void {
    const bounds = context.rendering.screenView.getBounds();
    const width = bounds.right - bounds.left;
    const height = bounds.bottom - bounds.top;

    state.transform.set(width, 0, bounds.left, 0, height, bounds.top);
    state.tint.copy(this.color);
    state.tint.a = 1 - context.presence;

    context.rendering.drawGeometry(state.quad, state.transform, { tint: state.tint });
  }
}
