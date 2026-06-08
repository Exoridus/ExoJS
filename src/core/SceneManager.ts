import { Mesh } from '#rendering/mesh/Mesh';
import type { RenderBackend } from '#rendering/RenderBackend';

import type { Application } from './Application';
import { Color } from './Color';
import type { SceneParticipationPolicy, SceneStackMode } from './Scene';
import { Scene } from './Scene';
import { Signal } from './Signal';
import type { Time } from './Time';

interface ResolvedSceneParticipationPolicy {
  readonly mode: SceneStackMode;
}

interface SceneStackEntry {
  readonly scene: Scene;
  readonly policy: ResolvedSceneParticipationPolicy;
}

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

/**
 * Options passed to {@link SceneManager.pushScene}. Inherits
 * {@link SceneParticipationPolicy} so the pushed scene's stack mode
 * can be overridden at the call site without subclassing.
 */
export interface PushSceneOptions extends SceneParticipationPolicy {
  transition?: SceneTransition;
}

/** Options passed to {@link SceneManager.popScene}. */
export interface PopSceneOptions {
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
 * Stack-based scene controller owned by {@link Application}. Maintains an
 * ordered stack of {@link Scene} instances, each tagged with its
 * participation policy ({@link SceneStackMode}).
 * Scenes higher on the stack overlay scenes lower; the policy of each
 * scene determines whether scenes below continue to update / render.
 *
 * Use {@link SceneManager.setScene} to replace the entire stack with one
 * scene, {@link SceneManager.pushScene} to overlay a new scene on top, and
 * {@link SceneManager.popScene} to remove the topmost. All three accept an
 * optional fade transition.
 *
 */
export class SceneManager {
  private readonly _app: Application;
  private readonly _stack: SceneStackEntry[] = [];
  private readonly _transitionOverlay: TransitionOverlayMesh = createOverlayMesh();
  private _transition: ActiveFadeTransition | null = null;

  /** Fires whenever the topmost scene changes (push, pop, set, or clear). Payload is the new top, or `null` when the stack becomes empty. */
  public readonly onChangeScene = new Signal<[Scene | null]>();
  /** Fires after a scene's `init` resolves and it joins the stack. */
  public readonly onStartScene = new Signal<[Scene]>();
  /** Fires once per frame for the topmost scene after its `update` ran. */
  public readonly onUpdateScene = new Signal<[Scene]>();
  /** Fires just before a scene is unloaded (`unload` then `destroy`). */
  public readonly onStopScene = new Signal<[Scene]>();

  private readonly _asyncUpdateWarned = new WeakSet<Scene>();
  private readonly _asyncDrawWarned = new WeakSet<Scene>();

  private readonly _updateScratch: Scene[] = [];
  private readonly _drawScratch: Scene[] = [];

  public constructor(app: Application) {
    this._app = app;
  }

  public get currentScene(): Scene | null {
    return this._stack.at(-1)?.scene ?? null;
  }

  public set currentScene(scene: Scene | null) {
    void this.setScene(scene);
  }

  public get scenes(): readonly Scene[] {
    return this._stack.map(entry => entry.scene);
  }

  /**
   * Replace the entire scene stack with `scene`, or clear it when `scene`
   * is `null`. Existing scenes are unloaded in reverse order. If `scene`
   * is already the topmost, only the scenes underneath are unloaded
   * (no-op when it is also the only scene).
   *
   * Throws if `scene` is somewhere in the stack but not the top.
   */
  public async setScene(scene: Scene | null, options: SetSceneOptions = {}): Promise<this> {
    await this._runWithTransition(async () => {
      if (scene === null) {
        await this._unloadAllScenes();
        this.onChangeScene.dispatch(null);

        return;
      }

      if (this.currentScene === scene) {
        if (this._stack.length > 1) {
          await this._unloadCoveredScenes();
        }

        return;
      }

      if (this._stack.some(entry => entry.scene === scene)) {
        throw new Error('Cannot set a scene that is already present in the scene stack.');
      }

      const policy = this._resolveParticipationPolicy(scene);

      await this._prepareScene(scene);
      await this._unloadAllScenes();
      this._stack.push({ scene, policy });
      this.onChangeScene.dispatch(scene);
      this.onStartScene.dispatch(scene);
    }, options.transition);

    return this;
  }

  /**
   * Push `scene` onto the stack, leaving any underlying scenes intact.
   * Resolves once the pushed scene's async `load` + `init` complete.
   * `options` may override the scene's declared participation policy
   * (stack mode, input mode) for this particular push.
   *
   * Throws if `scene` is already present in the stack.
   */
  public async pushScene(scene: Scene, options: PushSceneOptions = {}): Promise<this> {
    await this._runWithTransition(async () => {
      if (this._stack.some(entry => entry.scene === scene)) {
        throw new Error('Cannot push a scene instance that is already present in the stack.');
      }

      const policy = this._resolveParticipationPolicy(scene, options);

      await this._prepareScene(scene);
      this._stack.push({ scene, policy });
      this.onChangeScene.dispatch(scene);
      this.onStartScene.dispatch(scene);
    }, options.transition);

    return this;
  }

  /**
   * Remove the topmost scene from the stack. Resolves once the scene's
   * `unload` finishes. No-op when the stack is empty.
   */
  public async popScene(options: PopSceneOptions = {}): Promise<this> {
    await this._runWithTransition(async () => {
      if (this._stack.length === 0) {
        return;
      }

      const removed = this._stack.at(-1);

      if (!removed) {
        return;
      }

      await this._disposeScene(removed.scene);
      this._stack.pop();
      this.onChangeScene.dispatch(this.currentScene);
    }, options.transition);

    return this;
  }

  /**
   * Per-frame entry point called by {@link Application.update}. Advances
   * any active fade transition, then iterates the stack top-to-bottom
   * deciding which scenes update and which draw based on each scene's
   * participation policy (`opaque` covers everything below, `modal`
   * covers only updates).
   */
  public update(delta: Time): this {
    this._advanceTransition(delta.milliseconds);

    this._resolveParticipants();

    for (const scene of this._updateScratch) {
      // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
      const updateResult = scene.update(delta);

      if (!this._asyncUpdateWarned.has(scene) && (updateResult as unknown) instanceof Promise) {
        this._asyncUpdateWarned.add(scene);
        console.warn(
          `[ExoJS] Scene.update() returned a Promise. update() must be synchronous — async logic here breaks frame timing and silently drops errors. Move async work into load() or init() instead.`,
        );
      }
    }

    for (const scene of this._drawScratch) {
      // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
      const drawResult = scene.draw(this._app.rendering);

      if (!this._asyncDrawWarned.has(scene) && (drawResult as unknown) instanceof Promise) {
        this._asyncDrawWarned.add(scene);
        console.warn(
          `[ExoJS] Scene.draw() returned a Promise. draw() must be synchronous — an async draw() produces incomplete frames and silently drops errors.`,
        );
      }
    }

    const transitionAlpha = this._getTransitionAlpha();

    if (transitionAlpha > 0) {
      this._renderTransitionOverlay(transitionAlpha);
    }

    if (this.currentScene !== null) {
      this.onUpdateScene.dispatch(this.currentScene);
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

    void this._unloadAllScenesOnDestroy();

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
    this.onStopScene.dispatch(scene);
    await scene.unload(this._app.loader);
    scene.destroy();
    scene.app = null;
  }

  private async _unloadAllScenes(): Promise<void> {
    for (let index = this._stack.length - 1; index >= 0; index--) {
      await this._disposeScene(this._stack[index].scene);
    }

    this._stack.length = 0;
  }

  private async _unloadCoveredScenes(): Promise<void> {
    if (this._stack.length <= 1) {
      return;
    }

    const activeEntry = this._stack.at(-1);

    if (!activeEntry) {
      return;
    }

    for (let index = this._stack.length - 2; index >= 0; index--) {
      await this._disposeScene(this._stack[index].scene);
    }

    this._stack.length = 0;
    this._stack.push(activeEntry);
  }

  private async _unloadAllScenesOnDestroy(): Promise<void> {
    for (let index = this._stack.length - 1; index >= 0; index--) {
      try {
        await this._disposeScene(this._stack[index].scene);
      } catch (error) {
        console.error('SceneManager.destroy() failed to unload the active scene.', error);
      }
    }

    this._stack.length = 0;
  }

  private _resolveParticipationPolicy(scene: Scene, overrides: SceneParticipationPolicy = {}): ResolvedSceneParticipationPolicy {
    const mode = overrides.mode ?? scene.stackMode ?? 'overlay';

    return { mode };
  }

  private _resolveParticipants(): void {
    const updateScenes = this._updateScratch;
    const drawScenes = this._drawScratch;
    updateScenes.length = 0;
    drawScenes.length = 0;
    let allowBelowUpdate = true;
    let allowBelowDraw = true;

    for (let index = this._stack.length - 1; index >= 0; index--) {
      const entry = this._stack[index];

      if (allowBelowUpdate) {
        updateScenes.push(entry.scene);
      }

      if (allowBelowDraw) {
        drawScenes.push(entry.scene);
      }

      if (entry.policy.mode === 'opaque') {
        allowBelowUpdate = false;
        allowBelowDraw = false;
      } else if (entry.policy.mode === 'modal') {
        allowBelowUpdate = false;
      }
    }

    updateScenes.reverse();
    drawScenes.reverse();
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
