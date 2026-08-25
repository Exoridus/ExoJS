/**
 * Tests for the layout-independent keyboard channel mapping: `KeyboardEvent.code`
 * (physical key position) resolves to a `Keyboard` channel, and the
 * layout-dependent `KeyboardEvent.keyCode` is never consulted.
 */

import type { Application } from '#core/Application';
import { Time } from '#core/units';
import { InputManager } from '#input/InputManager';
import { keyboardChannelFromCode } from '#input/keyboardCodes';
import { Keyboard } from '#input/types';
import { BrowserPlatform } from '#platform/BrowserPlatform';

const createCanvas = (width = 800, height = 600): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');

  canvas.width = width;
  canvas.height = height;

  return canvas;
};

const createMockApp = (canvas: HTMLCanvasElement): Application =>
  ({
    canvas,
    platform: new BrowserPlatform(canvas),
    width: canvas.width,
    height: canvas.height,
    pixelRatio: 1,
    options: { input: {} },
    // `InputManager` reads `scenes.paused` to decide whether a long-press hold
    // advances this frame.
    scenes: { paused: false },
  }) as unknown as Application;

const createFocusedInputManager = (): { im: InputManager; canvas: HTMLCanvasElement } => {
  const canvas = createCanvas();
  const im = new InputManager(createMockApp(canvas));

  canvas.dispatchEvent(new FocusEvent('focus'));

  return { im, canvas };
};

const ch = (im: InputManager, channel: number): number => (im as unknown as { channels: Float32Array }).channels[channel]!;

const press = (init: KeyboardEventInit & { keyCode?: number }): void => {
  window.dispatchEvent(new KeyboardEvent('keydown', init as KeyboardEventInit));
};

const release = (init: KeyboardEventInit & { keyCode?: number }): void => {
  window.dispatchEvent(new KeyboardEvent('keyup', init as KeyboardEventInit));
};

describe('keyboardChannelFromCode', () => {
  test('resolves physical key codes to their Keyboard channel', () => {
    expect(keyboardChannelFromCode('KeyA')).toBe(Keyboard.A);
    expect(keyboardChannelFromCode('Digit1')).toBe(Keyboard.One);
    expect(keyboardChannelFromCode('ArrowLeft')).toBe(Keyboard.Left);
    expect(keyboardChannelFromCode('Numpad5')).toBe(Keyboard.NumPad5);
    expect(keyboardChannelFromCode('Semicolon')).toBe(Keyboard.Colon);
    expect(keyboardChannelFromCode('Backquote')).toBe(Keyboard.Tilde);
  });

  test('a digit row key and its keypad twin stay separate channels', () => {
    expect(keyboardChannelFromCode('Digit1')).not.toBe(keyboardChannelFromCode('Numpad1'));
    expect(keyboardChannelFromCode('Enter')).not.toBe(keyboardChannelFromCode('NumpadEnter'));
  });

  test('resolves each physical side of a modifier to its own side-specific channel', () => {
    expect(keyboardChannelFromCode('ShiftLeft')).toBe(Keyboard.ShiftLeft);
    expect(keyboardChannelFromCode('ShiftRight')).toBe(Keyboard.ShiftRight);
    expect(keyboardChannelFromCode('ControlLeft')).toBe(Keyboard.ControlLeft);
    expect(keyboardChannelFromCode('ControlRight')).toBe(Keyboard.ControlRight);
    expect(keyboardChannelFromCode('AltLeft')).toBe(Keyboard.AltLeft);
    expect(keyboardChannelFromCode('AltRight')).toBe(Keyboard.AltRight);
    expect(keyboardChannelFromCode('MetaLeft')).toBe(Keyboard.MetaLeft);
    expect(keyboardChannelFromCode('MetaRight')).toBe(Keyboard.MetaRight);

    // Every side channel is distinct from its aggregate and from its sibling.
    expect(keyboardChannelFromCode('ShiftLeft')).not.toBe(Keyboard.Shift);
    expect(keyboardChannelFromCode('ShiftLeft')).not.toBe(keyboardChannelFromCode('ShiftRight'));
  });

  test('the legacy OSLeft/OSRight spellings alias onto the Meta side channels', () => {
    expect(keyboardChannelFromCode('OSLeft')).toBe(Keyboard.MetaLeft);
    expect(keyboardChannelFromCode('OSRight')).toBe(Keyboard.MetaRight);
  });

  test('returns undefined for an unmapped or absent code', () => {
    expect(keyboardChannelFromCode('MediaPlayPause')).toBeUndefined();
    expect(keyboardChannelFromCode('Unidentified')).toBeUndefined();
    expect(keyboardChannelFromCode('')).toBeUndefined();
  });

  test('every mapped channel is inside the keyboard category', () => {
    for (const code of ['KeyZ', 'Escape', 'F12', 'NumpadEnter', 'IntlBackslash']) {
      const channel = keyboardChannelFromCode(code)!;

      expect(channel).toBeGreaterThanOrEqual(0);
      expect(channel).toBeLessThan(256);
    }
  });
});

describe('InputManager — layout-independent keyboard channels', () => {
  test('a physical key maps to the same channel on AZERTY as on QWERTY', () => {
    // The physical key at the QWERTY "A" position reports `code: 'KeyA'` on
    // every layout; on a French AZERTY keyboard it produces the character "q"
    // and the legacy keyCode 81 ("Q"), on US QWERTY the character "a" and
    // keyCode 65. Only the physical position may decide the channel.
    const { im } = createFocusedInputManager();

    press({ code: 'KeyA', key: 'q', keyCode: 81 });

    expect(ch(im, Keyboard.A)).toBe(1);
    expect(ch(im, Keyboard.Q)).toBe(0);

    release({ code: 'KeyA', key: 'q', keyCode: 81 });

    expect(ch(im, Keyboard.A)).toBe(0);

    im.destroy();
  });

  test('a physical key maps to the same channel on QWERTZ as on QWERTY', () => {
    // German QWERTZ swaps Y and Z: the physical `KeyZ` key produces "y"
    // (legacy keyCode 89) there and "z" (keyCode 90) on US QWERTY.
    const { im } = createFocusedInputManager();

    press({ code: 'KeyZ', key: 'y', keyCode: 89 });

    expect(ch(im, Keyboard.Z)).toBe(1);
    expect(ch(im, Keyboard.Y)).toBe(0);

    im.destroy();
  });

  test('a punctuation key maps by position, not by the glyph the layout prints', () => {
    // On QWERTZ the physical `Semicolon` key prints "ö"; on AZERTY it prints
    // "m". Neither changes the channel - the member is named for the US-QWERTY
    // legend of that position, not for the character produced.
    const { im } = createFocusedInputManager();

    press({ code: 'Semicolon', key: 'ö', keyCode: 192 });

    expect(ch(im, Keyboard.Colon)).toBe(1);

    im.destroy();
  });

  test('the legacy keyCode is never consulted', () => {
    const { im } = createFocusedInputManager();

    press({ code: 'Space', keyCode: 0 });

    expect(ch(im, Keyboard.Space)).toBe(1);

    im.destroy();
  });

  test('either shift key drives the aggregate Shift channel', () => {
    const { im } = createFocusedInputManager();

    press({ code: 'ShiftRight', key: 'Shift', keyCode: 16 });

    expect(ch(im, Keyboard.Shift)).toBe(1);

    release({ code: 'ShiftRight', key: 'Shift', keyCode: 16 });
    press({ code: 'ShiftLeft', key: 'Shift', keyCode: 16 });

    expect(ch(im, Keyboard.Shift)).toBe(1);

    im.destroy();
  });

  test('an unmapped code writes no channel and dispatches no key signal', () => {
    const { im } = createFocusedInputManager();
    const onKeyDown = vi.fn();
    const onKeyUp = vi.fn();

    im.onKeyDown.add(onKeyDown);
    im.onKeyUp.add(onKeyUp);

    // A media key, and the empty `code` an Android soft keyboard reports.
    press({ code: 'MediaPlayPause' });
    press({ code: '', key: 'Unidentified', keyCode: 229 });
    release({ code: 'MediaPlayPause' });
    im.preUpdate(Time.seconds(0));

    expect(onKeyDown).not.toHaveBeenCalled();
    expect(onKeyUp).not.toHaveBeenCalled();

    im.destroy();
  });

  test('a mapped keydown still reaches the onKeyDown signal with its channel', () => {
    const { im } = createFocusedInputManager();
    const onKeyDown = vi.fn();

    im.onKeyDown.add(onKeyDown);
    press({ code: 'ArrowLeft', key: 'ArrowLeft', keyCode: 37 });
    im.preUpdate(Time.seconds(0));

    expect(onKeyDown).toHaveBeenCalledTimes(1);
    expect(onKeyDown).toHaveBeenCalledWith(Keyboard.Left);

    im.destroy();
  });
});

describe('InputManager — modifier side and aggregate channels', () => {
  test('a modifier keydown writes both its side channel and the aggregate channel', () => {
    const { im } = createFocusedInputManager();

    press({ code: 'ControlLeft', key: 'Control', keyCode: 17 });

    expect(ch(im, Keyboard.ControlLeft)).toBe(1);
    expect(ch(im, Keyboard.ControlRight)).toBe(0);
    expect(ch(im, Keyboard.Control)).toBe(1);

    im.destroy();
  });

  test('both sides held, one released: the aggregate stays active until the second release', () => {
    const { im } = createFocusedInputManager();

    press({ code: 'ControlLeft', key: 'Control', keyCode: 17 });
    press({ code: 'ControlRight', key: 'Control', keyCode: 17 });

    expect(ch(im, Keyboard.Control)).toBe(1);

    release({ code: 'ControlLeft', key: 'Control', keyCode: 17 });

    // Right Control is still held - the aggregate must stay active.
    expect(ch(im, Keyboard.ControlLeft)).toBe(0);
    expect(ch(im, Keyboard.ControlRight)).toBe(1);
    expect(ch(im, Keyboard.Control)).toBe(1);

    release({ code: 'ControlRight', key: 'Control', keyCode: 17 });

    expect(ch(im, Keyboard.Control)).toBe(0);

    im.destroy();
  });

  test('one physical modifier press produces exactly one onKeyDown dispatch, carrying the side channel', () => {
    const { im } = createFocusedInputManager();
    const onKeyDown = vi.fn();

    im.onKeyDown.add(onKeyDown);
    press({ code: 'AltLeft', key: 'Alt', keyCode: 18 });
    im.preUpdate(Time.seconds(0));

    expect(onKeyDown).toHaveBeenCalledTimes(1);
    expect(onKeyDown).toHaveBeenCalledWith(Keyboard.AltLeft);

    im.destroy();
  });

  test('a binding on the aggregate channel activates from either physical side', () => {
    const { im } = createFocusedInputManager();
    const onStart = vi.fn();

    im.onStart(Keyboard.Control, onStart);

    press({ code: 'ControlRight', key: 'Control', keyCode: 17 });
    im.preUpdate(Time.seconds(0));

    expect(onStart).toHaveBeenCalledTimes(1);

    im.destroy();
  });

  test('a binding on one side channel does not activate from the other side', () => {
    const { im } = createFocusedInputManager();
    const onStart = vi.fn();

    im.onStart(Keyboard.ControlLeft, onStart);

    press({ code: 'ControlRight', key: 'Control', keyCode: 17 });
    im.preUpdate(Time.seconds(0));

    expect(onStart).not.toHaveBeenCalled();

    im.destroy();
  });

  test('canvas blur releases both side and aggregate channels together', () => {
    const { im, canvas } = createFocusedInputManager();

    press({ code: 'ShiftLeft', key: 'Shift', keyCode: 16 });

    expect(ch(im, Keyboard.ShiftLeft)).toBe(1);
    expect(ch(im, Keyboard.Shift)).toBe(1);

    canvas.dispatchEvent(new FocusEvent('blur'));

    expect(ch(im, Keyboard.ShiftLeft)).toBe(0);
    expect(ch(im, Keyboard.Shift)).toBe(0);

    im.destroy();
  });
});

describe('Keyboard enum stability', () => {
  // The exact pre-existing member -> value mapping, frozen here as a
  // regression guard: a serialized numeric binding (a persisted rebinding
  // profile, say) must keep resolving to the exact same Keyboard member it
  // always did. New side-specific channels occupy previously-unused slots
  // only - no existing member's value may ever move.
  const preexisting: Record<string, number> = {
    Backspace: 8,
    Tab: 9,
    Enter: 13,
    Shift: 16,
    Control: 17,
    Alt: 18,
    Pause: 19,
    CapsLock: 20,
    Escape: 27,
    Space: 32,
    PageUp: 33,
    PageDown: 34,
    End: 35,
    Home: 36,
    Left: 37,
    Up: 38,
    Right: 39,
    Down: 40,
    PrintScreen: 44,
    Insert: 45,
    Delete: 46,
    Help: 47,
    Zero: 48,
    One: 49,
    Two: 50,
    Three: 51,
    Four: 52,
    Five: 53,
    Six: 54,
    Seven: 55,
    Eight: 56,
    Nine: 57,
    A: 65,
    B: 66,
    C: 67,
    D: 68,
    E: 69,
    F: 70,
    G: 71,
    H: 72,
    I: 73,
    J: 74,
    K: 75,
    L: 76,
    M: 77,
    N: 78,
    O: 79,
    P: 80,
    Q: 81,
    R: 82,
    S: 83,
    T: 84,
    U: 85,
    V: 86,
    W: 87,
    X: 88,
    Y: 89,
    Z: 90,
    Meta: 91,
    ContextMenu: 93,
    NumPad0: 96,
    NumPad1: 97,
    NumPad2: 98,
    NumPad3: 99,
    NumPad4: 100,
    NumPad5: 101,
    NumPad6: 102,
    NumPad7: 103,
    NumPad8: 104,
    NumPad9: 105,
    NumPadMultiply: 106,
    NumPadAdd: 107,
    NumPadEnter: 108,
    NumPadSubtract: 109,
    NumPadDecimal: 110,
    NumPadDivide: 111,
    F1: 112,
    F2: 113,
    F3: 114,
    F4: 115,
    F5: 116,
    F6: 117,
    F7: 118,
    F8: 119,
    F9: 120,
    F10: 121,
    F11: 122,
    F12: 123,
    NumLock: 144,
    ScrollLock: 145,
    NumPadEqual: 146,
    IntlBackslash: 147,
    IntlRo: 148,
    IntlYen: 149,
    Colon: 186,
    Equals: 187,
    Comma: 188,
    Dash: 189,
    Period: 190,
    QuestionMark: 191,
    Tilde: 192,
    OpenBracket: 219,
    BackwardSlash: 220,
    ClosedBracket: 221,
    Quotes: 222,
  };

  test('every pre-existing member still resolves to its exact original numeric channel value', () => {
    expect(Object.keys(preexisting)).toHaveLength(105);

    for (const [name, value] of Object.entries(preexisting)) {
      expect((Keyboard as unknown as Record<string, number>)[name]).toBe(value);
    }
  });

  test('the new side-specific channels occupy only slots that were unused before this change', () => {
    const newChannels = {
      ShiftLeft: Keyboard.ShiftLeft,
      ShiftRight: Keyboard.ShiftRight,
      ControlLeft: Keyboard.ControlLeft,
      ControlRight: Keyboard.ControlRight,
      AltLeft: Keyboard.AltLeft,
      AltRight: Keyboard.AltRight,
      MetaLeft: Keyboard.MetaLeft,
      MetaRight: Keyboard.MetaRight,
    };
    const newValues = Object.values(newChannels);
    const preexistingValues = new Set(Object.values(preexisting));

    // Every new channel is distinct from every other new channel...
    expect(new Set(newValues).size).toBe(newValues.length);

    // ...and from every pre-existing channel.
    for (const value of newValues) {
      expect(preexistingValues.has(value)).toBe(false);
    }
  });

  test('the full enum has exactly 113 members, each with a unique numeric value', () => {
    const forwardEntries = Object.entries(Keyboard).filter((entry): entry is [string, number] => typeof entry[1] === 'number');

    expect(forwardEntries).toHaveLength(113);
    expect(new Set(forwardEntries.map(([, value]) => value)).size).toBe(113);
  });
});
