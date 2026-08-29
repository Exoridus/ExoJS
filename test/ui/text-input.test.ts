import type { Application } from '#core/Application';
import { Scene } from '#core/Scene';
import type { SceneScope } from '#core/SceneScope';
import { SceneState } from '#core/SceneState';
import { Signal } from '#core/Signal';
import type { Seconds } from '#core/units';
import type { ContextMenuRequest } from '#input/ContextMenuRequest';
import { FocusController } from '#input/FocusController';
import type { Gamepad } from '#input/Gamepad';
import type { GamepadButton } from '#input/GamepadButton';
import type { InputManager } from '#input/InputManager';
import { InteractionManager } from '#input/InteractionManager';
import type { Pointer } from '#input/Pointer';
import { Keyboard } from '#input/types';
import type { Rectangle } from '#math/Rectangle';
import { BrowserPlatform } from '#platform/BrowserPlatform';
import type { PlatformTextInput } from '#platform/PlatformTextInput';
import type { GlyphAtlas } from '#rendering/text/GlyphAtlas';
import type { GlyphAtlasPool } from '#rendering/text/GlyphAtlasPool';
import { resetDefaultGlyphAtlasPool } from '#rendering/text/GlyphAtlasPool';
import type { GlyphInfo } from '#rendering/text/types';
import { TextInput } from '#ui/TextInput';

import { frameDelta } from '../support/frame-delta';

// Text needs a glyph atlas; inject a deterministic mock so the field is
// constructible without a real canvas (jsdom has no measureText). Advance 10,
// ink width 8: every glyph spans [10k, 10k + 8] in layout space.
const fixedGlyphInfo: GlyphInfo = { x: 0, y: 0, width: 8, height: 16, advance: 10, ascent: 13, page: 0, uvLeft: 0, uvTop: 0, uvRight: 0.01, uvBottom: 0.02 };
const mockPage = {
  texture: {
    width: 1024,
    height: 1024,
    version: 1,
    source: null,
    scaleMode: 0,
    wrapMode: 0,
    premultiplyAlpha: false,
    generateMipMap: false,
    flipY: false,
    addDestroyListener: () => mockPage.texture,
    removeDestroyListener: () => mockPage.texture,
    destroy: () => undefined,
  },
  index: 0,
  mode: 'sdf' as const,
};
const mockAtlas: Partial<GlyphAtlas> = {
  getGlyph: vi.fn(() => fixedGlyphInfo),
  pages: [mockPage] as unknown as GlyphAtlas['pages'],
  mode: 'sdf',
  clear: vi.fn(),
};
const mockPool = { getAtlas: vi.fn(() => mockAtlas) };

beforeEach(() => {
  resetDefaultGlyphAtlasPool(mockPool as unknown as GlyphAtlasPool);
});
afterEach(() => {
  resetDefaultGlyphAtlasPool();

  // Each focused field lazily creates a hidden <textarea> transport; the widget
  // only removes it on destroy(). Tests build a fresh field per case and never
  // destroy it, so clear any leftovers to keep `querySelector('textarea')`
  // pointing at the field under test.
  document.body.querySelectorAll('textarea').forEach(element => element.remove());
});

interface Harness {
  scene: Scene;
  im: InteractionManager;
  signals: {
    onPointerEnter: Signal<[Pointer]>;
    onPointerLeave: Signal<[Pointer]>;
    onPointerDown: Signal<[Pointer, number, number]>;
    onPointerMove: Signal<[Pointer, number, number]>;
    onPointerUp: Signal<[Pointer, number, number]>;
    onPointerTap: Signal<[Pointer, number, number]>;
    onPointerCancel: Signal<[Pointer, number, number]>;
    onContextMenu: Signal<[ContextMenuRequest]>;
    onKeyDown: Signal<[number]>;
    onKeyUp: Signal<[number]>;
    onAnyGamepadButtonDown: Signal<[Gamepad, GamepadButton, number]>;
    _finishInteractionFrame(): void;
  };
}

const createUIApp = (platform: unknown = null): Harness => {
  const canvas = document.createElement('canvas');
  const signals = {
    onPointerEnter: new Signal<[Pointer]>(),
    onPointerLeave: new Signal<[Pointer]>(),
    onPointerDown: new Signal<[Pointer, number, number]>(),
    onPointerMove: new Signal<[Pointer, number, number]>(),
    onPointerUp: new Signal<[Pointer, number, number]>(),
    onPointerTap: new Signal<[Pointer, number, number]>(),
    onPointerCancel: new Signal<[Pointer, number, number]>(),
    onContextMenu: new Signal<[ContextMenuRequest]>(),
    onKeyDown: new Signal<[number]>(),
    onKeyUp: new Signal<[number]>(),
    onAnyGamepadButtonDown: new Signal<[Gamepad, GamepadButton, number]>(),
    _finishInteractionFrame: (): void => undefined,
  };
  const scene = new Scene();
  const app = {
    canvas,
    platform: platform ?? new BrowserPlatform(canvas),
    width: 800,
    height: 600,
    input: signals as unknown as InputManager,
    onFrame: new Signal<[Seconds]>(),
    focus: null as FocusController | null,
    interaction: null as InteractionManager | null,
    rendering: {
      view: { screenToWorld: (x: number, y: number): { x: number; y: number } => ({ x, y }) },
      screenView: { screenToWorld: (x: number, y: number): { x: number; y: number } => ({ x, y }) },
    },
    scenes: {
      get currentScene(): Scene | null {
        return scene;
      },
      state: SceneState.Active,
      _transitionGateOpen: false,
    },
  };
  const typed = app as unknown as Application;

  app.focus = new FocusController(typed);
  app.interaction = new InteractionManager(typed);
  scene._attach(typed, {} as unknown as SceneScope<void>);
  app.interaction.attachRoot(scene.root);

  return { scene, im: app.interaction, signals };
};

const makePointer = (x: number, y: number, id = 1): Pointer => ({ id, x, y, type: 'mouse', isPrimary: true }) as unknown as Pointer;

const press = (harness: Harness, x: number, y: number): void => {
  harness.signals.onPointerDown.dispatch(makePointer(x, y), x, y);
  harness.im.preUpdate(frameDelta);
};

/** Fire a synthetic `beforeinput` on the transport textarea the seam created. */
const fireBeforeInput = (
  inputType: string,
  init: { data?: string; dataTransfer?: { getData: (type: string) => string } | null } = {},
): { defaultPrevented: boolean } => {
  const textarea = document.body.querySelector('textarea');

  if (textarea === null) {
    throw new Error('no transport textarea exists - the field has no seam');
  }

  const event = new Event('beforeinput', { cancelable: true, bubbles: true }) as InputEvent;

  Object.defineProperty(event, 'inputType', { value: inputType });

  if (init.data !== undefined) {
    Object.defineProperty(event, 'data', { value: init.data });
  }

  if (init.dataTransfer !== undefined) {
    Object.defineProperty(event, 'dataTransfer', { value: init.dataTransfer });
  }

  textarea.dispatchEvent(event);

  return { defaultPrevented: event.defaultPrevented };
};

const transportTextarea = (): HTMLTextAreaElement => {
  const textarea = document.body.querySelector('textarea');

  if (textarea === null) {
    throw new Error('no transport textarea exists - the field has no seam');
  }

  return textarea as HTMLTextAreaElement;
};

const type = (text: string): void => {
  for (const char of [...text]) {
    fireBeforeInput('insertText', { data: char });
  }
};

describe('TextInput', () => {
  test('a pointer press takes focus and places the caret', () => {
    const harness = createUIApp();
    const field = new TextInput({ width: 200, height: 36 });

    harness.scene.ui.addChild(field);

    // (5, 18) is left of the content box (inset 8) - the caret starts at 0.
    press(harness, 5, 18);
    expect(harness.im.focused).toBe(field);

    type('hello');
    expect(field.value).toBe('hello');

    // Glyph k spans [10k, 10k + 8] in layout space; screen x = 8 (inset) + 13
    // lands in the left half of glyph 1.
    press(harness, 21, 18);
    expect(field.selectionStart).toBe(1);

    // Far right of the text: the caret sits after the last glyph.
    press(harness, 103, 18);
    expect(field.selectionStart).toBe(5);
  });

  test('a press-drag extends a selection from the anchor', () => {
    const harness = createUIApp();
    const field = new TextInput({ width: 200, height: 36 });

    harness.scene.ui.addChild(field);
    press(harness, 5, 18);
    type('hello');

    harness.signals.onPointerMove.dispatch(makePointer(53, 18), 53, 18);
    expect(field.selectionStart).toBe(0);
    expect(field.selectionEnd).toBe(5);

    harness.signals.onPointerUp.dispatch(makePointer(53, 18), 53, 18);
    expect(field.selectionStart).toBe(0);
    expect(field.selectionEnd).toBe(5);
  });

  test('a double press selects the word under the pointer', () => {
    const harness = createUIApp();
    const field = new TextInput({ width: 200, height: 36 });

    harness.scene.ui.addChild(field);
    press(harness, 5, 18);
    type('ab cd');
    press(harness, 5, 18);

    press(harness, 6, 18);

    expect(field.selectionStart).toBe(0);
    expect(field.selectionEnd).toBe(2);
  });

  test('editing keys are consumed, so focus navigation does not also react', () => {
    const harness = createUIApp();
    const field = new TextInput({ width: 200, height: 36 });
    const other = new TextInput({ width: 100, height: 36 });

    harness.scene.ui.addChild(field);
    // Placed clear of the press point so the press below lands on `field`, not
    // the topmost overlapping control - the second field only proves focus is
    // not lost to it while `field` is editing.
    other.setPosition(0, 50);
    harness.scene.ui.addChild(other);
    press(harness, 5, 18);
    type('ab');

    harness.signals.onKeyDown.dispatch(Keyboard.Left);

    expect(harness.im.focused).toBe(field);
    expect(field.selectionStart).toBe(1);
  });

  test('Escape releases focus and stays unconsumed', () => {
    const harness = createUIApp();
    const field = new TextInput({ width: 200, height: 36 });

    harness.scene.ui.addChild(field);
    press(harness, 5, 18);
    expect(harness.im.focused).toBe(field);

    harness.signals.onKeyDown.dispatch(Keyboard.Escape);

    expect(harness.im.focused).toBeNull();
  });

  test('onChange and onSubmit fire from transport edits and Enter', () => {
    const harness = createUIApp();
    const field = new TextInput({ width: 200, height: 36 });
    const values: string[] = [];
    const submits: string[] = [];

    field.onChange.add(value => values.push(value));
    field.onSubmit.add(value => submits.push(value));
    harness.scene.ui.addChild(field);
    press(harness, 5, 18);

    type('ab');

    expect(values).toEqual(['a', 'ab']);

    harness.signals.onKeyDown.dispatch(Keyboard.Enter);

    expect(submits).toEqual(['ab']);
  });

  test('readOnly rejects transport edits', () => {
    const harness = createUIApp();
    const field = new TextInput({ width: 200, height: 36, readOnly: true });

    harness.scene.ui.addChild(field);
    press(harness, 5, 18);

    expect(fireBeforeInput('insertText', { data: 'x' }).defaultPrevented).toBe(true);

    expect(field.value).toBe('');
  });

  test('maxLength truncates transport inserts', () => {
    const harness = createUIApp();
    const field = new TextInput({ width: 200, height: 36, maxLength: 3 });

    harness.scene.ui.addChild(field);
    press(harness, 5, 18);
    type('abcd');

    expect(field.value).toBe('abc');
  });

  test('a paste that the filter rejects is dropped whole', () => {
    const harness = createUIApp();
    const field = new TextInput({ width: 200, height: 36 });

    field.filter = candidate => !candidate.includes('x');
    harness.scene.ui.addChild(field);
    press(harness, 5, 18);

    fireBeforeInput('insertFromPaste', { dataTransfer: { getData: () => 'exit' } });

    expect(field.value).toBe('');
  });

  test('a newline from the transport is refused in a single-line field', () => {
    const harness = createUIApp();
    const field = new TextInput({ width: 200, height: 36 });

    harness.scene.ui.addChild(field);
    press(harness, 5, 18);
    type('ab');

    expect(fireBeforeInput('insertLineBreak').defaultPrevented).toBe(true);

    expect(field.value).toBe('ab');
  });

  test('a masked field renders the mask and the transport refuses clipboard reads', () => {
    const harness = createUIApp();
    const field = new TextInput({ width: 200, height: 36, maskChar: '*' });

    harness.scene.ui.addChild(field);
    press(harness, 5, 18);
    type('ab');

    expect(field.value).toBe('ab');
    expect(field.renderedText).toBe('**');
    expect(field.textNode.text).toBe('**');

    const copy = new Event('copy', { cancelable: true, bubbles: true });

    transportTextarea().dispatchEvent(copy);
    expect(copy.defaultPrevented).toBe(true);

    // Cut is refused as an edit, and cancelling it cancels the clipboard write.
    expect(fireBeforeInput('deleteByCut').defaultPrevented).toBe(true);
    expect(field.value).toBe('ab');
  });

  test('an unmasked cut is forwarded so the clipboard write survives', () => {
    const harness = createUIApp();
    const field = new TextInput({ width: 200, height: 36 });

    harness.scene.ui.addChild(field);
    press(harness, 5, 18);
    type('ab');
    field.selectAll();

    expect(fireBeforeInput('deleteByCut').defaultPrevented).toBe(false);
    expect(field.value).toBe('');

    const copy = new Event('copy', { cancelable: true, bubbles: true });

    transportTextarea().dispatchEvent(copy);
    expect(copy.defaultPrevented).toBe(false);
  });

  test('a null seam leaves the field visible and focused but not editable', () => {
    const platform = new BrowserPlatform(document.createElement('canvas'));

    Object.defineProperty(platform, 'createTextInput', { value: () => null });

    const harness = createUIApp(platform);
    const field = new TextInput({ width: 200, height: 36 });

    harness.scene.ui.addChild(field);
    press(harness, 5, 18);

    expect(harness.im.focused).toBe(field);
    expect(document.body.querySelector('textarea')).toBeNull();
    expect(field.visible).toBe(true);

    harness.signals.onKeyDown.dispatch(Keyboard.Backspace);
    harness.signals.onKeyDown.dispatch(Keyboard.Left);

    expect(field.value).toBe('');
    expect(harness.im.focused).toBe(field);
  });

  test('composition text stays out of the value until it commits', () => {
    const harness = createUIApp();
    const field = new TextInput({ width: 200, height: 36 });

    harness.scene.ui.addChild(field);
    press(harness, 5, 18);

    const textarea = transportTextarea();
    const fire = (type: string, data: string): void => {
      const event = new Event(type, { cancelable: true, bubbles: true }) as CompositionEvent;

      Object.defineProperty(event, 'data', { value: data });
      textarea.dispatchEvent(event);
    };

    fire('compositionstart', '');
    fireBeforeInput('insertCompositionText', { data: 'k' });
    fire('compositionupdate', 'ka');
    fire('compositionend', 'ka');

    expect(field.value).toBe('ka');
    expect(field.renderedText).toBe('ka');
  });

  test('the caret follows the composition candidate while it is in flight', () => {
    const platform = new BrowserPlatform(document.createElement('canvas'));
    const caretRects: Rectangle[] = [];
    const create = platform.createTextInput.bind(platform);

    Object.defineProperty(platform, 'createTextInput', {
      value: (): PlatformTextInput | null => {
        const seam = create();

        if (seam === null) {
          return null;
        }

        const setCaretRect = seam.setCaretRect.bind(seam);

        seam.setCaretRect = (rect: Rectangle): void => {
          caretRects.push(rect.clone());
          setCaretRect(rect);
        };

        return seam;
      },
    });

    const harness = createUIApp(platform);
    const field = new TextInput({ width: 200, height: 36 });

    harness.scene.ui.addChild(field);
    press(harness, 5, 18);

    const textarea = transportTextarea();
    const fire = (type: string, data: string): void => {
      const event = new Event(type, { cancelable: true, bubbles: true }) as CompositionEvent;

      Object.defineProperty(event, 'data', { value: data });
      textarea.dispatchEvent(event);
    };

    fire('compositionstart', '');
    fire('compositionupdate', 'k');

    const oneGlyph = caretRects.at(-1);

    fire('compositionupdate', 'kan');

    const threeGlyphs = caretRects.at(-1);

    // Advance is 10 per glyph and the content box starts at inset 8: the caret
    // sits behind the candidate, which lives outside `value` entirely.
    expect(oneGlyph?.x).toBe(18);
    expect(threeGlyphs?.x).toBe(38);
  });

  test('runs of spaces are laid out one glyph each, so hit testing stays aligned', () => {
    const harness = createUIApp();
    const field = new TextInput({ width: 200, height: 36 });

    harness.scene.ui.addChild(field);
    press(harness, 5, 18);
    type('a  b');

    expect(field.value).toBe('a  b');

    // Four glyphs at advance 10 from inset 8. Collapsed whitespace would place
    // 'b' at glyph 2 and answer 2 here.
    press(harness, 8 + 32, 18);
    expect(field.selectionStart).toBe(3);

    press(harness, 8 + 45, 18);
    expect(field.selectionStart).toBe(4);
  });

  test('the transport mirrors value and selection after edits', () => {
    const harness = createUIApp();
    const field = new TextInput({ width: 200, height: 36 });

    harness.scene.ui.addChild(field);
    press(harness, 5, 18);
    type('ab');

    const textarea = transportTextarea();

    expect(textarea.value).toBe('ab');
    expect(textarea.selectionStart).toBe(2);
  });

  test('hints reach the transport element', () => {
    const harness = createUIApp();
    const field = new TextInput({ width: 200, height: 36, inputMode: 'numeric', enterKeyHint: 'go' });

    harness.scene.ui.addChild(field);
    press(harness, 5, 18);

    const textarea = transportTextarea();

    expect(textarea.inputMode).toBe('numeric');
    expect(textarea.enterKeyHint).toBe('go');
  });

  test('the placeholder shows while the field is empty and hides once text arrives', () => {
    const harness = createUIApp();
    const field = new TextInput({ width: 200, height: 36, placeholder: 'Name' });

    harness.scene.ui.addChild(field);

    expect(field.placeholderNode.visible).toBe(true);
    expect(field.placeholderNode.text).toBe('Name');

    press(harness, 5, 18);
    type('a');

    expect(field.placeholderNode.visible).toBe(false);
  });
});
