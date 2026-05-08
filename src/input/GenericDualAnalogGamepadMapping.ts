import { GamepadAxis } from './GamepadAxis';
import { GamepadButton } from './GamepadButton';
import { GamepadMapping, GamepadMappingFamily } from './GamepadMapping';

/**
 * Baseline mapping for dual-analog controllers that follow the standard
 * W3C Gamepad API layout (axes 0–3 for both sticks, axes 4–7 auxiliary).
 *
 * Each signed stick axis is exposed three ways for ergonomic binding:
 *  - Two direction-split, non-negative channels (e.g. `LeftStickLeft` /
 *    `LeftStickRight`) for "buttons-style" subscriptions.
 *  - One signed aggregate channel (e.g. `LeftStickX`) for direct -1..1
 *    consumption — useful for movement or aiming.
 *
 * Device-specific subclasses (Xbox, PlayStation, Switch Pro, etc.) inherit
 * this layout and override only {@link GamepadMapping.family}.
 */
export class GenericDualAnalogGamepadMapping extends GamepadMapping {
  public readonly family: GamepadMappingFamily = GamepadMappingFamily.GenericDualAnalog;

  public constructor() {
    super(
      [
        new GamepadButton(0, GamepadButton.South),
        new GamepadButton(1, GamepadButton.East),
        new GamepadButton(2, GamepadButton.West),
        new GamepadButton(3, GamepadButton.North),
        new GamepadButton(4, GamepadButton.LeftShoulder),
        new GamepadButton(5, GamepadButton.RightShoulder),
        new GamepadButton(6, GamepadButton.LeftTrigger),
        new GamepadButton(7, GamepadButton.RightTrigger),
        new GamepadButton(8, GamepadButton.Select),
        new GamepadButton(9, GamepadButton.Start),
        new GamepadButton(10, GamepadButton.LeftStick),
        new GamepadButton(11, GamepadButton.RightStick),
        new GamepadButton(12, GamepadButton.DPadUp),
        new GamepadButton(13, GamepadButton.DPadDown),
        new GamepadButton(14, GamepadButton.DPadLeft),
        new GamepadButton(15, GamepadButton.DPadRight),
        new GamepadButton(16, GamepadButton.Guide),
        new GamepadButton(17, GamepadButton.Share),
        new GamepadButton(18, GamepadButton.Capture),
        new GamepadButton(19, GamepadButton.Touchpad),
        new GamepadButton(20, GamepadButton.Paddle1),
      ],
      [
        // Direction-split (0..1).
        new GamepadAxis(0, GamepadAxis.LeftStickLeft, { invert: true }),
        new GamepadAxis(0, GamepadAxis.LeftStickRight),
        new GamepadAxis(1, GamepadAxis.LeftStickUp, { invert: true }),
        new GamepadAxis(1, GamepadAxis.LeftStickDown),
        new GamepadAxis(2, GamepadAxis.RightStickLeft, { invert: true }),
        new GamepadAxis(2, GamepadAxis.RightStickRight),
        new GamepadAxis(3, GamepadAxis.RightStickUp, { invert: true }),
        new GamepadAxis(3, GamepadAxis.RightStickDown),

        // Aggregate signed channels (-1..1).
        new GamepadAxis(0, GamepadAxis.LeftStickX, { bipolar: true }),
        new GamepadAxis(1, GamepadAxis.LeftStickY, { bipolar: true }),
        new GamepadAxis(2, GamepadAxis.RightStickX, { bipolar: true }),
        new GamepadAxis(3, GamepadAxis.RightStickY, { bipolar: true }),

        // Auxiliary axes (4 bipolar physical axes split into 8 half-channels).
        new GamepadAxis(4, GamepadAxis.AuxiliaryAxis0Negative, { invert: true }),
        new GamepadAxis(4, GamepadAxis.AuxiliaryAxis0Positive),
        new GamepadAxis(5, GamepadAxis.AuxiliaryAxis1Negative, { invert: true }),
        new GamepadAxis(5, GamepadAxis.AuxiliaryAxis1Positive),
        new GamepadAxis(6, GamepadAxis.AuxiliaryAxis2Negative, { invert: true }),
        new GamepadAxis(6, GamepadAxis.AuxiliaryAxis2Positive),
        new GamepadAxis(7, GamepadAxis.AuxiliaryAxis3Negative, { invert: true }),
        new GamepadAxis(7, GamepadAxis.AuxiliaryAxis3Positive),
      ],
    );
  }
}
