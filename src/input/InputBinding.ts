import { Signal } from '#core/Signal';
import { getPreciseTime } from '#core/utils';

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

  /** Tap-window for `onTrigger`, in milliseconds — see the constructor's `options.threshold`. */
  private readonly _triggerThreshold: number;
  /**
   * Source-event timestamp ({@link ChannelEventBatch.timestamp}-compatible)
   * of the activation edge currently in progress. `null` while inactive, or
   * while active from a seed whose true activation time predates this
   * binding's own observation window and so is unknowable (see
   * `_seedUntouchedChannels`) — a `null` activation timestamp can never
   * produce an `onTrigger`, see `_applyEdge`.
   */
  private _activationTimestamp: number | null = null;
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
    this._triggerThreshold = options.threshold ?? InputBinding.defaultTriggerThreshold;
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

      // This path never replays an ordered batch history at all (see this
      // method's own doc comment) — every call is a live, single-instant
      // read, exactly like the pre-timestamp design, so "now" is always the
      // correct occurred-at for whatever edge this read reveals.
      this._replayOrEvaluate([], getPreciseTime());

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
        //
        // The seed's true activation time predates this binding's own
        // observation window and so is unknowable — pass `null` rather than
        // fabricating "now", so a release replayed below can never produce a
        // spurious `onTrigger` for a press this binding never actually saw.
        this._applyEdge(null);
      }
    }

    this._replayOrEvaluate(relevant, getPreciseTime());
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
   * `onActive` is a final-frame-state signal, not a per-crossing one: it
   * fires at most ONCE per call, unconditionally, iff this binding is active
   * once every edge for this call has been processed — never once per
   * individual crossing into the active state, which would over-fire for a
   * source that presses, releases, and presses again within one call (it
   * should read as one continuous active session by the time this call
   * returns, not two), and never at all for a source that presses and fully
   * releases again within the same call (it should never have appeared
   * active to a once-per-frame observer in the first place).
   */
  private _replayOrEvaluate(batches: readonly ChannelEventBatch[], fallbackTimestamp: number): void {
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
      this._applyEdge(batch.timestamp);
    }

    if (!anyEdgeChecked) {
      this._applyEdge(fallbackTimestamp);
    }

    if (this._value !== 0) {
      this.onActive.dispatch(this._value);
    }
  }

  /**
   * Recompute the aggregate value from `_channelValues` and dispatch a
   * transition only on a REAL crossing — `onStart` on 0 → nonzero, `onStop`
   * on nonzero → 0. A value that stays on the same side of zero (still
   * active, still inactive) dispatches nothing here; see
   * {@link _replayOrEvaluate} for the once-per-call `onActive`
   * final-state signal that covers that case instead.
   *
   * `onTrigger` fires on the release edge only when both the activation and
   * this release carry a known, real source-event `occurredAt` (see
   * `_activationTimestamp`'s doc comment) AND their difference is within the
   * tap threshold — measured against the source events' own timestamps, not
   * however long replaying them happened to take, so two old batches
   * replayed back-to-back in one call are judged by how far apart they
   * REALLY occurred, not by the microseconds this call took to run.
   *
   * @param occurredAt the real source-event time this edge check corresponds
   * to, or `null` when it originates from a seeded baseline with no known
   * real activation time.
   */
  private _applyEdge(occurredAt: number | null): void {
    const wasActive = this._value !== 0;
    let value = 0;

    for (let i = 0; i < this._channelValues.length; i++) {
      const channelValue = this._channelValues[i] ?? 0;

      if (Math.abs(channelValue) > Math.abs(value)) {
        value = channelValue;
      }
    }

    this._value = value;

    if (!wasActive && value !== 0) {
      this._activationTimestamp = occurredAt;
      this.onStart.dispatch(value);

      return;
    }

    if (wasActive && value === 0) {
      this.onStop.dispatch(0);

      const activatedAt = this._activationTimestamp;
      const duration = activatedAt !== null && occurredAt !== null ? occurredAt - activatedAt : -1;

      if (duration >= 0 && duration < this._triggerThreshold) {
        this.onTrigger.dispatch(0);
      }

      this._activationTimestamp = null;
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
    this.onStart.destroy();
    this.onActive.destroy();
    this.onStop.destroy();
    this.onTrigger.destroy();
  }
}
