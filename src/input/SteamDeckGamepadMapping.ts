import { GamepadAxis } from './GamepadAxis';
import { GamepadButton } from './GamepadButton';
import { GamepadMapping, GamepadMappingFamily, GamepadMappingLayout } from './GamepadMapping';

/**
 * Mapping for the Valve Steam Deck (and the new Valve Controller via vendor
 * fallback) when its raw HID gamepad is exposed directly to the browser —
 * i.e. when Steam Input is *not* intercepting the device. With Steam Input
 * intercepting, the device appears as `28de:11ff` "Steam Virtual Gamepad"
 * with a standard W3C layout instead, and is routed to
 * {@link GenericDualAnalogGamepadMapping}.
 *
 * The raw layout is non-standard: face buttons live at indices 3-6 (not the
 * W3C-standard 0-3), the D-pad lives at indices 16-19, paddles at 20-23, and
 * triggers report as analog axes 8/9 rather than buttons 6/7. Indices are
 * derived from the Linux SDL_GameControllerDB entry for `Valve Steam Deck`.
 *
 * Because those indices are raw rather than W3C-standard, this mapping declares
 * {@link GamepadMappingLayout.Raw}: should a browser ever report the same
 * device as `mapping: "standard"`, `resolveGamepadDefinition` discards this
 * layout in favour of the generic one rather than routing standard indices
 * through raw slots.
 */
export class SteamDeckGamepadMapping extends GamepadMapping {
  public readonly family: GamepadMappingFamily = GamepadMappingFamily.SteamDeck;

  public override readonly layout = GamepadMappingLayout.Raw;

  public constructor() {
    super(
      [
        // Quick Access (Steam Deck "..." button) → mapped to Capture as
        // the closest semantic match in the canonical channel set.
        new GamepadButton(2, GamepadButton.Capture),
        // Face cluster — non-standard offsets.
        new GamepadButton(3, GamepadButton.South),
        new GamepadButton(4, GamepadButton.East),
        new GamepadButton(5, GamepadButton.West),
        new GamepadButton(6, GamepadButton.North),
        new GamepadButton(7, GamepadButton.LeftShoulder),
        new GamepadButton(8, GamepadButton.RightShoulder),
        // View / Menu / Steam buttons.
        new GamepadButton(11, GamepadButton.Select),
        new GamepadButton(12, GamepadButton.Start),
        new GamepadButton(13, GamepadButton.Guide),
        // Stick clicks.
        new GamepadButton(14, GamepadButton.LeftStick),
        new GamepadButton(15, GamepadButton.RightStick),
        // D-pad.
        new GamepadButton(16, GamepadButton.DPadUp),
        new GamepadButton(17, GamepadButton.DPadDown),
        new GamepadButton(18, GamepadButton.DPadLeft),
        new GamepadButton(19, GamepadButton.DPadRight),
        // Back paddles. SDL labels them paddle1=R4, paddle2=L4,
        // paddle3=R5, paddle4=L5; we expose them in canonical
        // L4/R4/L5/R5 order via Paddle1..Paddle4.
        new GamepadButton(20, GamepadButton.Paddle2),
        new GamepadButton(21, GamepadButton.Paddle1),
        new GamepadButton(22, GamepadButton.Paddle4),
        new GamepadButton(23, GamepadButton.Paddle3),
      ],
      [
        // Sticks — direction-split (0..1).
        new GamepadAxis(0, GamepadAxis.LeftStickLeft, { invert: true, pair: 1 }),
        new GamepadAxis(0, GamepadAxis.LeftStickRight, { pair: 1 }),
        new GamepadAxis(1, GamepadAxis.LeftStickUp, { invert: true, pair: 0 }),
        new GamepadAxis(1, GamepadAxis.LeftStickDown, { pair: 0 }),
        new GamepadAxis(2, GamepadAxis.RightStickLeft, { invert: true, pair: 3 }),
        new GamepadAxis(2, GamepadAxis.RightStickRight, { pair: 3 }),
        new GamepadAxis(3, GamepadAxis.RightStickUp, { invert: true, pair: 2 }),
        new GamepadAxis(3, GamepadAxis.RightStickDown, { pair: 2 }),

        // Sticks — aggregate signed (-1..1).
        new GamepadAxis(0, GamepadAxis.LeftStickX, { bipolar: true, pair: 1 }),
        new GamepadAxis(1, GamepadAxis.LeftStickY, { bipolar: true, pair: 0 }),
        new GamepadAxis(2, GamepadAxis.RightStickX, { bipolar: true, pair: 3 }),
        new GamepadAxis(3, GamepadAxis.RightStickY, { bipolar: true, pair: 2 }),

        // Triggers as analog axes (Steam Deck reports them as a8/a9, not
        // buttons 6/7 the way a W3C-standard-mapped device would — raw
        // button index 8 is already claimed by RightShoulder above, so the
        // pull amount can only arrive via axes[]). They still route to the
        // SAME canonical GamepadButton.LeftTrigger/RightTrigger channels
        // every other family's triggers use, so `new
        // ButtonAction(GamepadButton.RightTrigger)` works uniformly
        // regardless of which raw array a given controller reports
        // through. Raw axes report -1..+1; normalize to 0..1 to match the
        // other families' 0..1 trigger pull range.
        new GamepadAxis(8, GamepadButton.RightTrigger, { normalize: true }),
        new GamepadAxis(9, GamepadButton.LeftTrigger, { normalize: true }),
      ],
    );
  }
}
