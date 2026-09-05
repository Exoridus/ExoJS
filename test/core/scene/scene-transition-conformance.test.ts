/**
 * Runs every stock transition through the shared scene-transition lifecycle
 * conformance suite, so the contract third-party transitions are held to is
 * the same one the engine's own transitions are proven against.
 */
import { Color } from '#core/Color';
import { PhasedSceneTransition, type SceneTransitionPhaseContext, type SceneTransitionPhaseRequirements } from '#core/scene/PhasedSceneTransition';
import { CrossFadeSceneTransition } from '#core/scene/transitions/CrossFadeSceneTransition';
import { FadeSceneTransition } from '#core/scene/transitions/FadeSceneTransition';
import { SlideSceneTransition } from '#core/scene/transitions/SlideSceneTransition';
import { Time } from '#core/units';
import { Matrix } from '#math/Matrix';
import { QuadGeometry } from '#rendering/geometry/QuadGeometry';

import { describeSceneTransitionConformance } from '../../support/scene-transition-conformance';

/** Per-session scratch state for {@link MinimalPhasedSceneTransition}. */
interface BarWipeState {
  readonly quad: QuadGeometry;
  readonly transform: Matrix;
  readonly tint: Color;
}

/**
 * The smallest useful `PhasedSceneTransition` subclass - the shape the guide
 * teaches. Covers the authoring extension point itself rather than any one
 * stock transition's effect.
 */
class MinimalPhasedSceneTransition extends PhasedSceneTransition<BarWipeState> {
  public liveStates = 0;

  protected override getPhaseRequirements(): SceneTransitionPhaseRequirements {
    return { outgoingFrame: 'none', currentFrame: 'direct' };
  }

  protected override createPhaseState(): BarWipeState {
    this.liveStates++;

    return { quad: new QuadGeometry(), transform: new Matrix(), tint: new Color(0, 0, 0, 1) };
  }

  protected override destroyPhaseState(state: BarWipeState): void {
    this.liveStates--;
    state.quad.destroy();
  }

  protected override enter(context: SceneTransitionPhaseContext, state: BarWipeState): void {
    this._drawBar(context, state);
  }

  protected override exit(context: SceneTransitionPhaseContext, state: BarWipeState): void {
    this._drawBar(context, state);
  }

  private _drawBar(context: SceneTransitionPhaseContext, state: BarWipeState): void {
    const bounds = context.rendering.screenView.getBounds();
    const height = (bounds.bottom - bounds.top) * (1 - context.presence);

    state.transform.set(bounds.right - bounds.left, 0, bounds.left, 0, height, bounds.top);
    context.rendering.drawGeometry(state.quad, state.transform, { tint: state.tint });
  }
}

const fastDuration = Time.seconds(0.05);

describeSceneTransitionConformance('FadeSceneTransition', () => new FadeSceneTransition({ duration: fastDuration }));
describeSceneTransitionConformance('CrossFadeSceneTransition', () => new CrossFadeSceneTransition({ duration: fastDuration }));
describeSceneTransitionConformance('SlideSceneTransition (push)', () => new SlideSceneTransition({ duration: fastDuration, mode: 'push' }));
describeSceneTransitionConformance('SlideSceneTransition (cover)', () => new SlideSceneTransition({ duration: fastDuration, mode: 'cover' }));
describeSceneTransitionConformance('SlideSceneTransition (reveal)', () => new SlideSceneTransition({ duration: fastDuration, mode: 'reveal' }));
// A session allocates one phase state per side, so a definition whose sessions
// have all ended is back at zero - once, not twice.
let phased: MinimalPhasedSceneTransition;

describeSceneTransitionConformance(
  'PhasedSceneTransition subclass',
  () => {
    phased = new MinimalPhasedSceneTransition({ duration: fastDuration });

    return phased;
  },
  { expectReleased: () => expect(phased.liveStates, 'every phase state must be torn down exactly once').toBe(0) },
);
