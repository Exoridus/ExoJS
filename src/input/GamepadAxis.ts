import { clamp } from '@/math/utils';
import { ChannelOffset } from '@/input/types';

declare const gamepadAxisChannelBrand: unique symbol;

/**
 * Branded literal-union type identifying a canonical analog axis-style
 * gamepad input channel. Members are absolute offsets into the engine's
 * shared {@link Float32Array} input channel buffer (relative to slot 0):
 * the 32 slots reserved for a gamepad slot's axis section, computed as
 * `ChannelOffset.Gamepads + 32..63` (544..575 with the default layout).
 *
 * The 24 named axes (sticks split + signed aggregates + dual touchpad XY +
 * 4 auxiliary bipolar) cover offsets 32..55; offsets 56..63 are reserved
 * for forward-compat / custom-mapping use and remain part of this type so
 * custom `GamepadMapping` subclasses can address them without casting.
 *
 * The brand keeps the type system from confusing axis channels with
 * {@link GamepadButtonChannel} or raw `number`s during mapping authoring.
 * User code does not construct values of this type directly — read them
 * from the {@link GamepadAxis} namespace (`GamepadAxis.LeftStickLeft`, ...).
 *
 * @internal
 */
export type GamepadAxisChannel = (
    | 544 | 545 | 546 | 547 | 548 | 549 | 550 | 551
    | 552 | 553 | 554 | 555 | 556 | 557 | 558 | 559
    | 560 | 561 | 562 | 563 | 564 | 565 | 566 | 567
    | 568 | 569 | 570 | 571 | 572 | 573 | 574 | 575
) & { readonly [gamepadAxisChannelBrand]: void };

/** Construction options for a {@link GamepadAxis}. */
export interface GamepadAxisOptions {
    /** Negate the raw value before further processing. Default `false`. */
    invert?: boolean;
    /**
     * Convert from bipolar [-1, +1] to unipolar [0, 1] via `(v + 1) / 2`.
     * Used for direction-split channels where each direction reads 0..1.
     * Default `false`.
     */
    normalize?: boolean;
    /**
     * Activation threshold (deadzone). After the invert/normalize pipeline,
     * any value at or below this reads as 0. Default 0.2.
     */
    threshold?: number;
    /**
     * Skip the deadzone clamp. Used for aggregate signed channels
     * (`LeftStickX`, `LeftStickY`, ...) that need to preserve the full
     * [-1, +1] range and apply their own deadzone client-side.
     * Default `false`.
     */
    bipolar?: boolean;
}

/**
 * Single mappable analog axis on a physical gamepad. Holds the raw browser
 * `Gamepad.axes[]` index, the canonical channel the value is written to, and
 * the transform pipeline applied each frame by {@link transformValue}.
 *
 * Direction-split axis channels (e.g. `LeftStickLeft`, `LeftStickRight`)
 * live in the 0..1 range — set `invert: true` on the negative half so it
 * reads positive when pushed in its direction.
 *
 * Aggregate channels (e.g. `LeftStickX`, `LeftStickY`) live in the full
 * -1..1 range — set `bipolar: true` to preserve sign through the pipeline.
 *
 * The static namespace exports (`GamepadAxis.LeftStickLeft`,
 * `.LeftStickX`, ...) carry the canonical channel offsets used to address
 * each axis.
 */
export class GamepadAxis {
    public readonly index: number;
    public readonly channel: GamepadAxisChannel;
    public readonly invert: boolean;
    public readonly normalize: boolean;
    public readonly threshold: number;
    public readonly bipolar: boolean;

    public constructor(index: number, channel: GamepadAxisChannel, options: GamepadAxisOptions = {}) {
        this.index = index;
        this.channel = channel;
        this.invert = options.invert ?? false;
        this.normalize = options.normalize ?? false;
        this.threshold = clamp(options.threshold ?? 0.2, 0, 1);
        this.bipolar = options.bipolar ?? false;
    }

    /**
     * Apply the axis transform pipeline to a raw browser axis value
     * (typically `Gamepad.axes[i]`, in -1..1).
     *
     * Pipeline: clamp to [-1, 1] → optional invert → optional normalize to
     * [0, 1] → bipolar passthrough OR deadzone (returns 0 when the absolute
     * value is at or below `threshold`).
     */
    public transformValue(value: number): number {
        let result = clamp(value, -1, 1);

        if (this.invert) {
            result *= -1;
        }

        if (this.normalize) {
            result = (result + 1) / 2;
        }

        if (this.bipolar) {
            return Math.abs(result) > this.threshold ? result : 0;
        }

        return result > this.threshold ? result : 0;
    }
}

const axis = (offset: number): GamepadAxisChannel => (ChannelOffset.Gamepads + offset) as GamepadAxisChannel;

/* eslint-disable @typescript-eslint/no-namespace, @typescript-eslint/naming-convention */
/**
 * Channel-identifier constants. The axis section starts after the 32-slot
 * button block: 24 named axes (offsets 32..55) plus 8 reserved slots
 * (offsets 56..63).
 */
export namespace GamepadAxis {
    // Direction-split (0..1, "buttons-style").
    export const LeftStickLeft   = axis(32);
    export const LeftStickRight  = axis(33);
    export const LeftStickUp     = axis(34);
    export const LeftStickDown   = axis(35);
    export const RightStickLeft  = axis(36);
    export const RightStickRight = axis(37);
    export const RightStickUp    = axis(38);
    export const RightStickDown  = axis(39);

    // Aggregate (-1..1, "stick-style").
    /** Signed left-stick X axis (-1..1). Negative = left, positive = right. */
    export const LeftStickX  = axis(40);
    /** Signed left-stick Y axis (-1..1). Negative = up (screen-up), positive = down. */
    export const LeftStickY  = axis(41);
    /** Signed right-stick X axis (-1..1). */
    export const RightStickX = axis(42);
    /** Signed right-stick Y axis (-1..1). */
    export const RightStickY = axis(43);

    // Touchpad XY (PlayStation 4/5, Steam Deck, dual-touchpad Steam-class hardware).
    /** Primary touchpad X (0..1, left to right). PlayStation, Steam Deck (left pad), Steam Controller. */
    export const TouchpadX  = axis(44);
    /** Primary touchpad Y (0..1, top to bottom). */
    export const TouchpadY  = axis(45);
    /** Secondary touchpad X (0..1). Steam Deck (right pad), other dual-touchpad hardware. */
    export const Touchpad2X = axis(46);
    /** Secondary touchpad Y (0..1). */
    export const Touchpad2Y = axis(47);

    // Auxiliary axes (4 bipolar axes split into 8 non-negative channels).
    export const AuxiliaryAxis0Negative = axis(48);
    export const AuxiliaryAxis0Positive = axis(49);
    export const AuxiliaryAxis1Negative = axis(50);
    export const AuxiliaryAxis1Positive = axis(51);
    export const AuxiliaryAxis2Negative = axis(52);
    export const AuxiliaryAxis2Positive = axis(53);
    export const AuxiliaryAxis3Negative = axis(54);
    export const AuxiliaryAxis3Positive = axis(55);
    // Offsets 56..63 reserved for future named axes / custom mapping use.
}
/* eslint-enable @typescript-eslint/no-namespace, @typescript-eslint/naming-convention */
