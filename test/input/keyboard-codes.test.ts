/**
 * Tests for the layout-independent keyboard channel mapping: `KeyboardEvent.code`
 * (physical key position) resolves to a `Keyboard` channel, and the
 * layout-dependent `KeyboardEvent.keyCode` is never consulted.
 */

import type { Application } from '#core/Application';
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

  test('folds both physical sides of a modifier onto one channel', () => {
    expect(keyboardChannelFromCode('ShiftLeft')).toBe(Keyboard.Shift);
    expect(keyboardChannelFromCode('ShiftRight')).toBe(Keyboard.Shift);
    expect(keyboardChannelFromCode('ControlLeft')).toBe(Keyboard.Control);
    expect(keyboardChannelFromCode('ControlRight')).toBe(Keyboard.Control);
    expect(keyboardChannelFromCode('AltLeft')).toBe(Keyboard.Alt);
    expect(keyboardChannelFromCode('AltRight')).toBe(Keyboard.Alt);
    expect(keyboardChannelFromCode('MetaLeft')).toBe(Keyboard.Meta);
    expect(keyboardChannelFromCode('MetaRight')).toBe(Keyboard.Meta);
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
    // "m". Neither changes the channel — the member is named for the US-QWERTY
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

  test('both shift keys drive the single Shift channel', () => {
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
    im.update();

    expect(onKeyDown).not.toHaveBeenCalled();
    expect(onKeyUp).not.toHaveBeenCalled();

    im.destroy();
  });

  test('a mapped keydown still reaches the onKeyDown signal with its channel', () => {
    const { im } = createFocusedInputManager();
    const onKeyDown = vi.fn();

    im.onKeyDown.add(onKeyDown);
    press({ code: 'ArrowLeft', key: 'ArrowLeft', keyCode: 37 });
    im.update();

    expect(onKeyDown).toHaveBeenCalledTimes(1);
    expect(onKeyDown).toHaveBeenCalledWith(Keyboard.Left);

    im.destroy();
  });
});
