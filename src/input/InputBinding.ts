import { Signal } from '#core/Signal';
import { Time } from '#core/Time';
import { Timer } from '#core/Timer';

import type { ChannelEventBatch } from './actions/types';
import type { GamepadAxisChannel } from './GamepadAxis';
import type { GamepadButtonChannel } from './GamepadButton';
import type { PointerChannel } from './Pointer';
import type { Keyboard, PointerButton } from './types';

/** Channel a single {@link InputBinding} can subscribe to. */
export type InputChannel = GamepadButtonChannel | GamepadAxisChannel | PointerChannel | Keyboard | PointerButton;

/** Construction options shared by every binding factory method. */
export interface InputBindingOptions {
  /**
   * Tap-window for {@link InputBinding.onTrigger} in milliseconds. The
   * trigger fires when the input is released within this window after
   * activation. Defaults to {@link InputBinding.defaultTriggerThreshold}
   * (300 ms).
   */
  threshold?: number;
  /**
   * Pin this binding to a specific gamepad slot (0..3). Channel offsets
   * are resolved at construction time. When unset, gamepad channels read
   * from slot 0 (the primary pad).
   */
  gamepadSlot?: 0 | 1 | 2 | 3;
}

interface InternalChannelDetacher {
  detach(binding: InputBinding): void;
}

/**
 * One subscription to one or more input channels. Tracks active state, fires
 * the {@link onStart} / {@link onActive} / {@link onStop} / {@link onTrigger}
 * Signals each frame, and registers itself with whichever owner created it
 * (typically an {@link InputManager}, {@link Gamepad}, or scene-bound
 * proxy).
 *
 * Construct via the owner's `onStart` / `onActive` / `onStop` /
 * `onTrigger` factory methods rather than `new InputBinding(...)` directly.
 *
 * Lifecycle: a binding lives until {@link unbind} is called, the owner
 * disposes it, or — for scene-bound bindings — the scene unloads.
 *
 * @internal
 */
export class InputBinding {
  /**
   * Default tap-window for `onTrigger`. Override per binding via the
   * `threshold` option. Mutating this static affects only newly created
   * bindings.
   */
  public static defaultTriggerThreshold = 300;

  public readonly channels: readonly number[];

  public readonly onStart = new Signal<[number]>();
  public readonly onActive = new Signal<[number]>();
  public readonly onStop = new Signal<[number]>();
  public readonly onTrigger = new Signal<[number]>();

  private readonly _triggerTimer: Timer;
  private readonly _detacher: InternalChannelDetacher | null;
  /** Last known value of each bound channel, in `channels` order — the replay baseline `update` advances. */
  private readonly _channelValues: Float32Array;
  /** `false` until the first `update()` call, which always baselines from the live buffer directly — see `update`'s doc comment. */
  private _seeded = false;
  private _value = 0;
  private _unbound = false;

  public constructor(channels: readonly number[], options: InputBindingOptions = {}, detacher: InternalChannelDetacher | null = null) {
    this.channels = channels;
    this._triggerTimer = new Timer(Time.fromMilliseconds(options.threshold ?? InputBinding.defaultTriggerThreshold));
    this._detacher = detacher;
    this._channelValues = new Float32Array(channels.length);
  }

  /** Last value sampled this frame. 0 when inactive. */
  public get value(): number {
    return this._value;
  }

  /** `true` when the last sampled value exceeded the channel's threshold. */
  public get active(): boolean {
    return this._value > 0;
  }

  /**
   * Read the latest channel state and dispatch the appropriate Signals.
   * Called once per frame by the owning manager.
   *
   * `batches` — when supplied and this binding has already seeded itself
   * once before — is replayed in true order, evaluating the aggregate value
   * once per whole batch (see {@link ChannelEventBatch}'s doc comment), so a
   * full activate-then-release within a single frame still fires
   * `onStart`/`onStop`/`onTrigger` instead of being invisible to a
   * once-per-frame snapshot of `channels`. Omitted entirely by callers with
   * no ordered history of their own (e.g. {@link Gamepad}'s per-slot
   * bindings) — falls back to reading `channels` directly, exactly as
   * before, which is also what the very FIRST call ever does regardless of
   * `batches`: a fresh binding baselines from the live buffer with no
   * synthetic edge, then only reports real transitions relative to that
   * baseline as later batches replay — a channel already active before this
   * binding started observing correctly reports `onStart` immediately on
   * that first call, exactly as the previous once-per-frame design always
   * did, not a regression to guard against here.
   *
   * @internal
   */
  public update(channels: Float32Array, batches?: readonly ChannelEventBatch[]): void {
    if (this._unbound) {
      return;
    }

    if (!this._seeded || batches === undefined || batches.length === 0) {
      this._seeded = true;

      for (let i = 0; i < this.channels.length; i++) {
        this._channelValues[i] = channels[this.channels[i]!] ?? 0;
      }

      this._evaluateTransition();

      return;
    }

    for (const batch of batches) {
      let touchedBoundChannel = false;

      for (const event of batch.channels) {
        const index = this.channels.indexOf(event.channel);

        if (index === -1) {
          continue;
        }

        this._channelValues[index] = event.value;
        touchedBoundChannel = true;
      }

      if (touchedBoundChannel) {
        this._evaluateTransition();
      }
    }
  }

  /** Recompute the aggregate value from `_channelValues` and dispatch a transition if the active/inactive state changed. */
  private _evaluateTransition(): void {
    let value = 0;

    for (let i = 0; i < this._channelValues.length; i++) {
      const channelValue = this._channelValues[i] ?? 0;

      if (Math.abs(channelValue) > Math.abs(value)) {
        value = channelValue;
      }
    }

    this._value = value;

    if (value !== 0) {
      if (!this._triggerTimer.running) {
        this._triggerTimer.restart();
        this.onStart.dispatch(value);
      }

      this.onActive.dispatch(value);
    } else if (this._triggerTimer.running) {
      this.onStop.dispatch(0);

      if (!this._triggerTimer.expired) {
        this.onTrigger.dispatch(0);
      }

      this._triggerTimer.stop();
    }
  }

  /**
   * Detach this binding from its owner and release its Signals. Idempotent.
   */
  public unbind(): void {
    if (this._unbound) {
      return;
    }

    this._unbound = true;
    this._detacher?.detach(this);
    this._triggerTimer.destroy();
    this.onStart.destroy();
    this.onActive.destroy();
    this.onStop.destroy();
    this.onTrigger.destroy();
  }
}
