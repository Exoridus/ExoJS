import type { Application } from '#core/Application';
import { logger } from '#core/Logger';
import { Perf } from '#core/Perf';
import { hookOwnerName, requireSynchronousHook } from '#core/syncHooks';
import { SystemRegistry } from '#core/SystemRegistry';
import type { Seconds } from '#core/units';
import type { RenderingContext } from '#rendering/RenderingContext';

import type { Scene } from './Scene';
import { SceneAnimations } from './SceneAnimations';
import { SceneAudio } from './SceneAudio';
import { SceneInputs } from './SceneInputs';
import { SceneInteraction } from './SceneInteraction';
import { SceneLoader } from './SceneLoader';
import { canDestroy, canRestore, canSuspend, SceneState } from './SceneState';
import { SceneTweens } from './SceneTweens';

// User Timing mark/measure names for the scene sub-phases dispatched here
// (dev-only). Constant strings so the Performance panel groups every frame's
// entries under a stable label instead of one row per frame.
const fixedUpdateStartMark = 'exojs:scene-fixed-update:start';
const fixedUpdateMeasure = 'exojs:scene-fixed-update';
const updateStartMark = 'exojs:scene-update:start';
const updateMeasure = 'exojs:scene-update';
const drawStartMark = 'exojs:scene-draw:start';
const drawMeasure = 'exojs:scene-draw';

const frameHookRemedy =
  'The frame path never awaits a hook result, so an async override loses its timing and swallows its errors. Move the asynchronous work into load(), which the engine awaits once per activation.';

/**
 * Internal owner of one {@link Scene} activation: constructs and attaches the
 * scene's facilities, runs `load()`/`init()` (ending in {@link
 * SceneState.Ready} - a cold checkpoint before any facility produces an
 * application-wide effect), commits `Ready`/`Suspended` → `Active` via
 * {@link SceneScope.activate}/{@link SceneScope.restore}, gates per-frame
 * dispatch by {@link SceneState}, supports retention ({@link
 * SceneScope.suspend}/{@link SceneScope.restore}), and runs permanent
 * teardown in the normative order. Not exported from the package root -
 * `Scene` and `SceneDirector` are the public surface; this class is their
 * shared internal implementation detail.
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
  public readonly animations: SceneAnimations;

  private readonly _app: Application;
  private readonly _onStateChange: (previous: SceneState, next: SceneState) => void;
  private _state: SceneState = SceneState.Preparing;
  private _paused = false;
  private _rootsAttached = false;
  private _unloadCalled = false;
  private _destroyCalled = false;

  public constructor(app: Application, scene: Scene<Data>, onStateChange: (previous: SceneState, next: SceneState) => void = () => {}) {
    this._app = app;
    this._onStateChange = onStateChange;
    this.scene = scene;
    this.systems = new SystemRegistry();
    this.loader = new SceneLoader(app);
    this.inputs = new SceneInputs(
      app,
      () => this._state,
      () => this._paused,
    );
    this.interaction = new SceneInteraction(
      app,
      () => this._state,
      () => this._paused,
    );
    this.tweens = new SceneTweens(app, () => this._state);
    this.audio = new SceneAudio(app, () => this._state);
    this.animations = new SceneAnimations();

    scene._attach(app, this);
  }

  public get state(): SceneState {
    return this._state;
  }

  /** `true` while the scene is paused - only meaningful while {@link SceneScope.state} is `Active`. See {@link SceneScope.pause}/{@link SceneScope.resume}. */
  public get paused(): boolean {
    return this._paused;
  }

  /**
   * Run `load()` then `init()`. Leaves the scope
   * in `Ready` on success - a cold checkpoint that produces no
   * application-wide effect yet. The caller commits
   * the switch and calls {@link SceneScope.activate} once the previous scene
   * has been disposed. Throws the original `load()`/`init()` error, or a
   * lifecycle error when `init()` returns a thenable - in every build, not
   * only in development (it must be synchronous).
   */
  public async prepare(data: Data): Promise<void> {
    await this.scene.load(data);

    const result = this.scene.init(data) as unknown;

    if (result !== undefined) {
      requireSynchronousHook(
        result,
        `${hookOwnerName(this.scene, 'Scene')}.init()`,
        'init() runs only after load() has completed — move the asynchronous setup into load() instead.',
      );
    }

    const previous = this._state;

    this._state = SceneState.Ready;
    this._onStateChange(previous, this._state);
  }

  /**
   * Commit this scope as the active scene: `Ready` → `Active`, following the
   * fresh-activation ordering. Called by the director once the
   * switch boundary is crossed. Attaches the scene's automatic root/UI to
   * interaction dispatch and flushes every facility registration buffered
   * while dormant before dispatching
   * {@link Scene.onActivate}, then reports the state change last.
   */
  public activate(): void {
    const previous = this._state;

    this._state = SceneState.Active;

    const errors: unknown[] = [];

    this._guard(errors, () => {
      this._attachAutoRoots();
      this._rootsAttached = true;
    });
    this._guard(errors, () => this.interaction.resume());
    this._guard(errors, () => this.tweens.activate());
    this._guard(errors, () => this.audio._flushPending());
    this._guard(errors, () => this.scene.onActivate.dispatchIsolated(error => this._reportError(error)));

    this._reportErrors(errors);

    this._onStateChange(previous, this._state);
  }

  /**
   * Pause this scope: freezes `fixedUpdate`/`update` while `Active`, applies
   * the `when` pause policy to tweens/audio/animations (see
   * {@link SceneTweens.pause}/{@link SceneAudio.pause}/
   * {@link SceneAnimations.pause}), and dispatches {@link Scene.onPause}. Every
   * stage is individually guarded and a throwing listener is reported through
   * the application error pipeline rather than thrown, so the pause policy is
   * never left half-applied. Returns whether the flag actually changed.
   */
  public pause(): boolean {
    if (this._state !== SceneState.Active || this._paused) {
      return false;
    }

    this._paused = true;

    const errors: unknown[] = [];

    this._guard(errors, () => this.tweens.pause());
    this._guard(errors, () => this.audio.pause());
    this._guard(errors, () => this.animations.pause());
    this._guard(errors, () => this.interaction.resume());
    this._guard(errors, () => this.scene.onPause.dispatchIsolated(error => this._reportError(error)));

    this._reportErrors(errors);

    return true;
  }

  /**
   * Resume this scope: undoes {@link SceneScope.pause} - including the
   * tweens/audio/animations `when` policy (see {@link SceneTweens.resume}/
   * {@link SceneAudio.resume}/{@link SceneAnimations.resume}) - and dispatches
   * {@link Scene.onResume}. Same error-guarding contract as
   * {@link SceneScope.pause}. Returns whether the flag actually changed.
   */
  public resume(): boolean {
    if (this._state !== SceneState.Active || !this._paused) {
      return false;
    }

    this._paused = false;

    const errors: unknown[] = [];

    this._guard(errors, () => this.tweens.resume());
    this._guard(errors, () => this.audio.resume());
    this._guard(errors, () => this.animations.resume());
    this._guard(errors, () => this.interaction.resume());
    this._guard(errors, () => this.scene.onResume.dispatchIsolated(error => this._reportError(error)));

    this._reportErrors(errors);

    return true;
  }

  /**
   * Suspend this scope for retention: `Active` → `Suspended`. The `paused`
   * flag is left untouched, so a paused scene restores paused and an
   * unpaused one restores unpaused. Suspends every facility except the
   * loader - claims are never suspended, so background
   * asset loading continues. Also detaches the scene's own automatic root
   * and (if materialized) UI from interaction dispatch, so a retained scene
   * stops receiving pointer events alongside whichever scope is now active -
   * the same detachment {@link SceneScope.destroy} performs, just reversible
   * via {@link SceneScope.restore}. Every facility call is individually
   * guarded; a single facility's failure never blocks the state transition
   * or the others, and is reported through the app error pipeline rather
   * than thrown. Returns whether the transition happened.
   */
  public suspend(): boolean {
    if (!canSuspend(this._state)) {
      return false;
    }

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
    this._guard(errors, () => this.animations.suspend());
    this._guard(errors, () => this.scene.onSuspend.dispatchIsolated(error => this._reportError(error)));

    this._reportErrors(errors);

    return true;
  }

  /**
   * Restore this scope from retention: `Suspended` → `Active`, preserving
   * whichever `paused` flag it had before {@link SceneScope.suspend}.
   * `load()`/`init()` do not run again. Also reattaches
   * the scene's own automatic root and (if materialized) UI to interaction
   * dispatch, undoing the detachment {@link SceneScope.suspend} performed.
   * Same error-guarding contract as {@link SceneScope.suspend}. Returns
   * whether the transition happened.
   */
  public restore(): boolean {
    if (!canRestore(this._state)) {
      return false;
    }

    this._state = SceneState.Active;

    const errors: unknown[] = [];

    this._guard(errors, () => this.inputs.resume());
    this._guard(errors, () => this.interaction.resume());
    this._guard(errors, () => {
      if (this._rootsAttached) {
        this._attachAutoRoots();
      }
    });
    this._guard(errors, () => this.tweens.restore());
    this._guard(errors, () => this.audio.restore());
    this._guard(errors, () => this.animations.restore());
    this._guard(errors, () => this.audio._flushPending());
    this._guard(errors, () => this.scene.onActivate.dispatchIsolated(error => this._reportError(error)));

    this._reportErrors(errors);

    return true;
  }

  /**
   * Forward one fixed step to the scene and its systems, gated to `Active`
   * and unpaused (`fixedUpdate` never runs while paused,
   * unlike {@link SceneScope.draw}). Throws in every build if
   * `Scene.fixedUpdate` returns a thenable - the hook must be synchronous.
   */
  public preUpdate(delta: Seconds): void {
    if (this._state !== SceneState.Active || this._paused) {
      return;
    }

    const preResult = this.scene.preUpdate(delta) as unknown;

    if (preResult !== undefined) this._requireSynchronousFrameHook(preResult, 'preUpdate');

    this.systems._preUpdate(delta);
  }

  public fixedUpdate(step: Seconds): void {
    if (this._state !== SceneState.Active || this._paused) {
      return;
    }

    if (__DEV__) Perf.mark(fixedUpdateStartMark);
    const result = this.scene.fixedUpdate(step) as unknown;
    if (__DEV__) Perf.measure(fixedUpdateMeasure, fixedUpdateStartMark);

    if (result !== undefined) this._requireSynchronousFrameHook(result, 'fixedUpdate');

    this.systems._fixedUpdate(step);

    if (__DEV__) {
      Perf.clearMarks(fixedUpdateStartMark);
      Perf.clearMeasures(fixedUpdateMeasure);
    }
  }

  /**
   * Forward one frame's update to the scene and its systems, gated to
   * `Active` and unpaused. Throws in every build if `Scene.update` returns a
   * thenable - the hook must be synchronous.
   */
  public update(delta: Seconds): void {
    if (this._state !== SceneState.Active || this._paused) {
      return;
    }

    if (__DEV__) Perf.mark(updateStartMark);
    const result = this.scene.update(delta) as unknown;
    if (__DEV__) Perf.measure(updateMeasure, updateStartMark);

    if (result !== undefined) this._requireSynchronousFrameHook(result, 'update');

    this.systems._update(delta);

    if (__DEV__) {
      Perf.clearMarks(updateStartMark);
      Perf.clearMeasures(updateMeasure);
    }
  }

  /**
   * Forward one frame's draw to the scene, its systems, then the UI layer -
   * gated to `Active` regardless of `paused` (a paused scene keeps rendering
   * while simulation is frozen). Throws in every build if `Scene.draw`
   * returns a thenable - the hook must be synchronous.
   */
  public draw(context: RenderingContext): void {
    if (this._state !== SceneState.Active) {
      return;
    }

    if (__DEV__) Perf.mark(drawStartMark);
    const result = this.scene.draw(context) as unknown;
    if (__DEV__) Perf.measure(drawMeasure, drawStartMark);

    if (result !== undefined) this._requireSynchronousFrameHook(result, 'draw');

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
   * Failed-activation cleanup: aborts {@link Scene.lifecycleSignal}, destroys
   * every engine-managed registration this scope created, invokes
   * `scene.destroy()` - but never `scene.unload()`, since the scene never
   * completed activation - and releases loader claims last, the same order
   * {@link SceneScope.destroy} uses, so a `destroy()` override that takes a
   * claim sees the same scope state on either path. Never throws; cleanup
   * failures are reported through the application error pipeline. Idempotent.
   */
  public destroyFailedActivation(): void {
    if (!canDestroy(this._state)) {
      return;
    }

    this.scene._abortLifecycle();

    const previous = this._state;

    this._state = SceneState.Destroying;
    this._onStateChange(previous, this._state);

    const errors: unknown[] = [];

    this._guard(errors, () => this.systems.destroy());
    this._guard(errors, () => this.tweens.destroy());
    this._guard(errors, () => this.audio.destroy());
    this._guard(errors, () => this.animations.destroy());
    this._guard(errors, () => this.inputs.destroy());
    this._guard(errors, () => this.interaction.destroy());
    this._callSceneDestroy(errors);
    this._guard(errors, () => this.scene._teardownInternals());
    this._guard(errors, () => this.loader.destroy());

    this._state = SceneState.Destroyed;
    this._onStateChange(SceneState.Destroying, this._state);

    this._reportErrors(errors);
  }

  /**
   * Permanent teardown, in normative order: abort
   * {@link Scene.lifecycleSignal}, disable input + interaction, `unload()`
   * (guarded), destroy systems, tweens + audio + animations, inputs +
   * interaction, detach the automatic root/UI observations, `scene.destroy()`
   * + engine-owned internals teardown, then release loader claims last. Every
   * stage is individually guarded so one failure never skips a later stage.
   * Idempotent; `unload()`/`destroy()` run at most once.
   */
  public async destroy(): Promise<void> {
    if (!canDestroy(this._state)) {
      return;
    }

    // Before anything that can await - `unload()` is the first such stage, and
    // a scene watching the signal has to see it aborted by the time its own
    // teardown hook runs, not afterwards.
    this.scene._abortLifecycle();

    const previous = this._state;

    this._state = SceneState.Destroying;
    this._onStateChange(previous, this._state);

    const errors: unknown[] = [];

    this._guard(errors, () => this.inputs.suspend());
    this._guard(errors, () => this.interaction.suspend());

    if (!this._unloadCalled) {
      this._unloadCalled = true;
      await this._guardAsync(errors, () => this.scene.unload());
    }

    this._guard(errors, () => this.systems.destroy());
    this._guard(errors, () => this.tweens.destroy());
    this._guard(errors, () => this.audio.destroy());
    this._guard(errors, () => this.animations.destroy());
    this._guard(errors, () => this.inputs.destroy());
    this._guard(errors, () => this.interaction.destroy());
    this._guard(errors, () => this._detachRoots());
    this._callSceneDestroy(errors);
    this._guard(errors, () => this.scene._teardownInternals());
    this._guard(errors, () => this.loader.destroy());

    this._state = SceneState.Destroyed;
    this._onStateChange(SceneState.Destroying, this._state);

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

  /**
   * Cold half of the frame-hook synchrony contract. The dispatchers keep the
   * hot path to a single `result !== undefined` comparison and only call this
   * once a hook has actually returned something, so building the message here
   * costs nothing per frame.
   */
  private _requireSynchronousFrameHook(result: unknown, hook: string): void {
    requireSynchronousHook(result, `${hookOwnerName(this.scene, 'Scene')}.${hook}()`, frameHookRemedy);
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

  private _reportError(error: unknown): void {
    const normalized = error instanceof Error ? error : new Error(String(error));

    logger.error('A SceneScope lifecycle stage failed.', { source: 'SceneScope', error: normalized });
    this._app.onError.dispatch(normalized);
  }

  private _reportErrors(errors: unknown[]): void {
    for (const error of errors) {
      this._reportError(error);
    }
  }
}
