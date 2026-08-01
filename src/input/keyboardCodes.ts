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
 * A modifier resolves to its SIDE-SPECIFIC channel here (`'ShiftLeft'` →
 * {@link Keyboard.ShiftLeft}, not the aggregate {@link Keyboard.Shift}) —
 * {@link InputManager} derives the aggregate from it via
 * {@link modifierChannelInfo}. The legacy `OSLeft`/`OSRight` spellings some
 * browsers still emit alias onto {@link Keyboard.MetaLeft}/
 * {@link Keyboard.MetaRight}. Codes with no entry here (media keys,
 * IME/language keys, and the empty `code` reported by soft keyboards) drive
 * no channel.
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

  // Modifiers — each side resolves to its own channel; see
  // `modifierChannelInfo` for how the aggregate channel is derived from it.
  ['ShiftLeft', Keyboard.ShiftLeft],
  ['ShiftRight', Keyboard.ShiftRight],
  ['ControlLeft', Keyboard.ControlLeft],
  ['ControlRight', Keyboard.ControlRight],
  ['AltLeft', Keyboard.AltLeft],
  ['AltRight', Keyboard.AltRight],
  ['MetaLeft', Keyboard.MetaLeft],
  ['MetaRight', Keyboard.MetaRight],
  // Legacy spellings some browsers still emit for the Meta key.
  ['OSLeft', Keyboard.MetaLeft],
  ['OSRight', Keyboard.MetaRight],

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
 * For a modifier this returns the SIDE-SPECIFIC channel (`'ShiftLeft'` →
 * {@link Keyboard.ShiftLeft}), never the aggregate — {@link InputManager}
 * writes the aggregate channel alongside it on every keydown/keyup.
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

/**
 * A modifier's side-specific channel's aggregate and sibling — the two facts
 * {@link InputManager} needs to keep both channel kinds in sync. `aggregate`
 * is the OR-channel written alongside a side channel (`ShiftLeft` ->
 * `Shift`). `sibling` is the other physical side of the same modifier,
 * consulted on release: the aggregate is set to the sibling's CURRENT value
 * rather than unconditionally cleared, so releasing left `Control` while
 * right `Control` is still held leaves {@link Keyboard.Control} active.
 *
 * @internal
 */
interface ModifierChannelInfo {
  readonly aggregate: Keyboard;
  readonly sibling: Keyboard;
}

/**
 * Side-specific modifier channel → {@link ModifierChannelInfo}. Every
 * modifier side channel from {@link channelsByCode} has an entry; every other
 * channel (non-modifier keys) has none, which is how {@link InputManager}
 * tells a plain key apart from a modifier side.
 */
const modifierChannelInfo = new Map<Keyboard, ModifierChannelInfo>([
  [Keyboard.ShiftLeft, { aggregate: Keyboard.Shift, sibling: Keyboard.ShiftRight }],
  [Keyboard.ShiftRight, { aggregate: Keyboard.Shift, sibling: Keyboard.ShiftLeft }],
  [Keyboard.ControlLeft, { aggregate: Keyboard.Control, sibling: Keyboard.ControlRight }],
  [Keyboard.ControlRight, { aggregate: Keyboard.Control, sibling: Keyboard.ControlLeft }],
  [Keyboard.AltLeft, { aggregate: Keyboard.Alt, sibling: Keyboard.AltRight }],
  [Keyboard.AltRight, { aggregate: Keyboard.Alt, sibling: Keyboard.AltLeft }],
  [Keyboard.MetaLeft, { aggregate: Keyboard.Meta, sibling: Keyboard.MetaRight }],
  [Keyboard.MetaRight, { aggregate: Keyboard.Meta, sibling: Keyboard.MetaLeft }],
]);

/**
 * Look up `channel`'s {@link ModifierChannelInfo}, or `undefined` when
 * `channel` is not a side-specific modifier channel (every non-modifier key,
 * and the aggregate channels themselves). @internal
 */
export function keyboardModifierChannelInfo(channel: Keyboard): ModifierChannelInfo | undefined {
  return modifierChannelInfo.get(channel);
}
