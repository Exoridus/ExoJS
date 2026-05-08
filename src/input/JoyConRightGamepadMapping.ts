import { GamepadAxis } from './GamepadAxis';
import { GamepadButton } from './GamepadButton';
import { GamepadMapping, GamepadMappingFamily } from './GamepadMapping';

/**
 * Mapping for the Nintendo Joy-Con (R) held horizontally as a solo controller.
 *
 * Declares only channels that physically exist on the device — one stick
 * (mapped to the LeftStick channels to match the W3C standard layout for the
 * lone reported stick regardless of which Joy-Con reports it), four face
 * buttons, the SL/SR inner shoulders (routed through the standard shoulder
 * channels), Plus, the Home button, and the stick-click.
 *
 * Right-stick channels, triggers, Minus/Capture, Touchpad, paddles, and
 * auxiliary axes are intentionally absent. Use
 * {@link GamepadMapping.hasChannel} to detect availability before binding
 * inputs that may not exist on every device family.
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
        new GamepadButton(4, GamepadButton.LeftShoulder),
        new GamepadButton(5, GamepadButton.RightShoulder),
        new GamepadButton(9, GamepadButton.Start), // Plus
        new GamepadButton(10, GamepadButton.LeftStick), // stick click
        new GamepadButton(16, GamepadButton.Guide), // Home
      ],
      [
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
