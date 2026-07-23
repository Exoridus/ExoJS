import type { RenderingContext } from '#rendering/RenderingContext';

import type { Application } from './Application';
import { logger } from './logging';
import { Perf } from './Perf';
import type { Scene } from './Scene';
import { SceneAudio } from './scene/SceneAudio';
import { SceneInputs } from './scene/SceneInputs';
import { SceneInteraction } from './scene/SceneInteraction';
import { SceneLoader } from './scene/SceneLoader';
import { SceneTweens } from './scene/SceneTweens';
import { canDestroy, canPause, canRestore, canResume, canSuspend, SceneState } from './SceneState';
import { SystemRegistry } from './SystemRegistry';
import type { Time } from './Time';

// User Timing mark/measure names for the scene sub-phases dispatched here
// (dev-only). Constant strings so the Performance panel groups every frame's
// entries under a stable label instead of one row per frame.
const fixedUpdateStartMark = 'exojs:scene-fixed-update:start';
const fixedUpdateMeasure = 'exojs:scene-fixed-update';
const updateStartMark = 'exojs:scene-update:start';
const updateMeasure = 'exojs:scene-update';
const drawStartMark = 'exojs:scene-draw:start';
const drawMeasure = 'exojs:scene-draw';

const isThenable = (value: unknown): boolean => value instanceof Promise;

/**
 * Internal owner of one {@link Scene} activation: constructs and attaches the
 * scene's facilities, runs `load()`/`init()`, gates per-frame dispatch by
 * {@link SceneState}, supports retention ({@link SceneScope.suspend} /
 * {@link SceneScope.restore}), and runs permanent teardown in the normative
 * order. Not exported from the package root — `Scene` and `SceneDirector`
 * are the public surface; this class is their shared internal implementation
 * detail.
 * @internal
 */
export class SceneScope<Data = unknown> {
  public readonly scene: Scene<Data>;
  public readonly systems: SystemRegistry;
  public readonly loader: SceneLoader;
  public readonly inputs: SceneInputs;
  public readonly interaction: SceneInteraction;
  public readonly tweens: SceneTweens;
  public readonly audio: SceneAudio;

  private readonly _app: Application;
  private _state: SceneState = SceneState.Preparing;
  private _rootsAttached = false;
  private _unloadCalled = false;
  private _destroyCalled = false;
  private _visibleStateBeforeSuspend: SceneState.Active | SceneState.Paused | null = null;

  public constructor(app: Application, scene: Scene<Data>) {
    this._app = app;
    this.scene = scene;
    this.systems = new SystemRegistry();
    this.loader = new SceneLoader(app);
    this.inputs = new SceneInputs(app, () => this._state);
    this.interaction = new SceneInteraction(app);
    this.tweens = new SceneTweens(app);
    this.audio = new SceneAudio(app);

    scene._attach(app, this);
  }

  public get state(): SceneState {
    return this._state;
  }

  /**
   * Run `load()` then `init()` (definition §5.1 steps 5–7). Leaves the scope
   * in `Preparing` on success — the caller commits the switch and calls
   * {@link SceneScope.activate} once the previous scene has been disposed.
   * Throws the original `load()`/`init()` error, or a dev-only lifecycle
   * error when `init()` returns a thenable (it must be synchronous).
   */
  public async prepare(data: Data): Promise<void> {
    await this.scene.load(data);

    // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression -- init() is declared void; capturing the raw return is exactly how a broken async override is detected below.
    const result = this.scene.init(data) as unknown;

    if (isThenable(result)) {
      // Detach any rejection from the abandoned thenable — an async init()
      // is a dev-mode activation error below, so the original async result
      // is intentionally discarded and must never surface as an unhandled
      // rejection on top of that error.
      (result as Promise<unknown>).catch(() => {
        /* discarded: see the thenable-detection error thrown below */
      });

      if (__DEV__) {
        throw new Error(
          'Scene.init() must be synchronous, but it returned a thenable (e.g. an async function). init() runs only after load() has completed — move asynchronous setup into load() instead.',
        );
      }
    }

    this._attachAutoRoots();

    this._rootsAttached = true;
    this.scene.onLoad.dispatch();
  }

  /** Commit this scope as the active scene: `Preparing` → `Active`. Called by the director once the switch boundary is crossed. */
  public activate(): void {
    this._state = SceneState.Active;
  }

  /** Pause this scope: `Active` → `Paused`. Returns whether the transition happened. */
  public pause(): boolean {
    if (!canPause(this._state)) {
      return false;
    }

    this._state = SceneState.Paused;

    return true;
  }

  /** Resume this scope: `Paused` → `Active`. Returns whether the transition happened. */
  public resume(): boolean {
    if (!canResume(this._state)) {
      return false;
    }

    this._state = SceneState.Active;

    return true;
  }

  /**
   * Suspend this scope for retention: `Active`/`Paused` → `Suspended`.
   * Records the pre-suspend state so {@link SceneScope.restore} can return
   * to it. Suspends every facility except the loader — claims are never
   * suspended (definition §14.2), so background asset loading continues.
   * Every facility call is individually guarded; a single facility's
   * failure never blocks the state transition or the others, and is
   * reported through the app error pipeline rather than thrown. Returns
   * whether the transition happened.
   */
  public suspend(): boolean {
    if (!canSuspend(this._state)) {
      return false;
    }

    this._visibleStateBeforeSuspend = this._state as SceneState.Active | SceneState.Paused;
    this._state = SceneState.Suspended;

    const errors: unknown[] = [];

    this._guard(errors, () => this.inputs.suspend());
    this._guard(errors, () => this.interaction.suspend());
    this._guard(errors, () => {
      if (this._rootsAttached) {
        this._detachAutoRoots();
      }
    });
    this._guard(errors, () => this.tweens.suspend());
    this._guard(errors, () => this.audio.suspend());

    this._reportErrors(errors);

    return true;
  }

  /**
   * Restore this scope from retention: `Suspended` → the `Active`/`Paused`
   * state it had before {@link SceneScope.suspend}. `load()`/`init()` do not
   * run again (definition §14.3). Same error-guarding contract as
   * {@link SceneScope.suspend}. Returns whether the transition happened.
   */
  public restore(): boolean {
    if (!canRestore(this._state) || this._visibleStateBeforeSuspend === null) {
      return false;
    }

    this._state = this._visibleStateBeforeSuspend;
    this._visibleStateBeforeSuspend = null;

    const errors: unknown[] = [];

    this._guard(errors, () => this.inputs.resume());
    this._guard(errors, () => this.interaction.resume());
    this._guard(errors, () => {
      if (this._rootsAttached) {
        this._attachAutoRoots();
      }
    });
    this._guard(errors, () => this.tweens.resume());
    this._guard(errors, () => this.audio.resume());

    this._reportErrors(errors);

    return true;
  }

  public fixedUpdate(step: Time): void {
    if (this._state !== SceneState.Active) {
      return;
    }

    if (__DEV__) Perf.mark(fixedUpdateStartMark);
    // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
    const result = this.scene.fixedUpdate(step);
    if (__DEV__) Perf.measure(fixedUpdateMeasure, fixedUpdateStartMark);

    if (__DEV__ && isThenable(result)) {
      logger.warn(
        'Scene.fixedUpdate() returned a Promise. fixedUpdate() must be synchronous — async logic here breaks frame timing and silently drops errors. Move async work into load() or init() instead.',
        {
          source: 'SceneScope',
          once: 'scene-scope:async-fixed-update',
        },
      );
    }

    this.systems._fixedUpdate(step);

    if (__DEV__) {
      Perf.clearMarks(fixedUpdateStartMark);
      Perf.clearMeasures(fixedUpdateMeasure);
    }
  }

  public update(delta: Time): void {
    if (this._state !== SceneState.Active) {
      return;
    }

    if (__DEV__) Perf.mark(updateStartMark);
    // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
    const result = this.scene.update(delta);
    if (__DEV__) Perf.measure(updateMeasure, updateStartMark);

    if (__DEV__ && isThenable(result)) {
      logger.warn(
        'Scene.update() returned a Promise. update() must be synchronous — async logic here breaks frame timing and silently drops errors. Move async work into load() or init() instead.',
        {
          source: 'SceneScope',
          once: 'scene-scope:async-update',
        },
      );
    }

    this.systems._update(delta);

    if (__DEV__) {
      Perf.clearMarks(updateStartMark);
      Perf.clearMeasures(updateMeasure);
    }
  }

  public draw(context: RenderingContext): void {
    if (this._state !== SceneState.Active && this._state !== SceneState.Paused) {
      return;
    }

    if (__DEV__) Perf.mark(drawStartMark);
    // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
    const result = this.scene.draw(context);
    if (__DEV__) Perf.measure(drawMeasure, drawStartMark);

    if (__DEV__ && isThenable(result)) {
      logger.warn('Scene.draw() returned a Promise. draw() must be synchronous — an async draw() produces incomplete frames and silently drops errors.', {
        source: 'SceneScope',
        once: 'scene-scope:async-draw',
      });
    }

    this.systems._draw(context);
    this.scene._peekUI()?._render(context);

    if (__DEV__) {
      Perf.clearMarks(drawStartMark);
      Perf.clearMeasures(drawMeasure);
    }
  }

  /** @internal Forwards to {@link SystemRegistry._beginFrame}. */
  public _beginFrame(): void {
    this.systems._beginFrame();
  }

  /** @internal Forwards to {@link SystemRegistry._endFrame}. */
  public _endFrame(): void {
    this.systems._endFrame();
  }

  /**
   * Failed-activation cleanup (definition §16): destroys every
   * engine-managed registration this scope created, releases loader claims,
   * and invokes `scene.destroy()` — but never `scene.unload()`, since the
   * scene never completed activation. Never throws; cleanup failures are
   * reported through the application error pipeline. Idempotent.
   */
  public destroyFailedActivation(): void {
    if (!canDestroy(this._state)) {
      return;
    }

    this._state = SceneState.Destroying;

    const errors: unknown[] = [];

    this._guard(errors, () => this.systems.destroy());
    this._guard(errors, () => this.tweens.destroy());
    this._guard(errors, () => this.audio.destroy());
    this._guard(errors, () => this.inputs.destroy());
    this._guard(errors, () => this.interaction.destroy());
    this._guard(errors, () => this.loader.destroy());
    this._callSceneDestroy(errors);
    this._guard(errors, () => this.scene._teardownInternals());

    this._state = SceneState.Destroyed;

    this._reportErrors(errors);
  }

  /**
   * Permanent teardown (definition §17), in normative order: disable input +
   * interaction, `unload()` (guarded), destroy systems, tweens + audio,
   * inputs + interaction, detach the automatic root/UI observations,
   * `scene.destroy()` + engine-owned internals teardown, then release loader
   * claims last. Every stage is individually guarded so one failure never
   * skips a later stage. Idempotent; `unload()`/`destroy()` run at most once.
   */
  public async destroy(): Promise<void> {
    if (!canDestroy(this._state)) {
      return;
    }

    this._state = SceneState.Destroying;

    const errors: unknown[] = [];

    this._guard(errors, () => this.inputs.suspend());
    this._guard(errors, () => this.interaction.suspend());

    if (!this._unloadCalled) {
      this._unloadCalled = true;
      this._guard(errors, () => this.scene.onUnload.dispatch());
      await this._guardAsync(errors, () => this.scene.unload());
    }

    this._guard(errors, () => this.systems.destroy());
    this._guard(errors, () => this.tweens.destroy());
    this._guard(errors, () => this.audio.destroy());
    this._guard(errors, () => this.inputs.destroy());
    this._guard(errors, () => this.interaction.destroy());
    this._guard(errors, () => this._detachRoots());
    this._callSceneDestroy(errors);
    this._guard(errors, () => this.scene._teardownInternals());
    this._guard(errors, () => this.loader.destroy());

    this._state = SceneState.Destroyed;

    this._reportErrors(errors);
  }

  private _callSceneDestroy(errors: unknown[]): void {
    if (this._destroyCalled) {
      return;
    }

    this._destroyCalled = true;
    this._guard(errors, () => this.scene.destroy());
  }

  private _detachRoots(): void {
    if (!this._rootsAttached) {
      return;
    }

    this._rootsAttached = false;
    this._detachAutoRoots();
  }

  private _attachAutoRoots(): void {
    this._app.interaction.attachRoot(this.scene.root);

    const ui = this.scene._peekUI();

    if (ui !== null) {
      this._app.interaction.attachUIRoot(ui);
    }
  }

  private _detachAutoRoots(): void {
    const ui = this.scene._peekUI();

    if (ui !== null) {
      this._app.interaction.detachUIRoot(ui);
    }

    this._app.interaction.detachRoot(this.scene.root);
  }

  private _guard(errors: unknown[], fn: () => void): void {
    try {
      fn();
    } catch (error) {
      errors.push(error);
    }
  }

  private async _guardAsync(errors: unknown[], fn: () => Promise<void> | void): Promise<void> {
    try {
      await fn();
    } catch (error) {
      errors.push(error);
    }
  }

  private _reportErrors(errors: unknown[]): void {
    for (const error of errors) {
      const normalized = error instanceof Error ? error : new Error(String(error));

      logger.error('A SceneScope cleanup stage failed.', { source: 'SceneScope', error: normalized });
      this._app.onError.dispatch(normalized);
    }
  }
}
