import { GamepadAxis } from './GamepadAxis';
import { GamepadButton } from './GamepadButton';
import { GamepadMapping, GamepadMappingFamily } from './GamepadMapping';

/**
 * Mapping for the Nintendo Joy-Con (L) held horizontally as a solo controller.
 *
 * Declares only channels that physically exist on the device — one stick
 * (mapped to {@link GamepadAxis.LeftStickX} / `LeftStickY` and the
 * direction-split equivalents), four face buttons, the L and ZL outer
 * shoulders, the SL/SR rail buttons, Minus, the Capture button, and the
 * stick-click.
 *
 * The SL/SR rail buttons take paddle channels rather than the standard
 * shoulder channels, which belong to the physical L and ZL. Naming the
 * channel after the physical button is what keeps
 * {@link GamepadPromptLayouts} honest: it renders `LeftShoulder` as "L" and
 * `LeftTrigger` as "ZL", so a prompt only points at the right button when
 * those channels carry the buttons that are actually labelled that way. Which
 * of them is comfortable in the horizontal solo grip is a question for the
 * game's binding layer, which can tell a solo Joy-Con apart through
 * {@link GamepadMapping.hasChannel}.
 *
 * The specific slots follow SDL, whose `SDL_GamepadButton` documentation
 * assigns the Joy-Con rail buttons by the hand they sit under rather than by
 * grip: left SL is `SDL_GAMEPAD_BUTTON_LEFT_PADDLE1` (upper left, this
 * engine's {@link GamepadButton.Paddle1}) and left SR is `LEFT_PADDLE2`
 * (lower left, {@link GamepadButton.Paddle3}). Because
 * {@link JoyConRightGamepadMapping} takes the two right-hand slots, a pair of
 * solo Joy-Cons never collides on a paddle channel.
 *
 * Right-stick channels, Plus/Home, Touchpad, and auxiliary axes are
 * intentionally absent. Use {@link GamepadMapping.hasChannel} to detect
 * availability before binding inputs that may not exist on every device
 * family.
 *
 * Button indices are verified against hardware (Chromium on Windows,
 * Bluetooth, `057e:2006`), which reports the pad as `mapping: "standard"`
 * with 17 buttons and 2 axes.
 */
export class JoyConLeftGamepadMapping extends GamepadMapping {
  public readonly family = GamepadMappingFamily.JoyConLeft;

  public constructor() {
    super(
      [
        new GamepadButton(0, GamepadButton.South),
        new GamepadButton(1, GamepadButton.East),
        new GamepadButton(2, GamepadButton.West),
        new GamepadButton(3, GamepadButton.North),
        // Inner SL/SR rail buttons — paddles, not shoulders (see class doc).
        new GamepadButton(4, GamepadButton.Paddle1), // SL — upper-left paddle slot
        new GamepadButton(5, GamepadButton.Paddle3), // SR — lower-left paddle slot
        new GamepadButton(6, GamepadButton.LeftTrigger), // ZL
        new GamepadButton(8, GamepadButton.LeftShoulder), // L
        new GamepadButton(9, GamepadButton.Select), // Minus
        new GamepadButton(10, GamepadButton.LeftStick), // stick click
        new GamepadButton(16, GamepadButton.Capture),
      ],
      [
        // Single physical stick — surfaced through the LeftStick channels so
        // gamepad-agnostic code that binds to "the stick" works regardless of
        // which Joy-Con is held.
        new GamepadAxis(0, GamepadAxis.LeftStickLeft, { invert: true, pair: 1 }),
        new GamepadAxis(0, GamepadAxis.LeftStickRight, { pair: 1 }),
        new GamepadAxis(1, GamepadAxis.LeftStickUp, { invert: true, pair: 0 }),
        new GamepadAxis(1, GamepadAxis.LeftStickDown, { pair: 0 }),
        new GamepadAxis(0, GamepadAxis.LeftStickX, { bipolar: true, pair: 1 }),
        new GamepadAxis(1, GamepadAxis.LeftStickY, { bipolar: true, pair: 0 }),
      ],
    );
  }
}
