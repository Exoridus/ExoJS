import { GamepadAxis } from './GamepadAxis';
import { GamepadButton } from './GamepadButton';
import { GamepadMapping, GamepadMappingFamily } from './GamepadMapping';

/**
 * Mapping for the Nintendo Joy-Con (R) held horizontally as a solo controller.
 *
 * Declares only channels that physically exist on the device — one stick
 * (mapped to the LeftStick channels to match the W3C standard layout for the
 * lone reported stick regardless of which Joy-Con reports it), four face
 * buttons, the R and ZR outer shoulders, the SL/SR rail buttons, Plus, the
 * Home button, and the stick-click.
 *
 * The SL/SR rail buttons take paddle channels for the reason spelled out on
 * {@link JoyConLeftGamepadMapping} — the standard shoulder channels belong to
 * the physical R and ZR, because {@link GamepadPromptLayouts} derives the
 * button glyph from the channel. Following SDL, this pad takes the two
 * right-hand slots: SR is `SDL_GAMEPAD_BUTTON_RIGHT_PADDLE1` (upper right,
 * this engine's {@link GamepadButton.Paddle2}) and SL is `RIGHT_PADDLE2`
 * (lower right, {@link GamepadButton.Paddle4}). The left half takes the
 * left-hand slots, so a pair of solo Joy-Cons never collides.
 *
 * Right-stick channels, Minus/Capture, Touchpad, and auxiliary axes are
 * intentionally absent. Use {@link GamepadMapping.hasChannel} to detect
 * availability before binding inputs that may not exist on every device
 * family.
 *
 * Button indices are verified against hardware (Chromium on Windows,
 * Bluetooth, `057e:2007`), which reports the pad as `mapping: "standard"`
 * with 17 buttons and 2 axes.
 */
export class JoyConRightGamepadMapping extends GamepadMapping {
  public readonly family = GamepadMappingFamily.JoyConRight;

  public constructor() {
    super(
      [
        new GamepadButton(0, GamepadButton.South),
        new GamepadButton(1, GamepadButton.East),
        new GamepadButton(2, GamepadButton.West),
        new GamepadButton(3, GamepadButton.North),
        // Inner SL/SR rail buttons — paddles, not shoulders (see class doc).
        new GamepadButton(4, GamepadButton.Paddle4), // SL — lower-right paddle slot
        new GamepadButton(5, GamepadButton.Paddle2), // SR — upper-right paddle slot
        new GamepadButton(7, GamepadButton.RightTrigger), // ZR
        new GamepadButton(8, GamepadButton.RightShoulder), // R
        new GamepadButton(9, GamepadButton.Start), // Plus
        new GamepadButton(10, GamepadButton.LeftStick), // stick click
        new GamepadButton(16, GamepadButton.Guide), // Home
      ],
      [
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
