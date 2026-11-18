import { Color } from '#core/Color';
import {
  SceneTransition,
  type SceneTransitionContext,
  type SceneTransitionEnvironment,
  type SceneTransitionRequirements,
  type SceneTransitionSession,
} from '#core/scene/SceneTransition';
import { type Seconds, seconds } from '#core/units';
import { Container } from '#rendering/Container';
import { Graphics } from '#rendering/primitives/Graphics';
import type { RenderingContext } from '#rendering/RenderingContext';
import type { RenderNode } from '#rendering/RenderNode';

/** The render tree owned by one loading transition session. */
export interface LoadingSceneTransitionOverlay {
  /** Return a fresh, detached node. The transition destroys it when this navigation ends. */
  readonly node: RenderNode;
  /** Update the tree just before it is drawn. Progress is undefined until the incoming scene's loader reports counts. */
  update?(delta: Seconds, rendering: RenderingContext, progress: SceneTransitionEnvironment['loadingProgress']): void;
}

/** Options for {@link LoadingSceneTransition}. */
export interface LoadingSceneTransitionOptions {
  /** Build the screen overlay once per navigation. The default displays a loading bar on a black screen. */
  readonly createOverlay?: (context: SceneTransitionContext) => LoadingSceneTransitionOverlay;
}

const rectangle = (color: Color): Graphics => {
  const node = new Graphics();
  node.fillColor = color;

  return node.drawRectangle(0, 0, 1, 1);
};

const defaultOverlay = (): LoadingSceneTransitionOverlay => {
  const background = rectangle(Color.black);
  const bar = rectangle(Color.white);

  return {
    node: new Container().addChild(background, bar),
    update(_delta, rendering, progress) {
      const { left, top, width, height } = rendering.screenView.getBounds();
      const length = Math.min(width / 2, 240);
      const fraction = progress === undefined || progress.total === 0 ? 0.2 : progress.loaded / progress.total;

      background.setPosition(left, top).setScale(width, height);
      bar.setPosition(left + (width - length) / 2, top + height / 2).setScale(length * fraction, 4);
    },
  };
};

/**
 * Covers the screen while the incoming scene prepares, then removes the
 * overlay as soon as the scene switch commits. There is no fixed delay.
 *
 * Reuse the transition across navigations. Each navigation owns its overlay
 * and frees it on completion, cancellation, or load failure.
 *
 * @example
 * ```ts
 * const transition = new LoadingSceneTransition({
 *   createOverlay: () => ({ node: new Container().addChild(makeLoadingLabel()) }),
 * });
 * await app.scenes.change(GameScene, { transition });
 * ```
 * @stable
 */
export class LoadingSceneTransition extends SceneTransition {
  private readonly _createOverlay: (context: SceneTransitionContext) => LoadingSceneTransitionOverlay;

  public constructor(options: LoadingSceneTransitionOptions = {}) {
    super();
    this._createOverlay = options.createOverlay ?? defaultOverlay;
  }

  public getRequirements(): SceneTransitionRequirements {
    return { outgoingFrame: 'none', currentFrame: 'direct' };
  }

  protected override createSession(environment: SceneTransitionEnvironment): SceneTransitionSession {
    const overlay = this._createOverlay(environment.context);
    const node = overlay.node;

    if (node.destroyed || node.parent !== null || node._getStage() !== null || node._componentAnchor() !== null) {
      throw new Error('LoadingSceneTransition: createOverlay must return a fresh, detached node.');
    }

    const root = new Container().addChild(node);
    let delta = seconds(0);

    return {
      placement: 'screen',
      get done() {
        return environment.committed;
      },
      update(value) {
        delta = value;
      },
      render(rendering) {
        overlay.update?.(delta, rendering, environment.loadingProgress);
        rendering.render(root, { view: rendering.screenView });

        if (!environment.commitRequested) {
          environment.commit();
        }
      },
      destroy() {
        root.destroy();
      },
    };
  }
}
