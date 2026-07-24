import {
  PhasedSceneTransition,
  type PhasedSceneTransitionOptions,
  type SceneTransitionPhaseContext,
  type SceneTransitionPhaseRequirements,
} from '#core/PhasedSceneTransition';
import type { SceneTransitionContext } from '#core/SceneTransition';
import { Sprite } from '#rendering/sprite/Sprite';

export type SlideDirection = 'left' | 'right' | 'up' | 'down';
export type SlideMode = 'push' | 'cover' | 'reveal';

export interface SlideSceneTransitionOptions extends PhasedSceneTransitionOptions {
  /** The edge the outgoing content exits toward. Default `'right'`. */
  readonly direction?: SlideDirection;
  /** Default `'push'`. See {@link SlideSceneTransition} for the three modes' visual shape. */
  readonly mode?: SlideMode;
}

const directionAxis: Record<SlideDirection, 'x' | 'y'> = {
  left: 'x',
  right: 'x',
  up: 'y',
  down: 'y',
};

const directionSign: Record<SlideDirection, 1 | -1> = {
  left: -1,
  right: 1,
  up: -1,
  down: 1,
};

const oppositeDirection: Record<SlideDirection, SlideDirection> = {
  left: 'right',
  right: 'left',
  up: 'down',
  down: 'up',
};

/**
 * Directional slide transition — covers menu/inventory/page-style navigation
 * (definition spec §8). Three modes:
 * - `'push'` (default): the outgoing scene exits toward `direction` while the
 *   incoming scene enters from the opposite edge. Phase-split at the commit
 *   boundary (not a full `SceneTransition`), so there is a brief single-frame
 *   gap at the exact commit instant where neither scene is on-screen.
 * - `'reveal'`: only the outgoing scene animates, sliding away toward
 *   `direction` to reveal the (already-committed) incoming scene underneath.
 * - `'cover'`: only the incoming scene animates, sliding in from the opposite
 *   edge over a frozen snapshot of the (already-gone) outgoing scene.
 * @stable
 */
export class SlideSceneTransition extends PhasedSceneTransition {
  public readonly direction: SlideDirection;
  public readonly mode: SlideMode;

  /**
   * Reusable sprite for the animated "current" surface (the live outgoing
   * texture during `exit()`, the live incoming texture during `enter()`) —
   * mutated per draw, never reallocated.
   */
  private readonly _currentSprite = new Sprite(null);
  /**
   * Reusable sprite for `mode: 'cover'`'s frozen outgoing snapshot, held
   * separately from {@link _currentSprite} because `cover`'s `enter()` draws
   * both in the same frame — reusing one instance for both would have the
   * second draw overwrite the first before it renders.
   */
  private readonly _snapshotSprite = new Sprite(null);

  public constructor(options: SlideSceneTransitionOptions = {}) {
    super(options);
    this.direction = options.direction ?? 'right';
    this.mode = options.mode ?? 'push';
  }

  protected override getPhaseRequirements(phase: 'enter' | 'exit', _context: SceneTransitionContext): SceneTransitionPhaseRequirements {
    if (this.mode === 'push') {
      return { outgoingFrame: 'none', currentFrame: 'texture' };
    }

    if (this.mode === 'reveal') {
      return phase === 'exit' ? { outgoingFrame: 'none', currentFrame: 'texture' } : { outgoingFrame: 'none', currentFrame: 'direct' };
    }

    // mode === 'cover'
    return phase === 'exit' ? { outgoingFrame: 'none', currentFrame: 'direct' } : { outgoingFrame: 'snapshot', currentFrame: 'texture' };
  }

  protected override exit(context: SceneTransitionPhaseContext): void {
    if (this.mode === 'cover') {
      return; // static — the outgoing scene stays put, untouched, until commit
    }

    // 'push' and 'reveal': the outgoing texture slides toward `direction`,
    // fully off-screen once presence reaches 0.
    if (context.frame.current === null) {
      return;
    }

    this._drawSliding(context, this._currentSprite, context.frame.current, this.direction);
  }

  protected override enter(context: SceneTransitionPhaseContext): void {
    if (this.mode === 'reveal') {
      return; // nothing left to animate — the reveal already happened during exit
    }

    if (this.mode === 'cover' && context.frame.outgoing !== null) {
      this._snapshotSprite.texture = context.frame.outgoing;
      this._snapshotSprite.x = 0;
      this._snapshotSprite.y = 0;
      this._snapshotSprite.tint.a = 1;
      context.rendering.render(this._snapshotSprite, { view: context.rendering.screenView });
    }

    if (context.frame.current === null) {
      return;
    }

    // The incoming scene always enters from `direction`'s OPPOSITE edge —
    // `direction` names the edge the outgoing content exits toward (or, for
    // `'cover'`, the edge it conceptually would have exited toward), so the
    // incoming content comes from the other side in every animated mode.
    const entryDirection = oppositeDirection[this.direction];

    this._drawSliding(context, this._currentSprite, context.frame.current, entryDirection);
  }

  /** Draw `texture` via `sprite`, offset along `direction`'s axis by `distance * (1 - presence) * sign`. */
  private _drawSliding(context: SceneTransitionPhaseContext, sprite: Sprite, texture: NonNullable<SceneTransitionPhaseContext['frame']['current']>, direction: SlideDirection): void {
    const { width, height } = this._screenSize(context);
    const distance = directionAxis[direction] === 'x' ? width : height;
    const offset = distance * (1 - context.presence) * directionSign[direction];

    sprite.texture = texture;
    sprite.x = directionAxis[direction] === 'x' ? offset : 0;
    sprite.y = directionAxis[direction] === 'x' ? 0 : offset;
    sprite.tint.a = 1;

    context.rendering.render(sprite, { view: context.rendering.screenView });
  }

  private _screenSize(context: SceneTransitionPhaseContext): { width: number; height: number } {
    const bounds = context.rendering.screenView.getBounds();

    return { width: bounds.right - bounds.left, height: bounds.bottom - bounds.top };
  }
}
