/**
 * Slot-count constants for the unified channels buffer. The buffer is split
 * into three categories (`Keyboard`, `Pointers`, `Gamepads`) of 256 slots
 * each — `Category`. `Gamepad` is the per-device sub-allocation inside the
 * `Gamepads` category (4 devices × 64 channels each).
 */
export enum ChannelSize {
  Container = 3 << 8,
  Category = 1 << 8,
  Gamepad = 1 << 6,
}

/**
 * Base offsets of each input category inside the unified channels buffer.
 * Add a per-key/per-slot value to one of these to get an absolute channel
 * index suitable for {@link Input} construction.
 */
export const enum ChannelOffset {
  Keyboard = 0 * ChannelSize.Category,
  Pointers = 1 * ChannelSize.Category,
  Gamepads = 2 * ChannelSize.Category,
}

/** Maximum number of simultaneous tracked pointers (mouse / touch / pen). */
export const maxPointers = 16;

/** Number of channel slots reserved per pointer. 16 pointers × 16 slots = 256 (fills the Pointers category exactly). */
export const pointerSlotSize = 16;

/**
 * Rebase a gamepad channel onto `slot`'s sub-allocation. Channels outside the
 * gamepad category pass through unchanged, so callers can map a mixed binding
 * list without inspecting each entry.
 */
export function resolveGamepadSlotChannel(channel: number, slot: 0 | 1 | 2 | 3): number {
  if (channel >= ChannelOffset.Gamepads && channel < ChannelOffset.Gamepads + ChannelSize.Category) {
    return ChannelOffset.Gamepads + slot * ChannelSize.Gamepad + (channel ^ ChannelOffset.Gamepads);
  }

  return channel;
}

/**
 * Undo {@link resolveGamepadSlotChannel}: the slot-0 channel a rebased gamepad
 * channel came from. Channels outside the gamepad category pass through
 * unchanged.
 *
 * Serialization and conflict reporting both need this — a binding names a
 * control, never the runtime pad slot it happens to be read from.
 */
export function slotZeroGamepadChannel(channel: number): number {
  if (channel >= ChannelOffset.Gamepads && channel < ChannelOffset.Gamepads + ChannelSize.Category) {
    return ChannelOffset.Gamepads + ((channel - ChannelOffset.Gamepads) % ChannelSize.Gamepad);
  }

  return channel;
}

/**
 * Channel indices for the buttons of the primary pointer (slot 0), named by
 * role rather than by mouse geometry so they read correctly for pen and touch
 * input too. These address fields 9..11 of the pointer slot layout written by
 * {@link Pointer}.
 *
 * @example
 * ```ts
 * attack: new ButtonAction(PointerButton.Primary)
 * ```
 */
export enum PointerButton {
  Primary = ChannelOffset.Pointers + 9,
  Secondary = ChannelOffset.Pointers + 10,
  Auxiliary = ChannelOffset.Pointers + 11,
}

/**
 * Channel indices for keyboard keys, addressed by PHYSICAL key position.
 * Pass any value to the {@link Input} constructor to react to that key.
 *
 * A key is identified by the Web platform's layout-independent
 * `KeyboardEvent.code` (see {@link keyboardChannelFromCode}), not by the
 * layout-dependent `keyCode`: {@link Keyboard.A} is the key at the QWERTY "A"
 * position on every layout — the one an AZERTY keyboard prints "Q" on — so
 * WASD-style bindings stay in the same place under the player's hand
 * regardless of the player's layout.
 *
 * Every member therefore names a POSITION, described by the glyph a US-QWERTY
 * keyboard prints there, and NOT the character the key actually produces:
 * {@link Keyboard.Z} is the key a German QWERTZ keyboard prints "Y" on, and
 * {@link Keyboard.Colon} the key it prints "ö" on. Use DOM text input for
 * anything that needs the typed character, dead keys, or IME composition.
 *
 * The values are opaque channel indices inside the keyboard category — do not
 * assume they equal any `keyCode`.
 *
 * Each modifier has both a side-specific channel (`ShiftLeft`, `ShiftRight`,
 * `ControlLeft`, `ControlRight`, `AltLeft`, `AltRight`, `MetaLeft`,
 * `MetaRight`) and an aggregate one (`Shift`, `Control`, `Alt`, `Meta`) that
 * is active whenever either side is held — the aggregate is what a game
 * binding wants ("was Control held", regardless of which hand), while the
 * side-specific channels exist for a key-press visualizer or a rebinding UI
 * that needs to tell the two physical keys apart. Releasing one side while
 * the other stays held keeps the aggregate active.
 *
 * @example
 * ```ts
 * const jump = new Input(Keyboard.Space, { onTrigger: () => player.jump() });
 * ```
 */
export enum Keyboard {
  Backspace = ChannelOffset.Keyboard + 8,
  Tab = ChannelOffset.Keyboard + 9,
  Enter = ChannelOffset.Keyboard + 13,
  /** Aggregate: active while either {@link ShiftLeft} or {@link ShiftRight} is held. */
  Shift = ChannelOffset.Keyboard + 16,
  /** Aggregate: active while either {@link ControlLeft} or {@link ControlRight} is held. */
  Control = ChannelOffset.Keyboard + 17,
  /** Aggregate: active while either {@link AltLeft} or {@link AltRight} is held. */
  Alt = ChannelOffset.Keyboard + 18,
  Pause = ChannelOffset.Keyboard + 19,
  CapsLock = ChannelOffset.Keyboard + 20,
  /** Physical left `Shift` key. Also drives the aggregate {@link Shift} channel. */
  ShiftLeft = ChannelOffset.Keyboard + 21,
  /** Physical right `Shift` key. Also drives the aggregate {@link Shift} channel. */
  ShiftRight = ChannelOffset.Keyboard + 22,
  /** Physical left `Control` key. Also drives the aggregate {@link Control} channel. */
  ControlLeft = ChannelOffset.Keyboard + 23,
  /** Physical right `Control` key. Also drives the aggregate {@link Control} channel. */
  ControlRight = ChannelOffset.Keyboard + 24,
  /** Physical left `Alt` key. Also drives the aggregate {@link Alt} channel. */
  AltLeft = ChannelOffset.Keyboard + 25,
  /** Physical right `Alt` key. Also drives the aggregate {@link Alt} channel. */
  AltRight = ChannelOffset.Keyboard + 26,
  Escape = ChannelOffset.Keyboard + 27,
  Space = ChannelOffset.Keyboard + 32,
  PageUp = ChannelOffset.Keyboard + 33,
  PageDown = ChannelOffset.Keyboard + 34,
  End = ChannelOffset.Keyboard + 35,
  Home = ChannelOffset.Keyboard + 36,
  Left = ChannelOffset.Keyboard + 37,
  Up = ChannelOffset.Keyboard + 38,
  Right = ChannelOffset.Keyboard + 39,
  Down = ChannelOffset.Keyboard + 40,
  PrintScreen = ChannelOffset.Keyboard + 44,
  Insert = ChannelOffset.Keyboard + 45,
  Delete = ChannelOffset.Keyboard + 46,
  Help = ChannelOffset.Keyboard + 47,
  Zero = ChannelOffset.Keyboard + 48,
  One = ChannelOffset.Keyboard + 49,
  Two = ChannelOffset.Keyboard + 50,
  Three = ChannelOffset.Keyboard + 51,
  Four = ChannelOffset.Keyboard + 52,
  Five = ChannelOffset.Keyboard + 53,
  Six = ChannelOffset.Keyboard + 54,
  Seven = ChannelOffset.Keyboard + 55,
  Eight = ChannelOffset.Keyboard + 56,
  Nine = ChannelOffset.Keyboard + 57,
  A = ChannelOffset.Keyboard + 65,
  B = ChannelOffset.Keyboard + 66,
  C = ChannelOffset.Keyboard + 67,
  D = ChannelOffset.Keyboard + 68,
  E = ChannelOffset.Keyboard + 69,
  F = ChannelOffset.Keyboard + 70,
  G = ChannelOffset.Keyboard + 71,
  H = ChannelOffset.Keyboard + 72,
  I = ChannelOffset.Keyboard + 73,
  J = ChannelOffset.Keyboard + 74,
  K = ChannelOffset.Keyboard + 75,
  L = ChannelOffset.Keyboard + 76,
  M = ChannelOffset.Keyboard + 77,
  N = ChannelOffset.Keyboard + 78,
  O = ChannelOffset.Keyboard + 79,
  P = ChannelOffset.Keyboard + 80,
  Q = ChannelOffset.Keyboard + 81,
  R = ChannelOffset.Keyboard + 82,
  S = ChannelOffset.Keyboard + 83,
  T = ChannelOffset.Keyboard + 84,
  U = ChannelOffset.Keyboard + 85,
  V = ChannelOffset.Keyboard + 86,
  W = ChannelOffset.Keyboard + 87,
  X = ChannelOffset.Keyboard + 88,
  Y = ChannelOffset.Keyboard + 89,
  Z = ChannelOffset.Keyboard + 90,
  /** Aggregate: active while either {@link MetaLeft} or {@link MetaRight} is held. */
  Meta = ChannelOffset.Keyboard + 91,
  ContextMenu = ChannelOffset.Keyboard + 93,
  /** Physical left `Meta`/`Cmd`/`Windows` key. Also drives the aggregate {@link Meta} channel. */
  MetaLeft = ChannelOffset.Keyboard + 94,
  /** Physical right `Meta`/`Cmd`/`Windows` key. Also drives the aggregate {@link Meta} channel. */
  MetaRight = ChannelOffset.Keyboard + 95,
  NumPad0 = ChannelOffset.Keyboard + 96,
  NumPad1 = ChannelOffset.Keyboard + 97,
  NumPad2 = ChannelOffset.Keyboard + 98,
  NumPad3 = ChannelOffset.Keyboard + 99,
  NumPad4 = ChannelOffset.Keyboard + 100,
  NumPad5 = ChannelOffset.Keyboard + 101,
  NumPad6 = ChannelOffset.Keyboard + 102,
  NumPad7 = ChannelOffset.Keyboard + 103,
  NumPad8 = ChannelOffset.Keyboard + 104,
  NumPad9 = ChannelOffset.Keyboard + 105,
  NumPadMultiply = ChannelOffset.Keyboard + 106,
  NumPadAdd = ChannelOffset.Keyboard + 107,
  NumPadEnter = ChannelOffset.Keyboard + 108,
  NumPadSubtract = ChannelOffset.Keyboard + 109,
  NumPadDecimal = ChannelOffset.Keyboard + 110,
  NumPadDivide = ChannelOffset.Keyboard + 111,
  F1 = ChannelOffset.Keyboard + 112,
  F2 = ChannelOffset.Keyboard + 113,
  F3 = ChannelOffset.Keyboard + 114,
  F4 = ChannelOffset.Keyboard + 115,
  F5 = ChannelOffset.Keyboard + 116,
  F6 = ChannelOffset.Keyboard + 117,
  F7 = ChannelOffset.Keyboard + 118,
  F8 = ChannelOffset.Keyboard + 119,
  F9 = ChannelOffset.Keyboard + 120,
  F10 = ChannelOffset.Keyboard + 121,
  F11 = ChannelOffset.Keyboard + 122,
  F12 = ChannelOffset.Keyboard + 123,
  NumLock = ChannelOffset.Keyboard + 144,
  ScrollLock = ChannelOffset.Keyboard + 145,
  NumPadEqual = ChannelOffset.Keyboard + 146,
  /** The extra key between left `Shift` and `Z` on ISO (non-US) keyboards. */
  IntlBackslash = ChannelOffset.Keyboard + 147,
  /** The extra key left of the right `Shift` on Japanese keyboards. */
  IntlRo = ChannelOffset.Keyboard + 148,
  /** The extra key right of `Backspace` on Japanese keyboards. */
  IntlYen = ChannelOffset.Keyboard + 149,
  Colon = ChannelOffset.Keyboard + 186,
  Equals = ChannelOffset.Keyboard + 187,
  Comma = ChannelOffset.Keyboard + 188,
  Dash = ChannelOffset.Keyboard + 189,
  Period = ChannelOffset.Keyboard + 190,
  QuestionMark = ChannelOffset.Keyboard + 191,
  Tilde = ChannelOffset.Keyboard + 192,
  OpenBracket = ChannelOffset.Keyboard + 219,
  BackwardSlash = ChannelOffset.Keyboard + 220,
  ClosedBracket = ChannelOffset.Keyboard + 221,
  Quotes = ChannelOffset.Keyboard + 222,
}
