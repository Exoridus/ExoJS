import { clamp } from '#math/utils';

import { ChannelOffset } from './types';

declare const gamepadButtonChannelBrand: unique symbol;

/**
 * Branded literal-union type identifying a canonical button-style gamepad
 * input channel. Members are absolute offsets into the engine's shared
 * {@link Float32Array} input channel buffer (relative to slot 0): the 32
 * slots reserved for a gamepad slot's button section, computed as
 * `ChannelOffset.Gamepads + 0..31` (512..543 with the default layout —
 * `ChannelSize.Category = 256`, `Gamepads = 2 * Category = 512`).
 *
 * The 24 named buttons (`South`-`Paddle4`) cover offsets 0..23; offsets
 * 24..31 are reserved for forward-compat / custom-mapping use and remain
 * part of this type so custom `GamepadMapping` subclasses can address them
 * without casting.
 *
 * The brand keeps the type system from confusing button channels with
 * {@link GamepadAxisChannel} or raw `number`s during mapping authoring.
 * User code does not construct values of this type directly — read them
 * from the {@link GamepadButton} namespace (`GamepadButton.South`, ...).
 *
 * @internal
 */
export type GamepadButtonChannel = (
  | 512
  | 513
  | 514
  | 515
  | 516
  | 517
  | 518
  | 519
  | 520
  | 521
  | 522
  | 523
  | 524
  | 525
  | 526
  | 527
  | 528
  | 529
  | 530
  | 531
  | 532
  | 533
  | 534
  | 535
  | 536
  | 537
  | 538
  | 539
  | 540
  | 541
  | 542
  | 543
) & { readonly [gamepadButtonChannelBrand]: void };

/** Construction options for a {@link GamepadButton}. */
export interface GamepadButtonOptions {
  /** Negate the raw value before threshold comparison. Default `false`. */
  invert?: boolean;
  /** Activation threshold in 0..1 — values at or below this read as 0 (deadzone). Default 0.2. */
  threshold?: number;
}

/**
 * Single mappable button on a physical gamepad. Holds the raw browser
 * `Gamepad.buttons[]` index, the canonical channel the value is written to,
 * and the deadzone/inversion transform applied each frame by
 * {@link transformValue}.
 *
 * Used by concrete {@link GamepadMapping} subclasses to declare a device's
 * button layout. User code typically constructs these via
 * `new GamepadButton(rawIndex, GamepadButton.South)` only when authoring a
 * custom mapping.
 *
 * The static namespace exports (`GamepadButton.South`, `.East`, ...) carry
 * the canonical channel offsets used to address each button.
 */
export class GamepadButton {
  public readonly index: number;
  public readonly channel: GamepadButtonChannel;
  public readonly invert: boolean;
  public readonly threshold: number;

  public constructor(index: number, channel: GamepadButtonChannel, options: GamepadButtonOptions = {}) {
    this.index = index;
    this.channel = channel;
    this.invert = options.invert ?? false;
    this.threshold = clamp(options.threshold ?? 0.2, 0, 1);
  }

  /**
   * Apply the button's transform pipeline to a raw browser button value
   * (typically `Gamepad.buttons[i].value`, in 0..1).
   *
   * Pipeline: clamp to [0, 1] → optional invert → deadzone (returns 0 when
   * the result is at or below `threshold`).
   */
  public transformValue(value: number): number {
    let result = clamp(value, 0, 1);

    if (this.invert) {
      result = 1 - result;
    }

    return result > this.threshold ? result : 0;
  }
}

const button = (offset: number): GamepadButtonChannel => (ChannelOffset.Gamepads + offset) as GamepadButtonChannel;

/* eslint-disable @typescript-eslint/no-namespace, @typescript-eslint/naming-convention */
/**
 * Channel-identifier constants — same convention as `Pointer.X` /
 * `Keyboard.Space`. The first 32 slots of each gamepad sub-buffer are
 * reserved for buttons (24 named, 8 buffer for future / custom mappings).
 */
export namespace GamepadButton {
  /** Bottom face button. Xbox=A, PlayStation=✕, Switch (horizontal Joy-Con)=B. Conventional usage: confirm / primary action / jump. */
  export const South = button(0);
  /** Right face button. Xbox=B, PlayStation=○, Switch=A. Conventional usage: cancel / back / secondary. */
  export const East = button(1);
  /** Left face button. Xbox=X, PlayStation=□, Switch=Y. Conventional usage: tertiary action. */
  export const West = button(2);
  /** Top face button. Xbox=Y, PlayStation=△, Switch=X. Conventional usage: quaternary action. */
  export const North = button(3);
  export const LeftShoulder = button(4);
  export const RightShoulder = button(5);
  /** Left trigger as a button (analog 0..1 reported through the same channel). */
  export const LeftTrigger = button(6);
  /** Right trigger as a button. */
  export const RightTrigger = button(7);
  /** Select / Back / Minus button. */
  export const Select = button(8);
  /** Start / Options / Plus button. */
  export const Start = button(9);
  /** Left analog stick click (L3). */
  export const LeftStick = button(10);
  /** Right analog stick click (R3). */
  export const RightStick = button(11);
  export const DPadUp = button(12);
  export const DPadDown = button(13);
  export const DPadLeft = button(14);
  export const DPadRight = button(15);
  /** Home / Guide / PS button. */
  export const Guide = button(16);
  /** Share / Create button (PS4/PS5, Xbox Series). */
  export const Share = button(17);
  /** Capture / Screenshot button (Switch, Xbox Series). */
  export const Capture = button(18);
  /** Touchpad click (PlayStation). */
  export const Touchpad = button(19);
  /** First paddle / extra button (Xbox Elite, Steam Controller, PS5 Edge, Steam Deck L4). */
  export const Paddle1 = button(20);
  /** Second paddle / extra button (Xbox Elite, Steam Deck R4, PS5 Edge). */
  export const Paddle2 = button(21);
  /** Third paddle / extra button (Xbox Elite, Steam Deck L5). */
  export const Paddle3 = button(22);
  /** Fourth paddle / extra button (Xbox Elite, Steam Deck R5). */
  export const Paddle4 = button(23);
  // Offsets 24..31 reserved for future named buttons / custom mapping use.
}
/* eslint-enable @typescript-eslint/no-namespace, @typescript-eslint/naming-convention */
