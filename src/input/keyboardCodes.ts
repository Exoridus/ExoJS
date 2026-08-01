import { Keyboard } from './types';

/**
 * Physical key (`KeyboardEvent.code`) → {@link Keyboard} channel.
 *
 * `code` names a key by its POSITION on a US-QWERTY reference keyboard and is
 * identical across layouts, so the entry for `'KeyA'` is the key an AZERTY
 * keyboard prints "Q" on and a QWERTZ keyboard prints "A" on. That is exactly
 * what a game binding wants: WASD stays a physical square under the player's
 * hand. `KeyboardEvent.keyCode` cannot express this — it reports the layout's
 * own character mapping, so the same physical key yields a different number
 * per layout.
 *
 * The `code` spelling lives in this table only. {@link Keyboard} member names
 * stay as they are, so a punctuation key is listed under the glyph a US-QWERTY
 * keyboard prints on it (`'Semicolon'` → {@link Keyboard.Colon}) rather than
 * under a matching name.
 *
 * Both physical sides of a modifier deliberately share one channel
 * (`ShiftLeft`/`ShiftRight` → {@link Keyboard.Shift}); the legacy `OSLeft`/
 * `OSRight` spellings some browsers still emit alias onto
 * {@link Keyboard.Meta}. Codes with no entry here (media keys, IME/language
 * keys, and the empty `code` reported by soft keyboards) drive no channel.
 */
const channelsByCode = new Map<string, Keyboard>([
  // Alphanumeric block.
  ['KeyA', Keyboard.A],
  ['KeyB', Keyboard.B],
  ['KeyC', Keyboard.C],
  ['KeyD', Keyboard.D],
  ['KeyE', Keyboard.E],
  ['KeyF', Keyboard.F],
  ['KeyG', Keyboard.G],
  ['KeyH', Keyboard.H],
  ['KeyI', Keyboard.I],
  ['KeyJ', Keyboard.J],
  ['KeyK', Keyboard.K],
  ['KeyL', Keyboard.L],
  ['KeyM', Keyboard.M],
  ['KeyN', Keyboard.N],
  ['KeyO', Keyboard.O],
  ['KeyP', Keyboard.P],
  ['KeyQ', Keyboard.Q],
  ['KeyR', Keyboard.R],
  ['KeyS', Keyboard.S],
  ['KeyT', Keyboard.T],
  ['KeyU', Keyboard.U],
  ['KeyV', Keyboard.V],
  ['KeyW', Keyboard.W],
  ['KeyX', Keyboard.X],
  ['KeyY', Keyboard.Y],
  ['KeyZ', Keyboard.Z],
  ['Digit0', Keyboard.Zero],
  ['Digit1', Keyboard.One],
  ['Digit2', Keyboard.Two],
  ['Digit3', Keyboard.Three],
  ['Digit4', Keyboard.Four],
  ['Digit5', Keyboard.Five],
  ['Digit6', Keyboard.Six],
  ['Digit7', Keyboard.Seven],
  ['Digit8', Keyboard.Eight],
  ['Digit9', Keyboard.Nine],

  // Punctuation. The channel name is the US-QWERTY glyph; the key itself is
  // the position, whatever the player's layout prints on it.
  ['Backquote', Keyboard.Tilde],
  ['Minus', Keyboard.Dash],
  ['Equal', Keyboard.Equals],
  ['BracketLeft', Keyboard.OpenBracket],
  ['BracketRight', Keyboard.ClosedBracket],
  ['Backslash', Keyboard.BackwardSlash],
  ['Semicolon', Keyboard.Colon],
  ['Quote', Keyboard.Quotes],
  ['Comma', Keyboard.Comma],
  ['Period', Keyboard.Period],
  ['Slash', Keyboard.QuestionMark],
  ['IntlBackslash', Keyboard.IntlBackslash],
  ['IntlRo', Keyboard.IntlRo],
  ['IntlYen', Keyboard.IntlYen],

  // Control and whitespace.
  ['Space', Keyboard.Space],
  ['Enter', Keyboard.Enter],
  ['Tab', Keyboard.Tab],
  ['Backspace', Keyboard.Backspace],
  ['Escape', Keyboard.Escape],
  ['CapsLock', Keyboard.CapsLock],
  ['ContextMenu', Keyboard.ContextMenu],

  // Modifiers — both sides fold onto one channel.
  ['ShiftLeft', Keyboard.Shift],
  ['ShiftRight', Keyboard.Shift],
  ['ControlLeft', Keyboard.Control],
  ['ControlRight', Keyboard.Control],
  ['AltLeft', Keyboard.Alt],
  ['AltRight', Keyboard.Alt],
  ['MetaLeft', Keyboard.Meta],
  ['MetaRight', Keyboard.Meta],
  ['OSLeft', Keyboard.Meta],
  ['OSRight', Keyboard.Meta],

  // Navigation and editing.
  ['ArrowLeft', Keyboard.Left],
  ['ArrowUp', Keyboard.Up],
  ['ArrowRight', Keyboard.Right],
  ['ArrowDown', Keyboard.Down],
  ['Home', Keyboard.Home],
  ['End', Keyboard.End],
  ['PageUp', Keyboard.PageUp],
  ['PageDown', Keyboard.PageDown],
  ['Insert', Keyboard.Insert],
  ['Delete', Keyboard.Delete],
  ['Help', Keyboard.Help],

  // System.
  ['PrintScreen', Keyboard.PrintScreen],
  ['ScrollLock', Keyboard.ScrollLock],
  ['Pause', Keyboard.Pause],
  ['NumLock', Keyboard.NumLock],

  // Function row.
  ['F1', Keyboard.F1],
  ['F2', Keyboard.F2],
  ['F3', Keyboard.F3],
  ['F4', Keyboard.F4],
  ['F5', Keyboard.F5],
  ['F6', Keyboard.F6],
  ['F7', Keyboard.F7],
  ['F8', Keyboard.F8],
  ['F9', Keyboard.F9],
  ['F10', Keyboard.F10],
  ['F11', Keyboard.F11],
  ['F12', Keyboard.F12],

  // Numeric keypad.
  ['Numpad0', Keyboard.NumPad0],
  ['Numpad1', Keyboard.NumPad1],
  ['Numpad2', Keyboard.NumPad2],
  ['Numpad3', Keyboard.NumPad3],
  ['Numpad4', Keyboard.NumPad4],
  ['Numpad5', Keyboard.NumPad5],
  ['Numpad6', Keyboard.NumPad6],
  ['Numpad7', Keyboard.NumPad7],
  ['Numpad8', Keyboard.NumPad8],
  ['Numpad9', Keyboard.NumPad9],
  ['NumpadAdd', Keyboard.NumPadAdd],
  ['NumpadSubtract', Keyboard.NumPadSubtract],
  ['NumpadMultiply', Keyboard.NumPadMultiply],
  ['NumpadDivide', Keyboard.NumPadDivide],
  ['NumpadDecimal', Keyboard.NumPadDecimal],
  ['NumpadEnter', Keyboard.NumPadEnter],
  ['NumpadEqual', Keyboard.NumPadEqual],
]);

/**
 * Resolve a `KeyboardEvent.code` to its {@link Keyboard} channel, or
 * `undefined` for a key ExoJS does not track (media and IME/language keys, and
 * the empty `code` a soft keyboard reports). This is the single seam between
 * the platform's physical-key identity and the engine's channel model — see
 * {@link Keyboard} for what "physical" means here and why `keyCode` is never
 * used.
 *
 * Useful in a rebinding UI that has a raw DOM event rather than an engine
 * channel; {@link InputManager.onKeyDown} already reports the resolved channel.
 *
 * @example
 * ```ts
 * const channel = keyboardChannelFromCode(event.code);
 *
 * if (channel !== undefined) {
 *   profile.jump = channel;
 * }
 * ```
 */
export function keyboardChannelFromCode(code: string): Keyboard | undefined {
  return channelsByCode.get(code);
}
