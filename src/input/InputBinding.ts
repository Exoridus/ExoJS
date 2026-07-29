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
  /**
   * Batch-sequence watermark as of construction — see
   * {@link ChannelEventBatch}'s doc comment. Only consulted on the very
   * first `update()` call that supplies batches at all: it filters out any
   * batch pushed BEFORE this binding existed, still sitting in the owner's
   * shared per-frame log from earlier activity, while still replaying one
   * pushed after construction even on that same first call (a full
   * press-then-release that happens strictly after `new InputBinding(...)`
   * but is only first observed on its first `update()` must still fire
   * `onStart`/`onStop`/`onTrigger` — not be silently swallowed the way a
   * bare live-value read on that first call would).
   */
  private readonly _watermark: number;
  /** `false` until the first `update()` call — see `update`'s doc comment. */
  private _seeded = false;
  private _value = 0;
  private _unbound = false;

  public constructor(channels: readonly number[], options: InputBindingOptions = {}, detacher: InternalChannelDetacher | null = null, watermark = 0) {
    this.channels = channels;
    this._triggerTimer = new Timer(Time.fromMilliseconds(options.threshold ?? InputBinding.defaultTriggerThreshold));
    this._detacher = detacher;
    this._channelValues = new Float32Array(channels.length);
    this._watermark = watermark;
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
   * `batches`, when supplied, is replayed in true order, evaluating the
   * aggregate value once per whole batch (see {@link ChannelEventBatch}'s
   * doc comment), so a full activate-then-release within a single frame
   * still fires `onStart`/`onStop`/`onTrigger` instead of being invisible to
   * a once-per-frame snapshot of `channels`. Omitted entirely by callers
   * with no ordered history of their own (e.g. {@link Gamepad}'s per-slot
   * bindings) — falls back to reading `channels` directly, on every call,
   * exactly as before.
   *
   * The very first call that DOES supply batches filters them against
   * {@link _watermark} first (see its own doc comment) — anything that
   * predates construction seeds this binding's baseline from the live
   * buffer with no synthetic edge, exactly as a plain live-value read always
   * did, while anything after is replayed for real transitions, even on
   * that very first call. A frame with no batch touching this binding's own
   * channels — before or after seeding — still evaluates once, so a source
   * held continuously active keeps firing {@link onActive} every real frame.
   *
   * @internal
   */
  public update(channels: Float32Array, batches?: readonly ChannelEventBatch[]): void {
    if (this._unbound) {
      return;
    }

    if (batches === undefined) {
      this._seeded = true;

      for (let i = 0; i < this.channels.length; i++) {
        this._channelValues[i] = channels[this.channels[i]!] ?? 0;
      }

      this._replayOrEvaluate([]);

      return;
    }

    const relevant = this._seeded ? batches : batches.filter(batch => batch.sequence > this._watermark);

    if (!this._seeded) {
      this._seeded = true;
      this._seedUntouchedChannels(channels, batches, relevant);

      if (relevant.length > 0) {
        // Establish the seeded baseline's active/inactive state (dispatching
        // `onStart` if the seed reveals an already-active source, exactly as
        // a plain live-value read always did) BEFORE replaying `relevant` on
        // top of it — otherwise a channel seeded active from a pre-watermark
        // batch (see `_seedUntouchedChannels`) would look, to the replay
        // below, like it started this call at 0, and a genuine release
        // within `relevant` would go undetected for want of a prior `onStart`
        // to release FROM. A no-op when the seed left everything at 0.
        this._applyEdge();
      }
    }

    this._replayOrEvaluate(relevant);
  }

  /**
   * Seed every bound channel `relevant` (the batches this call will actually
   * replay) does NOT touch, directly from the live buffer — with no
   * synthetic edge, exactly like a plain live-value read. A channel `relevant`
   * DOES touch is instead seeded from the last value a PRE-watermark batch
   * (one filtered out of `relevant`, in `allBatches`) gave it, if any — so a
   * press recorded before this binding existed and released after it is
   * still seen as a real release rather than starting the replay from an
   * assumed 0 (see `update`'s doc comment on the follow-up `_applyEdge`
   * call). Left at 0 when NEITHER exists, matching the same accepted
   * assumption `ButtonAction._seedUntouchedChannels` makes for a channel
   * with no prior baseline to seed from at all.
   */
  private _seedUntouchedChannels(channels: Float32Array, allBatches: readonly ChannelEventBatch[], relevant: readonly ChannelEventBatch[]): void {
    const relevantSet = new Set(relevant);
    const touchedByRelevant = new Set<number>();
    const preWatermarkValue = new Map<number, number>();

    for (const batch of relevant) {
      for (const event of batch.channels) {
        touchedByRelevant.add(event.channel);
      }
    }

    for (const batch of allBatches) {
      if (relevantSet.has(batch)) {
        continue;
      }

      for (const event of batch.channels) {
        preWatermarkValue.set(event.channel, event.value);
      }
    }

    for (let i = 0; i < this.channels.length; i++) {
      const channel = this.channels[i]!;

      if (!touchedByRelevant.has(channel)) {
        this._channelValues[i] = channels[channel] ?? 0;
        continue;
      }

      const preValue = preWatermarkValue.get(channel);

      if (preValue !== undefined) {
        this._channelValues[i] = preValue;
      }
    }
  }

  /**
   * Replay `batches` — already filtered to whatever this call should see —
   * applying each to `_channelValues` and checking for a real threshold
   * crossing once per batch that actually touched a bound channel (never
   * mid-batch; see {@link ChannelEventBatch}'s doc comment). An empty
   * `batches` (nothing to replay this call, or none of it touched a bound
   * channel) still performs exactly one crossing check against the CURRENT
   * `_channelValues` — the same thing a plain once-per-frame read would do —
   * so a channel seeded active on this very call, or one simply held active
   * with nothing new to report, is still detected correctly.
   *
   * `onActive` fires once per real crossing INTO the active state (alongside
   * `onStart`), plus, if the call ends active without ever crossing into it
   * this call (held continuously from before, or only OTHER channels'
   * batches arrived), exactly once more at the end — never once per
   * individual batch that merely keeps an already-active value active,
   * which would over-fire for a source whose magnitude jitters across
   * several batches within one frame without ever actually releasing.
   */
  private _replayOrEvaluate(batches: readonly ChannelEventBatch[]): void {
    let activeDispatched = false;
    let anyEdgeChecked = false;

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

      if (!touchedBoundChannel) {
        continue;
      }

      anyEdgeChecked = true;

      if (this._applyEdge()) {
        activeDispatched = true;
      }
    }

    if (!anyEdgeChecked && this._applyEdge()) {
      activeDispatched = true;
    }

    if (!activeDispatched && this._value !== 0) {
      this.onActive.dispatch(this._value);
    }
  }

  /**
   * Recompute the aggregate value from `_channelValues` and dispatch a
   * transition only on a REAL crossing — `onStart` (paired with `onActive`)
   * on 0 → nonzero, `onStop` (and `onTrigger`, if within the tap window) on
   * nonzero → 0. A value that stays on the same side of zero (still active,
   * still inactive) dispatches nothing here; see {@link _replayOrEvaluate}
   * for the once-per-call `onActive` re-confirmation that covers that case
   * instead.
   *
   * @returns `true` iff this call dispatched `onActive` (the entering
   * crossing), so the caller knows not to dispatch it again.
   */
  private _applyEdge(): boolean {
    let value = 0;

    for (let i = 0; i < this._channelValues.length; i++) {
      const channelValue = this._channelValues[i] ?? 0;

      if (Math.abs(channelValue) > Math.abs(value)) {
        value = channelValue;
      }
    }

    this._value = value;

    if (value !== 0) {
      if (this._triggerTimer.running) {
        return false;
      }

      this._triggerTimer.restart();
      this.onStart.dispatch(value);
      this.onActive.dispatch(value);

      return true;
    }

    if (this._triggerTimer.running) {
      this.onStop.dispatch(0);

      if (!this._triggerTimer.expired) {
        this.onTrigger.dispatch(0);
      }

      this._triggerTimer.stop();
    }

    return false;
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
