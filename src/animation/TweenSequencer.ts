import type { Tween } from './Tween';
import type { TweenManager } from './TweenManager';
import { TweenState } from './types';

interface TweenStage {
  readonly type: 'tweens';
  readonly tweens: readonly Tween[];
}

interface DelayStage {
  readonly type: 'delay';
  readonly seconds: number;
}

type Stage = TweenStage | DelayStage;

/**
 * Lifecycle states of a {@link TweenSequencer}. Mirrors {@link TweenState}
 * semantics: starts `Idle`, becomes `Active` on {@link TweenSequencer.start},
 * and ends in `Complete` (all stages exhausted) or `Stopped` (cancelled via
 * {@link TweenSequencer.stop}). `Paused` is reachable from `Active` only.
 */
export enum TweenSequencerState {
  Idle = 'idle',
  Active = 'active',
  Paused = 'paused',
  Complete = 'complete',
  Stopped = 'stopped',
}

/**
 * Composes multiple {@link Tween} instances into a multi-stage animation.
 *
 * Each stage added via {@link TweenSequencer.then} plays after the previous
 * one finishes. Within a single stage, multiple tweens run simultaneously
 * (parallel); the stage advances when **all** of them complete.
 *
 * Delay stages inserted via {@link TweenSequencer.wait} create a timed pause
 * between stages without needing a dummy tween.
 *
 * The sequencer integrates with {@link TweenManager} via
 * {@link TweenManager.addTicker} so it is driven automatically each frame.
 * It can also be used stand-alone by calling {@link TweenSequencer.update}
 * manually — in that mode the sequencer also advances its child tweens.
 *
 * @example
 * ```ts
 * app.tweens.createSequencer()
 *   .then(fadeIn)
 *   .wait(0.5)
 *   .then([moveLeft, scaleUp])
 *   .then(fadeOut)
 *   .onComplete(() => console.log('done!'))
 *   .start();
 * ```
 * @stable
 */
export class TweenSequencer {
  private readonly _stages: Stage[] = [];
  private _state: TweenSequencerState = TweenSequencerState.Idle;
  private _manager: TweenManager | null;

  /** Index into `_stages` for the current pass (0-based). */
  private _currentStageIndex = 0;

  /** 1 = forward through stages, -1 = reversed (yoyo pass). */
  private _direction: 1 | -1 = 1;

  /** Remaining repeat cycles. -1 = infinite. */
  private _repeatCount = 0;
  /** The value configured by {@link TweenSequencer.repeat}. Preserved for restart. */
  private _repeatTotal = 0;
  private _yoyo = false;

  /** Accumulated seconds within the current delay stage. */
  private _delayElapsed = 0;

  private _onStartCb: (() => void) | null = null;
  private _onCompleteCb: (() => void) | null = null;
  private _startFired = false;

  public constructor(manager?: TweenManager) {
    this._manager = manager ?? null;
  }

  /**
   * Attach this sequencer to a manager after construction — used by
   * `SceneTweens` to bind a cold (buffered) sequencer, constructed without
   * a manager while its owning scope was dormant, once the scope becomes
   * `Active`. Mirrors {@link Tween._attachManager}.
   * @internal
   */
  public _attachManager(manager: TweenManager): void {
    this._manager = manager;
  }

  // ── State ────────────────────────────────────────────────────────────────

  /** Current lifecycle state of the sequencer. */
  public get state(): TweenSequencerState {
    return this._state;
  }

  /**
   * Playback progress in 0..1, advancing in discrete steps as each stage
   * completes. Equals `1` when the entire sequence has finished.
   */
  public get progress(): number {
    const n = this._stages.length;
    if (n === 0) return 1;
    return Math.min(this._currentStageIndex / n, 1);
  }

  // ── Builder ──────────────────────────────────────────────────────────────

  /**
   * Append a stage to the sequence.
   *
   * - **Single tween**: the stage plays that tween, then advances.
   * - **Array of tweens**: all start simultaneously; the stage advances when
   *   every tween in the array has completed.
   */
  public then(tween: Tween | Tween[]): this {
    const tweens = Array.isArray(tween) ? tween : [tween];
    this._stages.push({ type: 'tweens', tweens });
    return this;
  }

  /** Insert a fixed pause of `seconds` between stages. */
  public wait(seconds: number): this {
    this._stages.push({ type: 'delay', seconds });
    return this;
  }

  /**
   * Number of additional repeat cycles. -1 = infinite. Default 0 (plays once).
   *
   * `repeat(2)` plays the full sequence three times total (initial pass + 2
   * repeats).
   */
  public repeat(count: number): this {
    this._repeatTotal = count;
    return this;
  }

  /**
   * Reverse stage order on each repeat cycle. Only meaningful when combined
   * with {@link TweenSequencer.repeat}.
   */
  public yoyo(enabled = true): this {
    this._yoyo = enabled;
    return this;
  }

  /**
   * Register a callback fired once on the first {@link TweenSequencer.update}
   * call after {@link TweenSequencer.start}.
   */
  public onStart(cb: () => void): this {
    this._onStartCb = cb;
    return this;
  }

  /**
   * Register a callback fired when the sequence finishes naturally (all stages
   * and repeat cycles exhausted). Does NOT fire when stopped via
   * {@link TweenSequencer.stop}.
   */
  public onComplete(cb: () => void): this {
    this._onCompleteCb = cb;
    return this;
  }

  // ── Control ──────────────────────────────────────────────────────────────

  /**
   * Start (or restart) the sequence from stage 0. Resets all internal state
   * and re-registers with the manager if one is attached.
   */
  public start(): this {
    this._state = TweenSequencerState.Active;
    this._currentStageIndex = 0;
    this._direction = 1;
    this._repeatCount = this._repeatTotal;
    this._startFired = false;
    this._manager?.addTicker(this);
    this._startCurrentStage();
    return this;
  }

  /**
   * Pause the sequence. Tweens in the current stage are also paused. The
   * elapsed timer in delay stages is frozen.
   */
  public pause(): this {
    if (this._state === TweenSequencerState.Active) {
      this._state = TweenSequencerState.Paused;
      this._pauseCurrentStageTweens();
    }
    return this;
  }

  /** Resume a paused sequence (and its current-stage tweens) from where they left off. */
  public resume(): this {
    if (this._state === TweenSequencerState.Paused) {
      this._state = TweenSequencerState.Active;
      this._resumeCurrentStageTweens();
    }
    return this;
  }

  /**
   * Stop the sequence without finishing. Active tweens are stopped.
   * {@link TweenSequencer.onComplete} does NOT fire. The sequencer is removed
   * from its manager if one is assigned.
   */
  public stop(): this {
    if (this._state === TweenSequencerState.Active || this._state === TweenSequencerState.Paused) {
      this._state = TweenSequencerState.Stopped;
      this._stopCurrentStageTweens();
      this._manager?.removeTicker(this);
    }
    return this;
  }

  // ── Ticker ───────────────────────────────────────────────────────────────

  /**
   * Advance the sequencer by `deltaSeconds`. Called automatically by the
   * attached {@link TweenManager} each frame. When used stand-alone (no
   * manager), call this manually and child tweens will also be advanced.
   */
  public update(deltaSeconds: number): void {
    if (this._state !== TweenSequencerState.Active) return;

    if (!this._startFired) {
      this._startFired = true;
      this._onStartCb?.();
    }

    if (this._stages.length === 0) {
      this._finish();
      return;
    }

    const stageIndex = this._getActualStageIndex();
    const stage = this._stages[stageIndex];
    if (stage === undefined) return;

    if (stage.type === 'delay') {
      this._delayElapsed += deltaSeconds;
      if (this._delayElapsed >= stage.seconds) {
        this._advanceStage();
      }
    } else {
      // In stand-alone mode (no manager), the sequencer ticks tweens itself.
      if (this._manager === null) {
        for (const tween of stage.tweens) {
          if (tween.state === TweenState.Active) {
            tween.update(deltaSeconds);
          }
        }
      }

      // Advance as soon as every tween in this stage has settled.
      const allDone = stage.tweens.every(t => t.state === TweenState.Complete || t.state === TweenState.Stopped);

      if (allDone) {
        this._advanceStage();
      }
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  /**
   * Map the logical `_currentStageIndex` to the real index in `_stages`,
   * accounting for yoyo reversal.
   */
  private _getActualStageIndex(): number {
    if (this._direction === 1) return this._currentStageIndex;
    return this._stages.length - 1 - this._currentStageIndex;
  }

  private _startCurrentStage(): void {
    const stageIndex = this._getActualStageIndex();
    const stage = this._stages[stageIndex];
    if (stage === undefined) return;

    this._delayElapsed = 0;

    if (stage.type === 'tweens') {
      for (const tween of stage.tweens) {
        if (this._manager !== null) {
          // Register with manager so the manager ticks it each frame.
          this._manager.add(tween);
        }
        tween.start();
      }
    }
    // Delay stages need only the elapsed counter reset (done above).
  }

  private _advanceStage(): void {
    this._currentStageIndex++;

    if (this._currentStageIndex >= this._stages.length) {
      // All stages in this pass are done.
      const hasMoreRepeats = this._repeatCount === -1 || this._repeatCount > 0;

      if (hasMoreRepeats) {
        if (this._repeatCount !== -1) {
          this._repeatCount--;
        }

        if (this._yoyo) {
          this._direction = this._direction === 1 ? -1 : 1;
        }

        this._currentStageIndex = 0;
        this._startCurrentStage();
      } else {
        this._finish();
      }
    } else {
      this._startCurrentStage();
    }
  }

  private _finish(): void {
    this._state = TweenSequencerState.Complete;
    this._manager?.removeTicker(this);
    this._onCompleteCb?.();
  }

  private _getCurrentStageTweens(): readonly Tween[] {
    if (this._stages.length === 0) return [];
    const stageIndex = this._getActualStageIndex();
    const stage = this._stages[stageIndex];
    if (stage?.type === 'tweens') return stage.tweens;
    return [];
  }

  private _pauseCurrentStageTweens(): void {
    for (const tween of this._getCurrentStageTweens()) {
      tween.pause();
    }
  }

  private _resumeCurrentStageTweens(): void {
    for (const tween of this._getCurrentStageTweens()) {
      tween.resume();
    }
  }

  private _stopCurrentStageTweens(): void {
    for (const tween of this._getCurrentStageTweens()) {
      tween.stop();
    }
  }
}
