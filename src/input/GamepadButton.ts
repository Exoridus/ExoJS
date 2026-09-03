import { clamp } from '#math/utils';

import { ChannelOffset } from './types';

declare const gamepadButtonChannelBrand: unique symbol;

/**
 * Branded literal-union type identifying a canonical button-style gamepad
 * input channel. Members are absolute offsets into the engine's shared
 * {@link Float32Array} input channel buffer (relative to slot 0): the 24
 * named buttons (`South`-`Paddle4`), computed as `ChannelOffset.Gamepads +
 * 0..23` (512..535 with the default layout - `ChannelSize.Category = 256`,
 * `Gamepads = 2 * Category = 512`).
 *
 * Offsets 24..31 of the button section are reserved in the channel buffer
 * layout but deliberately excluded from this type: they carry no
 * {@link InputToken}, so a binding built from one would type-check and read
 * back with `InputSystem`/`Gamepad`, then throw a plain `Error` the moment it
 * was serialized (`ActionMap.serializeBindings`) or checked for a conflict
 * (`ActionMap.conflicts`). A custom `GamepadMapping` that genuinely needs one
 * of those offsets has to say so with an explicit cast, which is the point -
 * it opts into a channel this type otherwise refuses to hand out.
 *
 * The brand keeps the type system from confusing button channels with
 * {@link GamepadAxisChannel} or raw `number`s during mapping authoring.
 * User code does not construct values of this type directly - read them
 * from the {@link GamepadButton} namespace (`GamepadButton.South`, ...).
 *
 * @internal
 */
export type GamepadButtonChannel = (
  512 | 513 | 514 | 515 | 516 | 517 | 518 | 519 | 520 | 521 | 522 | 523 | 524 | 525 | 526 | 527 | 528 | 529 | 530 | 531 | 532 | 533 | 534 | 535
) & { readonly [gamepadButtonChannelBrand]: void };

/** Construction options for a {@link GamepadButton}. */
export interface GamepadButtonOptions {
  /** Negate the raw value before threshold comparison. Default `false`. */
  invert?: boolean;
  /** Activation threshold in 0..1 - values at or below this read as 0 (deadzone). Default 0.2. */
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

/**
 * Channel-identifier constants - same convention as `Pointer.X` /
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
  /**
   * Share / Create button.
   *
   * Written by {@link XboxGamepadMapping} (Xbox Series pads). On PlayStation
   * pads the Share/Create button reports as {@link Select} instead - the
   * browser puts it on the standard Back/Select slot.
   */
  export const Share = button(17);
  /**
   * Capture / Screenshot button.
   *
   * Written by {@link SwitchProGamepadMapping} and, as the closest semantic
   * match for its Quick Access button, {@link SteamDeckGamepadMapping}.
   */
  export const Capture = button(18);
  /**
   * Touchpad **click**.
   *
   * Written by {@link PlayStationGamepadMapping} (DualShock 4, DualSense).
   * Finger coordinates are a separate matter - see `GamepadAxis.TouchpadX`.
   */
  export const Touchpad = button(19);
  /**
   * First paddle / extra button.
   *
   * Upper-left slot - SDL's `SDL_GAMEPAD_BUTTON_LEFT_PADDLE1`.
   *
   * Written by {@link SteamDeckGamepadMapping} (L4) and by
   * {@link JoyConLeftGamepadMapping} (the SL rail button - see that class for
   * why a rail button is a paddle rather than a shoulder). Xbox Elite paddles
   * do **not** reach this channel: the Windows path is XInput, whose
   * `XINPUT_GAMEPAD` struct carries no paddle bits, and no browser mapper
   * emits them. Reaching them needs WebHID and a custom `GamepadDefinition`.
   */
  export const Paddle1 = button(20);
  /**
   * Second paddle / extra button.
   *
   * Upper-right slot - SDL's `SDL_GAMEPAD_BUTTON_RIGHT_PADDLE1`.
   *
   * Written by {@link SteamDeckGamepadMapping} (R4) and by
   * {@link JoyConRightGamepadMapping} (the SR rail button) - see
   * {@link Paddle1} for why Xbox Elite paddles are absent.
   */
  export const Paddle2 = button(21);
  /**
   * Third paddle / extra button.
   *
   * Lower-left slot - SDL's `SDL_GAMEPAD_BUTTON_LEFT_PADDLE2`.
   *
   * Written by {@link SteamDeckGamepadMapping} (L5) and by
   * {@link JoyConLeftGamepadMapping} (the SR rail button) - see
   * {@link Paddle1} for why Xbox Elite paddles are absent.
   */
  export const Paddle3 = button(22);
  /**
   * Fourth paddle / extra button.
   *
   * Lower-right slot - SDL's `SDL_GAMEPAD_BUTTON_RIGHT_PADDLE2`.
   *
   * Written by {@link SteamDeckGamepadMapping} (R5) and by
   * {@link JoyConRightGamepadMapping} (the SL rail button) - see
   * {@link Paddle1} for why Xbox Elite paddles are absent.
   */
  export const Paddle4 = button(23);
  // Offsets 24..31 reserved for future named buttons; not part of
  // GamepadButtonChannel until each one has an InputToken - see that type's
  // own doc comment.
}
