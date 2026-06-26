import { Mesh } from '#rendering/mesh/Mesh';
import type { RenderBackend } from '#rendering/RenderBackend';

import type { Application } from './Application';
import { Color } from './Color';
import { Scene } from './Scene';
import { Signal } from './Signal';
import type { Time } from './Time';

/**
 * Fade-to-color scene transition. The screen fades to `color` (default black)
 * over `duration` ms (default 220), the scene change happens at full
 * opacity, then the screen fades back in.
 */
export interface FadeSceneTransition {
  type: 'fade';
  duration?: number;
  color?: Color;
}

/** Discriminated union of supported {@link SceneManager} transitions. */
export type SceneTransition = FadeSceneTransition;

/** Options passed to {@link SceneManager.setScene}. */
export interface SetSceneOptions {
  transition?: SceneTransition;
}

interface ActiveFadeTransition {
  readonly type: 'fade';
  readonly durationMs: number;
  readonly action: () => Promise<void>;
  readonly resolve: () => void;
  readonly reject: (error: unknown) => void;
  readonly color: Color;
  elapsedMs: number;
  phase: 'out' | 'switching' | 'in';
}

class TransitionOverlayMesh extends Mesh {
  public override render(backend: RenderBackend): this {
    if (this.visible) {
      backend.draw(this);
    }

    return this;
  }
}

const createOverlayMesh = (): TransitionOverlayMesh =>
  new TransitionOverlayMesh({
    // 4 vertices (TL, TR, BL, BR) with 2 indexed triangles forming a screen quad.
    vertices: new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]),
    indices: new Uint16Array([0, 1, 2, 1, 3, 2]),
  });

const defaultFadeTransitionDuration = 220;

/**
 * Single-active-scene controller owned by {@link Application}. Holds at most one
 * active {@link Scene} (the current "screen"); {@link SceneManager.setScene}
 * switches to a new scene — unloading the previous one — with an optional fade
 * transition.
 *
 * There is no scene stack: overlays, HUDs and pause menus belong on
 * {@link Scene.ui} (the screen-fixed UI layer), and "freeze the game but keep
 * drawing it" is `scene.paused = true` (skips the scene's `update` + systems
 * while it keeps rendering).
 */
export class SceneManager {
  private readonly _app: Application;
  private _activeScene: Scene | null = null;
  private readonly _transitionOverlay: TransitionOverlayMesh = createOverlayMesh();
  private _transition: ActiveFadeTransition | null = null;

  /** Fires whenever the active scene changes (set or clear). Payload is the new scene, or `null` when cleared. */
  public readonly onChangeScene = new Signal<[Scene | null]>();
  /** Fires after a scene's `init` resolves and it becomes active. */
  public readonly onStartScene = new Signal<[Scene]>();
  /** Fires once per frame for the active scene after its `update` ran. */
  public readonly onUpdateScene = new Signal<[Scene]>();
  /** Fires just before a scene is unloaded (`unload` then `destroy`). */
  public readonly onStopScene = new Signal<[Scene]>();

  private readonly _asyncUpdateWarned = new WeakSet<Scene>();
  private readonly _asyncDrawWarned = new WeakSet<Scene>();

  public constructor(app: Application) {
    this._app = app;
  }

  /** The active scene, or `null` when none is set. */
  public get currentScene(): Scene | null {
    return this._activeScene;
  }

  public set currentScene(scene: Scene | null) {
    void this.setScene(scene);
  }

  /**
   * Switch to `scene` (or clear to `null`), unloading the previously active
   * scene. No-op when `scene` is already active. An optional fade transition
   * runs the swap at full opacity. The new scene is loaded before the old one
   * is torn down, so there is no blank frame between them.
   */
  public async setScene(scene: Scene | null, options: SetSceneOptions = {}): Promise<this> {
    await this._runWithTransition(async () => {
      if (scene === this._activeScene) {
        return;
      }

      if (scene !== null) {
        await this._prepareScene(scene);
      }

      const previous = this._activeScene;

      this._activeScene = scene;

      if (previous !== null) {
        await this._disposeScene(previous);
      }

      this.onChangeScene.dispatch(scene);

      if (scene !== null) {
        this.onStartScene.dispatch(scene);
      }
    }, options.transition);

    return this;
  }

  /**
   * Per-frame entry point called by {@link Application.update}. Advances any
   * active fade transition, then — for the active scene — runs `update` and
   * ticks its systems (unless {@link Scene.paused}), draws it, and renders its
   * UI layer on top.
   */
  public update(delta: Time): this {
    this._advanceTransition(delta.milliseconds);

    const scene = this._activeScene;

    if (scene !== null) {
      if (!scene.paused) {
        // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
        const updateResult = scene.update(delta);

        if (!this._asyncUpdateWarned.has(scene) && (updateResult as unknown) instanceof Promise) {
          this._asyncUpdateWarned.add(scene);
          console.warn(
            `[ExoJS] Scene.update() returned a Promise. update() must be synchronous — async logic here breaks frame timing and silently drops errors. Move async work into load() or init() instead.`,
          );
        }

        // Tick the scene's systems (e.g. a physics world) after its update().
        scene._tickSystems(delta);
      }

      // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
      const drawResult = scene.draw(this._app.rendering);

      if (!this._asyncDrawWarned.has(scene) && (drawResult as unknown) instanceof Promise) {
        this._asyncDrawWarned.add(scene);
        console.warn(
          `[ExoJS] Scene.draw() returned a Promise. draw() must be synchronous — an async draw() produces incomplete frames and silently drops errors.`,
        );
      }

      // Auto-render the scene's screen-fixed UI layer above its content.
      scene._peekUI()?._render(this._app.rendering);
    }

    const transitionAlpha = this._getTransitionAlpha();

    if (transitionAlpha > 0) {
      this._renderTransitionOverlay(transitionAlpha);
    }

    if (scene !== null) {
      this.onUpdateScene.dispatch(scene);
    }

    return this;
  }

  public destroy(): void {
    if (this._transition) {
      const transition = this._transition;

      this._transition = null;
      transition.color.destroy();
      transition.reject(new Error('SceneManager was destroyed while a transition was active.'));
    }

    void this._unloadActiveSceneOnDestroy();

    this._transitionOverlay.destroy();
    this.onChangeScene.destroy();
    this.onStartScene.destroy();
    this.onUpdateScene.destroy();
    this.onStopScene.destroy();
  }

  private async _prepareScene(scene: Scene): Promise<void> {
    scene.app = this._app;

    try {
      await scene.load(this._app.loader);
      await scene.init(this._app.loader);

      if (scene.root.children.length > 0 && scene.draw === Scene.prototype.draw) {
        console.warn(
          `[ExoJS] Scene.root has ${scene.root.children.length} child(ren) after init() but draw() is not overridden. Scene.root is not auto-rendered — call context.render(this.root) inside draw().`,
        );
      }

      // Bind the scene's root to the app's interaction manager so its nodes
      // route picking/bounds notifications to this Application (no global).
      this._app.interaction.attachRoot(scene.root);

      // Bind the UI layer too, if it was materialized before activation.
      const ui = scene._peekUI();

      if (ui !== null) {
        this._app.interaction.attachUIRoot(ui);
      }

      scene.onLoad.dispatch();
    } catch (error) {
      let cleanupError: unknown = null;

      try {
        await scene.unload(this._app.loader);
      } catch (unloadError) {
        cleanupError = unloadError;
      }

      scene.destroy();
      scene.app = null;

      if (cleanupError) {
        const initMessage = error instanceof Error ? error.message : String(error);
        let cleanupMessage = 'unknown cleanup error';
        if (cleanupError instanceof Error) {
          cleanupMessage = cleanupError.message;
        } else if (typeof cleanupError === 'string') {
          cleanupMessage = cleanupError;
        }

        throw new Error(`Failed to initialize scene: ${initMessage}. Cleanup also failed: ${cleanupMessage}.`, {
          cause: error,
        });
      }

      throw error;
    }
  }

  private async _disposeScene(scene: Scene): Promise<void> {
    scene.onUnload.dispatch();
    this.onStopScene.dispatch(scene);
    await scene.unload(this._app.loader);

    const ui = scene._peekUI();

    if (ui !== null) {
      this._app.interaction.detachUIRoot(ui);
    }

    this._app.interaction.detachRoot(scene.root);
    scene.destroy();
    scene.app = null;
  }

  private async _unloadActiveSceneOnDestroy(): Promise<void> {
    const scene = this._activeScene;

    if (scene === null) {
      return;
    }

    this._activeScene = null;

    try {
      await this._disposeScene(scene);
    } catch (error) {
      console.error('SceneManager.destroy() failed to unload the active scene.', error);
    }
  }

  private async _runWithTransition(action: () => Promise<void>, transition?: SceneTransition): Promise<void> {
    if (transition?.type !== 'fade') {
      await action();

      return;
    }

    if (this._transition) {
      throw new Error('Scene transition is already in progress.');
    }

    const durationMs = Math.max(0, transition.duration ?? defaultFadeTransitionDuration);

    if (durationMs === 0) {
      await action();

      return;
    }

    await new Promise<void>((resolve, reject) => {
      this._transition = {
        type: 'fade',
        durationMs,
        action,
        resolve,
        reject,
        color: (transition.color ?? Color.black).clone(),
        elapsedMs: 0,
        phase: 'out',
      };
    });
  }

  private _advanceTransition(deltaMs: number): void {
    if (!this._transition) {
      return;
    }

    if (this._transition.phase === 'out') {
      this._transition.elapsedMs = Math.min(this._transition.durationMs, this._transition.elapsedMs + Math.max(0, deltaMs));

      if (this._transition.elapsedMs >= this._transition.durationMs) {
        this._transition.phase = 'switching';
        void this._executeTransitionAction();
      }

      return;
    }

    if (this._transition.phase === 'in') {
      this._transition.elapsedMs = Math.min(this._transition.durationMs, this._transition.elapsedMs + Math.max(0, deltaMs));

      if (this._transition.elapsedMs >= this._transition.durationMs) {
        this._finishTransition();
      }
    }
  }

  private async _executeTransitionAction(): Promise<void> {
    const transition = this._transition;

    if (transition?.phase !== 'switching') {
      return;
    }

    try {
      await transition.action();
    } catch (error) {
      if (this._transition === transition) {
        this._transition = null;
        transition.color.destroy();
        transition.reject(error);
      }

      return;
    }

    if (this._transition !== transition) {
      return;
    }

    transition.phase = 'in';
    transition.elapsedMs = 0;
  }

  private _finishTransition(): void {
    if (!this._transition) {
      return;
    }

    const transition = this._transition;

    this._transition = null;
    transition.color.destroy();
    transition.resolve();
  }

  private _getTransitionAlpha(): number {
    if (!this._transition) {
      return 0;
    }

    if (this._transition.phase === 'switching') {
      return 1;
    }

    const progress = this._transition.durationMs > 0 ? this._transition.elapsedMs / this._transition.durationMs : 1;

    return this._transition.phase === 'out' ? progress : 1 - progress;
  }

  private _renderTransitionOverlay(alpha: number): void {
    const transition = this._transition;
    const overlayColor = transition ? transition.color : Color.black;
    const backend = this._app.backend;
    const bounds = backend.view.getBounds();
    const overlay = this._transitionOverlay;
    const vertices = overlay.vertices;

    vertices[0] = bounds.left;
    vertices[1] = bounds.top;
    vertices[2] = bounds.right;
    vertices[3] = bounds.top;
    vertices[4] = bounds.left;
    vertices[5] = bounds.bottom;
    vertices[6] = bounds.right;
    vertices[7] = bounds.bottom;

    overlay.tint.set(overlayColor.r, overlayColor.g, overlayColor.b, Math.max(0, Math.min(1, alpha)));
    overlay.render(backend);
  }
}
