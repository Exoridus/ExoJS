import { Signal } from '@/core/Signal';
import { Timer } from '@/core/Timer';
import { milliseconds } from '@/core/utils';

import type { Keyboard } from '@/input/types';
import type { GamepadButtonChannel } from './GamepadButton';
import type { GamepadAxisChannel } from './GamepadAxis';

/** Channel a single {@link InputBinding} can subscribe to. */
export type InputChannel = GamepadButtonChannel | GamepadAxisChannel | Keyboard;

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

    public readonly channels: ReadonlyArray<number>;

    public readonly onStart   = new Signal<[number]>();
    public readonly onActive  = new Signal<[number]>();
    public readonly onStop    = new Signal<[number]>();
    public readonly onTrigger = new Signal<[number]>();

    private readonly _triggerTimer: Timer;
    private readonly _detacher: InternalChannelDetacher | null;
    private _value = 0;
    private _unbound = false;

    public constructor(
        channels: ReadonlyArray<number>,
        options: InputBindingOptions = {},
        detacher: InternalChannelDetacher | null = null,
    ) {
        this.channels = channels;
        this._triggerTimer = new Timer(milliseconds(options.threshold ?? InputBinding.defaultTriggerThreshold));
        this._detacher = detacher;
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
     * Read the latest values from the unified channel buffer and dispatch
     * the appropriate Signals. Called once per frame by the owning manager.
     *
     * @internal
     */
    public update(channels: Float32Array): void {
        if (this._unbound) {
            return;
        }

        let value = 0;

        for (const channel of this.channels) {
            const sample = channels[channel];

            if (Math.abs(sample) > Math.abs(value)) {
                value = sample;
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
