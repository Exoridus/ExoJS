import { GamepadAxis } from './GamepadAxis';
import { GamepadButton } from './GamepadButton';
import { GamepadMapping, GamepadMappingFamily } from './GamepadMapping';

/**
 * Mapping for the Nintendo Joy-Con (L) held horizontally as a solo controller.
 *
 * Declares only channels that physically exist on the device — one stick
 * (mapped to {@link GamepadAxis.LeftStickX} / `LeftStickY` and the
 * direction-split equivalents), four face buttons, the SL/SR inner shoulders
 * (routed through the standard shoulder channels), Minus, the Capture
 * button, and the stick-click.
 *
 * Right-stick channels, triggers, Plus/Home, Touchpad, paddles, and
 * auxiliary axes are intentionally absent. Use
 * {@link GamepadMapping.hasChannel} to detect availability before binding
 * inputs that may not exist on every device family.
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
        // Inner SL/SR shoulders — routed through the standard shoulder channels.
        new GamepadButton(4, GamepadButton.LeftShoulder),
        new GamepadButton(5, GamepadButton.RightShoulder),
        new GamepadButton(8, GamepadButton.Select), // Minus
        new GamepadButton(10, GamepadButton.LeftStick), // stick click
        new GamepadButton(16, GamepadButton.Capture),
      ],
      [
        // Single physical stick — surfaced through the LeftStick channels so
        // gamepad-agnostic code that binds to "the stick" works regardless of
        // which Joy-Con is held.
        new GamepadAxis(0, GamepadAxis.LeftStickLeft, { invert: true }),
        new GamepadAxis(0, GamepadAxis.LeftStickRight),
        new GamepadAxis(1, GamepadAxis.LeftStickUp, { invert: true }),
        new GamepadAxis(1, GamepadAxis.LeftStickDown),
        new GamepadAxis(0, GamepadAxis.LeftStickX, { bipolar: true }),
        new GamepadAxis(1, GamepadAxis.LeftStickY, { bipolar: true }),
      ],
    );
  }
}
