import { GamepadAxis } from './GamepadAxis';
import { GamepadButton } from './GamepadButton';
import type { InputChannel } from './InputBinding';
import { Pointer } from './Pointer';
import { Keyboard, PointerButton } from './types';

/**
 * Stable, persistable identifier for one input control.
 *
 * A token is lowercase ASCII, uses `.` as the namespace separator and `-`
 * inside a name: `keyboard.space`, `keyboard.key-w`, `pointer.primary`,
 * `gamepad.button.south`, `gamepad.axis.left-stick-x`.
 *
 * Tokens are the only representation of a control that may be written to
 * disk or sent over a network. They deliberately carry no gamepad slot, no
 * browser device index, no enum number, no vendor name and no localized
 * label: a slot is runtime context (see {@link ActionMapOptions.gamepad}),
 * and everything else would change meaning between builds, browsers or
 * players.
 *
 * Keyboard tokens are the kebab-cased `KeyboardEvent.code` of the physical
 * key, so `keyboard.key-w` is the key an AZERTY keyboard prints "Z" on - the
 * same layout-independent identity {@link Keyboard} itself uses. The four
 * aggregate modifier channels have no `code` of their own and take the
 * unsided name (`keyboard.shift`).
 */
export type InputToken = string;

/**
 * Token to channel, canonical entries first.
 *
 * This table is the serialization contract. It is deliberately explicit data
 * rather than enum names stringified at runtime: a member rename must not
 * silently invalidate every profile a player has already saved, and the
 * `Keyboard` members are named after the US-QWERTY glyph rather than the
 * `code` spelling, so deriving from them would persist `keyboard.question-mark`
 * for the `/` key.
 */
const channelsByToken = new Map<InputToken, InputChannel>([
  ['keyboard.key-a', Keyboard.A],
  ['keyboard.key-b', Keyboard.B],
  ['keyboard.key-c', Keyboard.C],
  ['keyboard.key-d', Keyboard.D],
  ['keyboard.key-e', Keyboard.E],
  ['keyboard.key-f', Keyboard.F],
  ['keyboard.key-g', Keyboard.G],
  ['keyboard.key-h', Keyboard.H],
  ['keyboard.key-i', Keyboard.I],
  ['keyboard.key-j', Keyboard.J],
  ['keyboard.key-k', Keyboard.K],
  ['keyboard.key-l', Keyboard.L],
  ['keyboard.key-m', Keyboard.M],
  ['keyboard.key-n', Keyboard.N],
  ['keyboard.key-o', Keyboard.O],
  ['keyboard.key-p', Keyboard.P],
  ['keyboard.key-q', Keyboard.Q],
  ['keyboard.key-r', Keyboard.R],
  ['keyboard.key-s', Keyboard.S],
  ['keyboard.key-t', Keyboard.T],
  ['keyboard.key-u', Keyboard.U],
  ['keyboard.key-v', Keyboard.V],
  ['keyboard.key-w', Keyboard.W],
  ['keyboard.key-x', Keyboard.X],
  ['keyboard.key-y', Keyboard.Y],
  ['keyboard.key-z', Keyboard.Z],
  ['keyboard.digit-0', Keyboard.Zero],
  ['keyboard.digit-1', Keyboard.One],
  ['keyboard.digit-2', Keyboard.Two],
  ['keyboard.digit-3', Keyboard.Three],
  ['keyboard.digit-4', Keyboard.Four],
  ['keyboard.digit-5', Keyboard.Five],
  ['keyboard.digit-6', Keyboard.Six],
  ['keyboard.digit-7', Keyboard.Seven],
  ['keyboard.digit-8', Keyboard.Eight],
  ['keyboard.digit-9', Keyboard.Nine],
  ['keyboard.backquote', Keyboard.Tilde],
  ['keyboard.minus', Keyboard.Dash],
  ['keyboard.equal', Keyboard.Equals],
  ['keyboard.bracket-left', Keyboard.OpenBracket],
  ['keyboard.bracket-right', Keyboard.ClosedBracket],
  ['keyboard.backslash', Keyboard.BackwardSlash],
  ['keyboard.semicolon', Keyboard.Colon],
  ['keyboard.quote', Keyboard.Quotes],
  ['keyboard.comma', Keyboard.Comma],
  ['keyboard.period', Keyboard.Period],
  ['keyboard.slash', Keyboard.QuestionMark],
  ['keyboard.intl-backslash', Keyboard.IntlBackslash],
  ['keyboard.intl-ro', Keyboard.IntlRo],
  ['keyboard.intl-yen', Keyboard.IntlYen],
  ['keyboard.space', Keyboard.Space],
  ['keyboard.enter', Keyboard.Enter],
  ['keyboard.tab', Keyboard.Tab],
  ['keyboard.backspace', Keyboard.Backspace],
  ['keyboard.escape', Keyboard.Escape],
  ['keyboard.caps-lock', Keyboard.CapsLock],
  ['keyboard.context-menu', Keyboard.ContextMenu],
  ['keyboard.shift-left', Keyboard.ShiftLeft],
  ['keyboard.shift-right', Keyboard.ShiftRight],
  ['keyboard.control-left', Keyboard.ControlLeft],
  ['keyboard.control-right', Keyboard.ControlRight],
  ['keyboard.alt-left', Keyboard.AltLeft],
  ['keyboard.alt-right', Keyboard.AltRight],
  ['keyboard.meta-left', Keyboard.MetaLeft],
  ['keyboard.meta-right', Keyboard.MetaRight],
  ['keyboard.arrow-left', Keyboard.Left],
  ['keyboard.arrow-up', Keyboard.Up],
  ['keyboard.arrow-right', Keyboard.Right],
  ['keyboard.arrow-down', Keyboard.Down],
  ['keyboard.home', Keyboard.Home],
  ['keyboard.end', Keyboard.End],
  ['keyboard.page-up', Keyboard.PageUp],
  ['keyboard.page-down', Keyboard.PageDown],
  ['keyboard.insert', Keyboard.Insert],
  ['keyboard.delete', Keyboard.Delete],
  ['keyboard.help', Keyboard.Help],
  ['keyboard.print-screen', Keyboard.PrintScreen],
  ['keyboard.scroll-lock', Keyboard.ScrollLock],
  ['keyboard.pause', Keyboard.Pause],
  ['keyboard.num-lock', Keyboard.NumLock],
  ['keyboard.f-1', Keyboard.F1],
  ['keyboard.f-2', Keyboard.F2],
  ['keyboard.f-3', Keyboard.F3],
  ['keyboard.f-4', Keyboard.F4],
  ['keyboard.f-5', Keyboard.F5],
  ['keyboard.f-6', Keyboard.F6],
  ['keyboard.f-7', Keyboard.F7],
  ['keyboard.f-8', Keyboard.F8],
  ['keyboard.f-9', Keyboard.F9],
  ['keyboard.f-10', Keyboard.F10],
  ['keyboard.f-11', Keyboard.F11],
  ['keyboard.f-12', Keyboard.F12],
  ['keyboard.numpad-0', Keyboard.NumPad0],
  ['keyboard.numpad-1', Keyboard.NumPad1],
  ['keyboard.numpad-2', Keyboard.NumPad2],
  ['keyboard.numpad-3', Keyboard.NumPad3],
  ['keyboard.numpad-4', Keyboard.NumPad4],
  ['keyboard.numpad-5', Keyboard.NumPad5],
  ['keyboard.numpad-6', Keyboard.NumPad6],
  ['keyboard.numpad-7', Keyboard.NumPad7],
  ['keyboard.numpad-8', Keyboard.NumPad8],
  ['keyboard.numpad-9', Keyboard.NumPad9],
  ['keyboard.numpad-add', Keyboard.NumPadAdd],
  ['keyboard.numpad-subtract', Keyboard.NumPadSubtract],
  ['keyboard.numpad-multiply', Keyboard.NumPadMultiply],
  ['keyboard.numpad-divide', Keyboard.NumPadDivide],
  ['keyboard.numpad-decimal', Keyboard.NumPadDecimal],
  ['keyboard.numpad-enter', Keyboard.NumPadEnter],
  ['keyboard.numpad-equal', Keyboard.NumPadEqual],
  // Aggregate modifier channels. No `KeyboardEvent.code` addresses these -
  // they are written by `InputManager` alongside whichever side was pressed.
  ['keyboard.shift', Keyboard.Shift],
  ['keyboard.control', Keyboard.Control],
  ['keyboard.alt', Keyboard.Alt],
  ['keyboard.meta', Keyboard.Meta],

  ['pointer.primary', PointerButton.Primary],
  ['pointer.secondary', PointerButton.Secondary],
  ['pointer.auxiliary', PointerButton.Auxiliary],
  ['pointer.active', Pointer.Active],
  ['pointer.x', Pointer.X],
  ['pointer.y', Pointer.Y],
  ['pointer.pressure', Pointer.Pressure],
  ['pointer.width', Pointer.Width],
  ['pointer.height', Pointer.Height],
  ['pointer.twist', Pointer.Twist],
  ['pointer.tilt-x', Pointer.TiltX],
  ['pointer.tilt-y', Pointer.TiltY],
  ['pointer.is-mouse', Pointer.IsMouse],
  ['pointer.is-touch', Pointer.IsTouch],
  ['pointer.is-pen', Pointer.IsPen],
  ['pointer.is-primary', Pointer.IsPrimary],
  ['pointer.slot-0-active', Pointer.Slot0Active],
  ['pointer.slot-0-x', Pointer.Slot0X],
  ['pointer.slot-0-y', Pointer.Slot0Y],
  ['pointer.slot-1-active', Pointer.Slot1Active],
  ['pointer.slot-1-x', Pointer.Slot1X],
  ['pointer.slot-1-y', Pointer.Slot1Y],
  ['pointer.slot-2-active', Pointer.Slot2Active],
  ['pointer.slot-2-x', Pointer.Slot2X],
  ['pointer.slot-2-y', Pointer.Slot2Y],
  ['pointer.slot-3-active', Pointer.Slot3Active],
  ['pointer.slot-3-x', Pointer.Slot3X],
  ['pointer.slot-3-y', Pointer.Slot3Y],
  ['pointer.slot-4-active', Pointer.Slot4Active],
  ['pointer.slot-4-x', Pointer.Slot4X],
  ['pointer.slot-4-y', Pointer.Slot4Y],
  ['pointer.slot-5-active', Pointer.Slot5Active],
  ['pointer.slot-5-x', Pointer.Slot5X],
  ['pointer.slot-5-y', Pointer.Slot5Y],
  ['pointer.slot-6-active', Pointer.Slot6Active],
  ['pointer.slot-6-x', Pointer.Slot6X],
  ['pointer.slot-6-y', Pointer.Slot6Y],
  ['pointer.slot-7-active', Pointer.Slot7Active],
  ['pointer.slot-7-x', Pointer.Slot7X],
  ['pointer.slot-7-y', Pointer.Slot7Y],
  ['pointer.slot-8-active', Pointer.Slot8Active],
  ['pointer.slot-8-x', Pointer.Slot8X],
  ['pointer.slot-8-y', Pointer.Slot8Y],
  ['pointer.slot-9-active', Pointer.Slot9Active],
  ['pointer.slot-9-x', Pointer.Slot9X],
  ['pointer.slot-9-y', Pointer.Slot9Y],
  ['pointer.slot-10-active', Pointer.Slot10Active],
  ['pointer.slot-10-x', Pointer.Slot10X],
  ['pointer.slot-10-y', Pointer.Slot10Y],
  ['pointer.slot-11-active', Pointer.Slot11Active],
  ['pointer.slot-11-x', Pointer.Slot11X],
  ['pointer.slot-11-y', Pointer.Slot11Y],
  ['pointer.slot-12-active', Pointer.Slot12Active],
  ['pointer.slot-12-x', Pointer.Slot12X],
  ['pointer.slot-12-y', Pointer.Slot12Y],
  ['pointer.slot-13-active', Pointer.Slot13Active],
  ['pointer.slot-13-x', Pointer.Slot13X],
  ['pointer.slot-13-y', Pointer.Slot13Y],
  ['pointer.slot-14-active', Pointer.Slot14Active],
  ['pointer.slot-14-x', Pointer.Slot14X],
  ['pointer.slot-14-y', Pointer.Slot14Y],
  ['pointer.slot-15-active', Pointer.Slot15Active],
  ['pointer.slot-15-x', Pointer.Slot15X],
  ['pointer.slot-15-y', Pointer.Slot15Y],

  ['gamepad.button.south', GamepadButton.South],
  ['gamepad.button.east', GamepadButton.East],
  ['gamepad.button.west', GamepadButton.West],
  ['gamepad.button.north', GamepadButton.North],
  ['gamepad.button.left-shoulder', GamepadButton.LeftShoulder],
  ['gamepad.button.right-shoulder', GamepadButton.RightShoulder],
  ['gamepad.button.left-trigger', GamepadButton.LeftTrigger],
  ['gamepad.button.right-trigger', GamepadButton.RightTrigger],
  ['gamepad.button.select', GamepadButton.Select],
  ['gamepad.button.start', GamepadButton.Start],
  ['gamepad.button.left-stick', GamepadButton.LeftStick],
  ['gamepad.button.right-stick', GamepadButton.RightStick],
  ['gamepad.button.dpad-up', GamepadButton.DPadUp],
  ['gamepad.button.dpad-down', GamepadButton.DPadDown],
  ['gamepad.button.dpad-left', GamepadButton.DPadLeft],
  ['gamepad.button.dpad-right', GamepadButton.DPadRight],
  ['gamepad.button.guide', GamepadButton.Guide],
  ['gamepad.button.share', GamepadButton.Share],
  ['gamepad.button.capture', GamepadButton.Capture],
  ['gamepad.button.touchpad', GamepadButton.Touchpad],
  ['gamepad.button.paddle-1', GamepadButton.Paddle1],
  ['gamepad.button.paddle-2', GamepadButton.Paddle2],
  ['gamepad.button.paddle-3', GamepadButton.Paddle3],
  ['gamepad.button.paddle-4', GamepadButton.Paddle4],

  ['gamepad.axis.left-stick-left', GamepadAxis.LeftStickLeft],
  ['gamepad.axis.left-stick-right', GamepadAxis.LeftStickRight],
  ['gamepad.axis.left-stick-up', GamepadAxis.LeftStickUp],
  ['gamepad.axis.left-stick-down', GamepadAxis.LeftStickDown],
  ['gamepad.axis.right-stick-left', GamepadAxis.RightStickLeft],
  ['gamepad.axis.right-stick-right', GamepadAxis.RightStickRight],
  ['gamepad.axis.right-stick-up', GamepadAxis.RightStickUp],
  ['gamepad.axis.right-stick-down', GamepadAxis.RightStickDown],
  ['gamepad.axis.left-stick-x', GamepadAxis.LeftStickX],
  ['gamepad.axis.left-stick-y', GamepadAxis.LeftStickY],
  ['gamepad.axis.right-stick-x', GamepadAxis.RightStickX],
  ['gamepad.axis.right-stick-y', GamepadAxis.RightStickY],
  ['gamepad.axis.touchpad-x', GamepadAxis.TouchpadX],
  ['gamepad.axis.touchpad-y', GamepadAxis.TouchpadY],
  ['gamepad.axis.touchpad-2-x', GamepadAxis.Touchpad2X],
  ['gamepad.axis.touchpad-2-y', GamepadAxis.Touchpad2Y],
  ['gamepad.axis.auxiliary-axis-0-negative', GamepadAxis.AuxiliaryAxis0Negative],
  ['gamepad.axis.auxiliary-axis-0-positive', GamepadAxis.AuxiliaryAxis0Positive],
  ['gamepad.axis.auxiliary-axis-1-negative', GamepadAxis.AuxiliaryAxis1Negative],
  ['gamepad.axis.auxiliary-axis-1-positive', GamepadAxis.AuxiliaryAxis1Positive],
  ['gamepad.axis.auxiliary-axis-2-negative', GamepadAxis.AuxiliaryAxis2Negative],
  ['gamepad.axis.auxiliary-axis-2-positive', GamepadAxis.AuxiliaryAxis2Positive],
  ['gamepad.axis.auxiliary-axis-3-negative', GamepadAxis.AuxiliaryAxis3Negative],
  ['gamepad.axis.auxiliary-axis-3-positive', GamepadAxis.AuxiliaryAxis3Positive],
]);

/**
 * Channel to canonical token. Built from {@link channelsByToken}, first entry
 * winning, so an aliased channel emits its canonical spelling: slot 0 is
 * addressable as both `pointer.x` and `pointer.slot-0-x`, and only the
 * former is ever written out.
 */
const tokensByChannel = ((): ReadonlyMap<number, InputToken> => {
  const result = new Map<number, InputToken>();

  for (const [token, channel] of channelsByToken) {
    if (!result.has(channel)) {
      result.set(channel, token);
    }
  }

  return result;
})();

/**
 * Canonical {@link InputToken} for `channel`.
 *
 * @throws {Error} If `channel` is not one of the engine's named controls -
 * a raw offset into a reserved or custom-mapping channel slot has no stable
 * public name and therefore cannot be persisted.
 */
export function inputToken(channel: InputChannel): InputToken {
  const token = tokensByChannel.get(channel);

  if (token === undefined) {
    throw new Error(
      `inputToken: channel ${String(channel)} has no serializable token. Only named Keyboard, Pointer, PointerButton, GamepadButton and GamepadAxis channels can be persisted.`,
    );
  }

  return token;
}

/**
 * Channel `token` names, or `null` when no control carries that token.
 *
 * Returning `null` rather than falling back to a nearby control is the point:
 * a profile saved by a newer build, a hand-edited file, or a typo must be
 * reported to the player, never silently rebound to a different input. Callers
 * that persist bindings (see `BindingProfile.fromJSON`) turn the `null` into a
 * throw.
 *
 * Gamepad tokens resolve to slot-0-relative channels; the owning
 * {@link ActionMap} rebases them onto its own pad.
 */
export function inputChannelFromToken(token: string): InputChannel | null {
  return channelsByToken.get(token) ?? null;
}

/** Every token this build understands, in canonical order. @internal */
export function inputTokens(): IterableIterator<InputToken> {
  return channelsByToken.keys();
}
