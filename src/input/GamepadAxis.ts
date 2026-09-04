import { clamp } from '#math/utils';

import type { GamepadButtonChannel } from './GamepadButton';
import { ChannelOffset } from './types';

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
 * User code does not construct values of this type directly - read them
 * from the {@link GamepadAxis} namespace (`GamepadAxis.LeftStickLeft`, ...).
 */
export type GamepadAxisChannel = (
  | 544
  | 545
  | 546
  | 547
  | 548
  | 549
  | 550
  | 551
  | 552
  | 553
  | 554
  | 555
  | 556
  | 557
  | 558
  | 559
  | 560
  | 561
  | 562
  | 563
  | 564
  | 565
  | 566
  | 567
  | 568
  | 569
  | 570
  | 571
  | 572
  | 573
  | 574
  | 575
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
   * Deadzone radius, 0..1. Input at or below it reads as 0; input past it is
   * rescaled so the channel still ramps from 0 to full travel rather than
   * jumping straight to the deadzone magnitude. Default 0.2.
   */
  threshold?: number;
  /**
   * Use a symmetric (absolute-value) deadzone that preserves sign, instead of
   * the one-sided `value > threshold` check used for unipolar 0..1 axes. Used
   * for aggregate signed channels (`LeftStickX`, `LeftStickY`, ...) that need
   * the full [-1, +1] range, with values on either side of zero passing once
   * past `threshold`.
   * Default `false`.
   */
  bipolar?: boolean;
  /**
   * Raw `Gamepad.axes[]` index of the axis this one forms a 2D stick with -
   * the Y index on an X axis and vice versa. Set on both halves of a stick so
   * the deadzone is evaluated on the pair's radius instead of each axis on its
   * own; see {@link GamepadAxis.transformValue}. Leave unset for a control
   * with no second dimension (a trigger reported through `axes[]`, a
   * standalone auxiliary axis).
   */
  pair?: number;
}

/**
 * Single mappable analog axis on a physical gamepad. Holds the raw browser
 * `Gamepad.axes[]` index, the canonical channel the value is written to, and
 * the transform pipeline applied each frame by {@link transformValue}.
 *
 * Direction-split axis channels (e.g. `LeftStickLeft`, `LeftStickRight`)
 * live in the 0..1 range - set `invert: true` on the negative half so it
 * reads positive when pushed in its direction.
 *
 * Aggregate channels (e.g. `LeftStickX`, `LeftStickY`) live in the full
 * -1..1 range - set `bipolar: true` to preserve sign through the pipeline.
 *
 * The static namespace exports (`GamepadAxis.LeftStickLeft`,
 * `.LeftStickX`, ...) carry the canonical channel offsets used to address
 * each axis. `channel` can also target a {@link GamepadButtonChannel} -
 * some devices report an inherently analog, button-shaped control (a
 * trigger) through the raw `axes[]` array rather than `buttons[]`; routing
 * such an axis at the canonical trigger channel keeps app code that binds
 * `GamepadButton.LeftTrigger`/`RightTrigger` portable across devices
 * regardless of which raw array the hardware happens to report through.
 */
export class GamepadAxis {
  public readonly index: number;
  public readonly channel: GamepadAxisChannel | GamepadButtonChannel;
  public readonly invert: boolean;
  public readonly normalize: boolean;
  public readonly threshold: number;
  public readonly bipolar: boolean;
  /** Raw axis index of this axis's stick partner, or `null` for a one-dimensional control. See {@link GamepadAxisOptions.pair}. */
  public readonly pair: number | null;

  public constructor(index: number, channel: GamepadAxisChannel | GamepadButtonChannel, options: GamepadAxisOptions = {}) {
    this.index = index;
    this.channel = channel;
    this.invert = options.invert ?? false;
    this.normalize = options.normalize ?? false;
    this.threshold = clamp(options.threshold ?? 0.2, 0, 1);
    this.bipolar = options.bipolar ?? false;
    this.pair = options.pair ?? null;
  }

  /**
   * Apply the axis transform pipeline to a raw browser axis value (typically
   * `Gamepad.axes[i]`, in -1..1). `pairValue` is the raw value of the axis at
   * {@link pair} for the same poll, and is ignored when this axis has no
   * partner.
   *
   * The deadzone is radial, never per-axis: a stick's two raw components are
   * judged together on their radius, and everything past that radius is
   * rescaled so the channel ramps from 0 at the deadzone edge to full travel
   * at the rim. Per-axis deadzones are what produce the two artefacts this
   * avoids - a jump to `threshold`'s magnitude the instant the stick leaves
   * the deadzone, and a square response curve where a diagonal reads further
   * than a cardinal push of the same physical deflection. The scaled radius is
   * capped at 1, so hardware that reports a square gate (`x = y = 1`) still
   * lands on the unit circle with its direction intact rather than
   * overshooting.
   *
   * A one-dimensional control (a trigger reported through `axes[]`, a
   * standalone auxiliary axis) gets the same rescaled deadzone applied to its
   * own magnitude, in the channel's own domain - i.e. after {@link normalize}
   * has moved a trigger's rest position from -1 to 0, so the deadzone covers
   * the bottom of the pull rather than the middle of it.
   *
   * Pipeline: clamp to [-1, 1] → radial deadzone (paired axes) → optional
   * invert → optional normalize to [0, 1] → scalar deadzone (unpaired axes) →
   * range clamp. A `bipolar` channel keeps the full [-1, +1] range; every
   * other channel is unipolar and clamps to [0, 1].
   */
  public transformValue(value: number, pairValue = 0): number {
    let result = clamp(value, -1, 1);

    if (this.pair !== null) {
      result = applyDeadzone(result, Math.hypot(result, clamp(pairValue, -1, 1)), this.threshold);
    }

    if (this.invert) {
      result *= -1;
    }

    if (this.normalize) {
      result = (result + 1) / 2;
    }

    if (this.pair === null) {
      result = applyDeadzone(result, Math.abs(result), this.threshold);
    }

    return this.bipolar ? clamp(result, -1, 1) : clamp(result, 0, 1);
  }
}

/**
 * Scale `component` by the deadzone response of `magnitude` - the radius of
 * the whole control the component belongs to, which for a stick spans both of
 * its axes and for a one-dimensional control is just `|component|`. Returns 0
 * inside the deadzone; outside it, remaps `(threshold, 1]` onto `(0, 1]` so
 * there is no step at the edge, capping the radius at 1 so a magnitude beyond
 * the rim shortens to the unit circle instead of amplifying the component.
 */
const applyDeadzone = (component: number, magnitude: number, threshold: number): number => {
  // Capped before the comparison, not after: a square-gated stick reports a
  // radius up to sqrt(2), and `threshold` may itself be 1 (nothing passes).
  const radius = Math.min(magnitude, 1);

  if (radius <= threshold) {
    return 0;
  }

  return (component / magnitude) * ((radius - threshold) / (1 - threshold));
};

const axis = (offset: number): GamepadAxisChannel => (ChannelOffset.Gamepads + offset) as GamepadAxisChannel;

/**
 * Channel-identifier constants. The axis section starts after the 32-slot
 * button block: 24 named axes (offsets 32..55) plus 8 reserved slots
 * (offsets 56..63).
 */
export namespace GamepadAxis {
  // Direction-split (0..1, "buttons-style").
  export const LeftStickLeft = axis(32);
  export const LeftStickRight = axis(33);
  export const LeftStickUp = axis(34);
  export const LeftStickDown = axis(35);
  export const RightStickLeft = axis(36);
  export const RightStickRight = axis(37);
  export const RightStickUp = axis(38);
  export const RightStickDown = axis(39);

  // Aggregate (-1..1, "stick-style").
  /** Signed left-stick X axis (-1..1). Negative = left, positive = right. */
  export const LeftStickX = axis(40);
  /** Signed left-stick Y axis (-1..1). Negative = up (screen-up), positive = down. */
  export const LeftStickY = axis(41);
  /** Signed right-stick X axis (-1..1). */
  export const RightStickX = axis(42);
  /** Signed right-stick Y axis (-1..1). */
  export const RightStickY = axis(43);

  // Touchpad XY - device-specific, written by no built-in mapping.
  //
  // The Gamepad API does not carry touchpad coordinates: its standard axis set
  // stops after the two sticks, and browsers model a touchpad as a *button*
  // (the click) rather than an axis pair. These four channels exist for custom
  // `GamepadDefinition`s that source finger positions elsewhere - WebHID being
  // the practical route - and stay at 0 otherwise. The touchpad click itself
  // is a real channel: see `GamepadButton.Touchpad`.
  /**
   * Primary touchpad X (0..1, left to right).
   *
   * Device-specific: no built-in mapping writes this channel.
   */
  export const TouchpadX = axis(44);
  /**
   * Primary touchpad Y (0..1, top to bottom).
   *
   * Device-specific: no built-in mapping writes this channel.
   */
  export const TouchpadY = axis(45);
  /**
   * Secondary touchpad X (0..1) on dual-touchpad hardware.
   *
   * Device-specific: no built-in mapping writes this channel.
   */
  export const Touchpad2X = axis(46);
  /**
   * Secondary touchpad Y (0..1) on dual-touchpad hardware.
   *
   * Device-specific: no built-in mapping writes this channel.
   */
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
