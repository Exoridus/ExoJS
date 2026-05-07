import { Signal } from '@/core/Signal';
import { Timer } from '@/core/Timer';
import { milliseconds } from '@/core/utils';

import type { Keyboard } from '@/input/types';
import type { GamepadChannel } from './GamepadChannels';

/** Convenience options accepted by the {@link Input} constructor. */
interface InputOptions {
    onStart?: () => void;
    onStop?: () => void;
    onActive?: () => void;
    onTrigger?: () => void;
    context?: object;
    threshold?: number;
}

/** Union of channel identifiers an {@link Input} can subscribe to. */
export type InputChannel = GamepadChannel | Keyboard;

/**
 * Bind one or more input channels (keyboard keys, gamepad buttons, gamepad
 * axes) to a set of high-level events: `onStart` (became active),
 * `onStop` (became inactive), `onActive` (per-frame while active), and
 * `onTrigger` (released within the threshold window — a "tap"). The current
 * raw value is the max across all subscribed channels.
 *
 * Construct ad-hoc, or via {@link InputManager.add}. Driven by the
 * {@link InputManager} update loop which feeds the unified channel buffer.
 *
 * @example
 * ```ts
 * const jump = new Input([Keyboard.Space, GamepadChannel.FaceA], {
 *     onTrigger: () => player.jump(),
 * });
 * ```
 */
export class Input {
    public static triggerThreshold = 300;

    private readonly channels = new Set<number>();
    private readonly triggerTimer: Timer;
    private valueState = 0;

    public readonly onStart = new Signal<[number]>();
    public readonly onStop = new Signal<[number]>();
    public readonly onActive = new Signal<[number]>();
    public readonly onTrigger = new Signal<[number]>();

    public constructor(channels: Array<InputChannel> | InputChannel, { onStart, onStop, onActive, onTrigger, context, threshold }: InputOptions = {}) {
        this.channels = new Set(Array.isArray(channels) ? channels : [channels]);
        this.triggerTimer = new Timer(milliseconds(threshold ?? Input.triggerThreshold));

        if (onStart) {
            this.onStart.add(onStart, context);
        }

        if (onStop) {
            this.onStop.add(onStop, context);
        }

        if (onActive) {
            this.onActive.add(onActive, context);
        }

        if (onTrigger) {
            this.onTrigger.add(onTrigger, context);
        }
    }

    public get activeChannels(): Set<number> {
        return this.channels;
    }

    public get value(): number {
        return this.valueState;
    }

    /**
     * Read the latest values from the unified channel buffer and dispatch
     * the appropriate Signals. Called once per frame by {@link InputManager}.
     * No-op for inputs not bound to any channel.
     */
    public update(channels: Float32Array): this {
        this.valueState = 0;

        for (const channel of this.channels) {
            this.valueState = Math.max(channels[channel], this.valueState);
        }

        if (this.valueState) {
            if (!this.triggerTimer.running) {
                this.triggerTimer.restart();
                this.onStart.dispatch(this.valueState);
            }

            this.onActive.dispatch(this.valueState);
        } else if (this.triggerTimer.running) {
            this.onStop.dispatch(this.valueState);

            if (!this.triggerTimer.expired) {
                this.onTrigger.dispatch(this.valueState);
            }

            this.triggerTimer.stop();
        }

        return this;
    }

    public destroy(): void {
        this.channels.clear();
        this.triggerTimer.destroy();

        this.onStart.destroy();
        this.onStop.destroy();
        this.onActive.destroy();
        this.onTrigger.destroy();
    }
}
