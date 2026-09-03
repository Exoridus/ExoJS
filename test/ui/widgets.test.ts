import { Color } from '#core/Color';
import { Signal } from '#core/Signal';
import { KeyEvent } from '#input/KeyEvent';
import { Keyboard } from '#input/types';
import { Rectangle } from '#math/Rectangle';
import { Container } from '#rendering/Container';
import { Graphics } from '#rendering/primitives/Graphics';
import { NineSliceSprite } from '#rendering/sprite/NineSliceSprite';
import { RepeatingSprite } from '#rendering/sprite/RepeatingSprite';
import type { GlyphAtlas } from '#rendering/text/GlyphAtlas';
import type { GlyphAtlasPool } from '#rendering/text/GlyphAtlasPool';
import { resetDefaultGlyphAtlasPool } from '#rendering/text/GlyphAtlasPool';
import type { GlyphInfo } from '#rendering/text/types';
import type { Texture } from '#rendering/texture/Texture';
import { Button } from '#ui/Button';
import { Checkbox } from '#ui/Checkbox';
import { Dropdown } from '#ui/Dropdown';
import { Label } from '#ui/Label';
import { Panel } from '#ui/Panel';
import { ProgressBar } from '#ui/ProgressBar';
import { Slider } from '#ui/Slider';
import { Stack } from '#ui/Stack';
import type { UITheme } from '#ui/theme';
import { createUITheme } from '#ui/theme';
import { Toggle } from '#ui/Toggle';
import { UIRoot } from '#ui/UIRoot';

import { createUIApp, press } from '../support/text-field-harness';

// Text (used by Label/Button) needs a glyph atlas; inject a deterministic mock
// so widgets are constructible without a real canvas (jsdom has no measureText).
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
  onCleared: new Signal(),
};
const mockPool = { getAtlas: vi.fn(() => mockAtlas) };

beforeEach(() => {
  resetDefaultGlyphAtlasPool(mockPool as unknown as GlyphAtlasPool);
});
afterEach(() => {
  resetDefaultGlyphAtlasPool();
});

describe('Panel', () => {
  test('takes its explicit layout size', () => {
    const panel = new Panel({ width: 200, height: 100 });

    expect(panel.uiWidth).toBe(200);
    expect(panel.uiHeight).toBe(100);
  });

  test('defaults to zero size and no border when constructed with no options', () => {
    const panel = new Panel();

    expect(panel.uiWidth).toBe(0);
    expect(panel.uiHeight).toBe(0);
    expect(panel.borderWidth).toBe(0);
  });

  test('exposes its painted node and the fill values in effect', () => {
    const color = new Color(10, 20, 30, 1);
    const borderColor = new Color(1, 2, 3, 1);
    const panel = new Panel({ width: 100, height: 50, color, borderColor, borderWidth: 3, cornerRadius: 12 });

    expect(panel.backgroundNode).toBeInstanceOf(Graphics);
    expect(panel.background.kind).toBe('fill');
    expect(panel.color?.r).toBe(10);
    expect(panel.borderColor?.r).toBe(1);
    expect(panel.borderWidth).toBe(3);
    expect(panel.cornerRadius).toBe(12);
  });

  test('resizing to zero skips (re)drawing the background without throwing', () => {
    // Constructing directly at (0, 0) is a same-value no-op against the Widget
    // default (_uiWidth/_uiHeight start at 0) and never runs _relayout - so the
    // zero-size early return is only reachable via an explicit resize away
    // from a non-zero starting size.
    const panel = new Panel({ width: 100, height: 50 });

    expect(() => panel.setSize(0, 0)).not.toThrow();
  });

  test('destroy detaches its background node and tolerates a second call', () => {
    const panel = new Panel({ width: 100, height: 50, color: new Color(10, 20, 30, 1) });

    expect(panel.backgroundNode).not.toBeNull();

    panel.destroy();

    expect(panel.destroyed).toBe(true);
    expect(panel.backgroundNode).toBeNull();
    expect(() => panel.destroy()).not.toThrow();
  });
});

describe('Button', () => {
  test('is interactive and focusable', () => {
    const button = new Button();

    expect(button.interactive).toBe(true);
    expect(button.focusable).toBe(true);
  });

  test('fires onClick on Enter and Space when focused', () => {
    const button = new Button({ label: 'OK' });
    const handler = vi.fn();

    button.onClick.add(handler);

    button.onKeyDown.dispatch(new KeyEvent('keydown', Keyboard.Enter, button));
    expect(handler).toHaveBeenCalledTimes(1);

    button.onKeyDown.dispatch(new KeyEvent('keydown', Keyboard.Space, button));
    expect(handler).toHaveBeenCalledTimes(2);

    // An unrelated key does nothing.
    button.onKeyDown.dispatch(new KeyEvent('keydown', Keyboard.Escape, button));
    expect(handler).toHaveBeenCalledTimes(2);
  });

  test('fires onClick on pointer tap', () => {
    const button = new Button();
    const handler = vi.fn();

    button.onClick.add(handler);
    button.onPointerTap.dispatch({} as never);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('disabled button ignores activation and is non-interactive', () => {
    const button = new Button();
    const handler = vi.fn();

    button.onClick.add(handler);
    button.enabled = false;

    button.onKeyDown.dispatch(new KeyEvent('keydown', Keyboard.Enter, button));

    expect(handler).not.toHaveBeenCalled();
    expect(button.interactive).toBe(false);
  });

  test('exposes and updates its label', () => {
    const button = new Button({ label: 'Start' });

    expect(button.label).toBe('Start');

    button.label = 'Stop';
    expect(button.label).toBe('Stop');
  });

  test('exposes colors, cornerRadius, textColor, fontSize getters', () => {
    const button = new Button({ cornerRadius: 4, textColor: new Color(9, 9, 9, 1), fontSize: 20 });

    expect(button.cornerRadius).toBe(4);
    expect(button.textColor.r).toBe(9);
    expect(button.fontSize).toBe(20);
    expect(button.colors.normal).toBeInstanceOf(Color);
  });

  test('pointer-over/out toggles the hover state while enabled', () => {
    const button = new Button();

    expect(() => button.onPointerOver.dispatch({} as never)).not.toThrow();
    expect(() => button.onPointerOut.dispatch({} as never)).not.toThrow();
  });

  test('pointer-down sets the pressed state only while enabled', () => {
    const button = new Button();

    button.onPointerDown.dispatch({} as never); // enabled -> pressed + redraw
    button.onPointerUp.dispatch({} as never); // -> refreshState

    button.enabled = false;
    expect(() => button.onPointerDown.dispatch({} as never)).not.toThrow(); // disabled -> no-op
  });

  test('a disabled button ignores a pointer tap (onClick not dispatched)', () => {
    const button = new Button();
    const handler = vi.fn();

    button.onClick.add(handler);
    button.enabled = false;
    button.onPointerTap.dispatch({} as never);

    expect(handler).not.toHaveBeenCalled();
  });

  test('resizing to zero skips (re)drawing the background without throwing', () => {
    // A Button constructed directly at (0, 0) is a same-value no-op against the
    // Widget default (_uiWidth/_uiHeight start at 0) and never runs _relayout -
    // so the zero-size early return in _draw() is only reachable via an
    // explicit resize away from a non-zero starting size.
    const button = new Button();

    expect(() => button.setSize(0, 0)).not.toThrow();
  });

  test("a disabled parent Panel makes a contained Button non-interactive and blocks activation, without touching the button's own enabled (ME-56)", () => {
    const panel = new Panel();
    const button = new Button();
    const handler = vi.fn();

    panel.addChild(button);
    button.onClick.add(handler);

    panel.enabled = false;

    expect(button.effectiveEnabled).toBe(false);
    expect(button.enabled).toBe(true); // own flag untouched
    expect(button.interactive).toBe(false);

    button.onKeyDown.dispatch(new KeyEvent('keydown', Keyboard.Enter, button));
    button.onPointerTap.dispatch({} as never);
    expect(handler).not.toHaveBeenCalled();
  });

  test("re-enabling the parent Panel restores the contained Button's interactivity automatically (ME-56)", () => {
    const panel = new Panel();
    const button = new Button();
    const handler = vi.fn();

    panel.addChild(button);
    button.onClick.add(handler);

    panel.enabled = false;
    panel.enabled = true;

    expect(button.effectiveEnabled).toBe(true);
    expect(button.interactive).toBe(true);

    button.onPointerTap.dispatch({} as never);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe('ProgressBar', () => {
  test('clamps value to [0, 1]', () => {
    const bar = new ProgressBar({ value: 0.5 });

    expect(bar.value).toBe(0.5);

    bar.value = 2;
    expect(bar.value).toBe(1);

    bar.value = -1;
    expect(bar.value).toBe(0);
  });

  test('setting the same clamped value again is a no-op (no redraw)', () => {
    const bar = new ProgressBar({ value: 0.5 });

    bar.value = 0.5;
    expect(bar.value).toBe(0.5);

    // 2 clamps to the same 1 twice in a row - second assignment is the no-op branch.
    bar.value = 1;
    bar.value = 2;
    expect(bar.value).toBe(1);
  });

  test('exposes trackColor, fillColor, cornerRadius getters', () => {
    const bar = new ProgressBar({ trackColor: new Color(1, 2, 3, 1), fillColor: new Color(4, 5, 6, 1), cornerRadius: 6 });

    expect(bar.trackColor?.r).toBe(1);
    expect(bar.fillColor?.r).toBe(4);
    expect(bar.cornerRadius).toBe(6);
  });

  test('defaults to no options and a zero fill value (empty-fill draw branch)', () => {
    const bar = new ProgressBar();

    expect(bar.value).toBe(0);
  });

  test('resizing the track to zero skips (re)drawing it without throwing', () => {
    // Constructing directly at (0, 0) is a same-value no-op against the Widget
    // default (_uiWidth/_uiHeight start at 0) and never runs _relayout - so the
    // zero-size early return in _drawTrack() is only reachable via an explicit
    // resize away from a non-zero starting size.
    const bar = new ProgressBar({ width: 200, height: 12 });

    expect(() => bar.setSize(0, 0)).not.toThrow();
  });

  test('destroy detaches its track and bar nodes and tolerates a second call', () => {
    const bar = new ProgressBar({ width: 200, height: 12, value: 0.5 });

    expect(bar.trackNode).not.toBeNull();
    expect(bar.barNode).not.toBeNull();

    bar.destroy();

    expect(bar.destroyed).toBe(true);
    expect(bar.trackNode).toBeNull();
    expect(bar.barNode).toBeNull();
    expect(() => bar.destroy()).not.toThrow();
  });
});

describe('Label', () => {
  test('exposes and updates its text', () => {
    const label = new Label('Hello');

    expect(label.text).toBe('Hello');

    label.text = 'World';
    expect(label.text).toBe('World');
  });

  test('setting the same text again is a no-op (no re-measure)', () => {
    const label = new Label('Hello');

    label.text = 'Hello';
    expect(label.text).toBe('Hello');
  });

  test('constructs with no arguments and exposes the underlying textNode', () => {
    const label = new Label();

    expect(label.text).toBe('');
    expect(label.textNode).toBeDefined();
    expect(label.textNode.text).toBe('');
  });
});

describe('Widget anchoring', () => {
  test('anchors within a UIRoot box and re-applies on resize', () => {
    const root = new UIRoot();
    const panel = new Panel({ width: 100, height: 50 });

    root.addChild(panel);
    panel.anchorIn(root, 'bottom-right', -10, -10);
    root.onResize.dispatch(800, 600);

    expect(panel.position.x).toBe(800 - 100 - 10);
    expect(panel.position.y).toBe(600 - 50 - 10);
  });

  test('centers when anchored to center', () => {
    const root = new UIRoot();
    const panel = new Panel({ width: 100, height: 50 });

    root.addChild(panel);
    panel.anchorIn(root, 'center');
    root.onResize.dispatch(800, 600);

    expect(panel.position.x).toBe((800 - 100) / 2);
    expect(panel.position.y).toBe((600 - 50) / 2);
  });
});

describe('Stack', () => {
  test('flows children in a column and sizes to fit', () => {
    const stack = new Stack({ direction: 'column', spacing: 10 });
    const a = new Panel({ width: 100, height: 30 });
    const b = new Panel({ width: 80, height: 40 });

    stack.addItem(a);
    stack.addItem(b);

    expect(a.position.y).toBe(0);
    expect(b.position.y).toBe(40);
    expect(stack.uiWidth).toBe(100);
    expect(stack.uiHeight).toBe(80);
  });

  test('flows children in a row', () => {
    const stack = new Stack({ direction: 'row', spacing: 5 });
    const a = new Panel({ width: 60, height: 20 });
    const b = new Panel({ width: 40, height: 30 });

    stack.addItem(a);
    stack.addItem(b);

    expect(a.position.x).toBe(0);
    expect(b.position.x).toBe(65);
    expect(stack.uiWidth).toBe(105);
    expect(stack.uiHeight).toBe(30);
  });

  test('removeItem removes a child and re-flows the remaining ones', () => {
    const stack = new Stack({ direction: 'column', spacing: 10 });
    const a = new Panel({ width: 100, height: 30 });
    const b = new Panel({ width: 80, height: 40 });

    stack.addItem(a);
    stack.addItem(b);
    stack.removeItem(a);

    expect(stack.children).toEqual([b]);
    expect(b.position.y).toBe(0);
    expect(stack.uiHeight).toBe(40);
  });

  test('removeItem is a no-op for a node that is not one of its items', () => {
    const stack = new Stack();
    const a = new Panel({ width: 100, height: 30 });
    const stray = new Panel({ width: 10, height: 10 });

    stack.addItem(a);

    expect(() => stack.removeItem(stray)).not.toThrow();
    expect(stack.children).toEqual([a]);
  });

  test('exposes direction, spacing, padding getters', () => {
    const stack = new Stack({ direction: 'row', spacing: 12, padding: 4 });

    expect(stack.direction).toBe('row');
    expect(stack.spacing).toBe(12);
    expect(stack.padding).toBe(4);
  });

  test('defaults to column direction, spacing 8, padding 0', () => {
    const stack = new Stack();

    expect(stack.direction).toBe('column');
    expect(stack.spacing).toBe(8);
    expect(stack.padding).toBe(0);
  });

  test('lays out a non-Widget child using its own getLocalBounds() (not uiWidth/uiHeight)', () => {
    const stack = new Stack({ direction: 'row', spacing: 0 });
    const gfx = new Graphics();

    // Graphics (unlike Widget) does not expose an explicit layout size - the
    // `child instanceof Widget` branch in Stack.layout() falls back to
    // getLocalBounds() for it, which this stubs to a known non-zero size.
    vi.spyOn(gfx, 'getLocalBounds').mockReturnValue(new Rectangle(0, 0, 40, 20));

    stack.addItem(gfx);

    expect(gfx.position.x).toBe(0);
    expect(stack.uiWidth).toBe(40);
    expect(stack.uiHeight).toBe(20);
  });
});

// ── Skins, themes and controlled setters ─────────────────────────────────────

const textureStub = (): Texture =>
  ({
    width: 128,
    height: 64,
    version: 1,
    source: null,
    addDestroyListener: () => undefined,
    removeDestroyListener: () => undefined,
  }) as unknown as Texture;

const themeWith = (color: Color): UITheme =>
  createUITheme({ panel: { normal: { background: { kind: 'fill', color, borderColor: Color.black, borderWidth: 0, cornerRadius: 2 } } } });

describe('widget skins', () => {
  test('a panel paints the theme it inherits and follows a later theme change', () => {
    const root = new UIRoot();
    const panel = new Panel({ width: 40, height: 20 });

    root.addChild(panel);
    root.theme = themeWith(new Color(9, 8, 7, 1));

    expect(panel.color?.r).toBe(9);
    expect(panel.cornerRadius).toBe(2);
    expect(panel.backgroundNode).toBeInstanceOf(Graphics);
  });

  test('a panel override wins over the theme and repaints', () => {
    const root = new UIRoot();
    const panel = new Panel({ width: 40, height: 20 });

    root.addChild(panel);
    root.theme = themeWith(new Color(9, 8, 7, 1));
    panel.setFill({ color: new Color(1, 1, 1, 1) });

    expect(panel.color?.r).toBe(1);
    expect(panel.fillOverrides?.color?.r).toBe(1);

    panel.setFill(null);

    expect(panel.color?.r).toBe(9);
  });

  test('a texture skin swaps the painted node and keeps it below the content', () => {
    const panel = new Panel({ width: 40, height: 20 });
    const content = new Container();

    panel.addChild(content);
    panel.setBackground({ kind: 'nineSlice', texture: textureStub(), slices: 4 });

    expect(panel.backgroundNode).toBeInstanceOf(NineSliceSprite);
    expect(panel.children[0]).toBe(panel.backgroundNode);

    panel.setBackground(null);

    expect(panel.backgroundNode).toBeInstanceOf(Graphics);
    expect(panel.children[0]).toBe(panel.backgroundNode);
  });

  test('a button resolves a skin per state and overrides one state at a time', () => {
    const button = new Button({ width: 80, height: 30 });

    expect(button.state).toBe('normal');
    expect(button.colors.hover?.r).toBe(74);

    button.setFill({ color: new Color(3, 3, 3, 1) }, 'hover');

    expect(button.colors.hover?.r).toBe(3);
    expect(button.colors.normal?.r).toBe(54);
  });

  test('a disabled button paints its disabled skin', () => {
    const button = new Button({ width: 80, height: 30 });

    button.enabled = false;

    expect(button.state).toBe('disabled');
    expect(button.colors.disabled?.r).toBe(70);
  });

  test('a button follows the theme text style and re-centers the label', () => {
    const root = new UIRoot();
    const button = new Button({ width: 80, height: 30, label: 'Go' });

    root.addChild(button);
    root.theme = createUITheme({ button: { normal: { text: { fontSize: 32 } } } });

    expect(button.fontSize).toBe(32);
  });

  test('a label takes its style from the theme and re-measures on an override', () => {
    const root = new UIRoot();
    const label = new Label('Score');

    root.addChild(label);
    root.theme = createUITheme({ label: { normal: { text: { fontSize: 40 } } } });

    expect(label.textNode.style.fontSize).toBe(40);

    label.setTextStyle({ fontSize: 8 });

    expect(label.textNode.style.fontSize).toBe(8);
    expect(label.textStyleOverrides?.fontSize).toBe(8);
  });

  test('a progress bar themes its track and its bar independently', () => {
    const bar = new ProgressBar({ width: 100, height: 10, value: 0.5 });

    bar.setTrackFill({ color: new Color(2, 2, 2, 1) });

    expect(bar.trackColor?.r).toBe(2);
    expect(bar.fillColor?.r).toBe(80);
    expect(bar.fillOverrides.bar).toBeNull();
  });
});

describe('background input', () => {
  test('a panel takes a texture directly and slices it into thirds', () => {
    const panel = new Panel({ width: 40, height: 20, background: textureStub() });
    const background = panel.background;

    expect(panel.backgroundNode).toBeInstanceOf(NineSliceSprite);
    expect(background.kind === 'nineSlice' && background.slices).toEqual({ left: 42, top: 21, right: 42, bottom: 21 });
  });

  test('a panel takes a colour as a fill override and keeps the skin corner radius', () => {
    const panel = new Panel({ width: 40, height: 20, background: new Color(7, 8, 9, 1) });

    expect(panel.color?.r).toBe(7);
    expect(panel.cornerRadius).toBe(8);
    expect(panel.fillOverrides?.color?.r).toBe(7);
  });

  test('setBackground takes a texture with explicit slices', () => {
    const panel = new Panel({ width: 40, height: 20 });

    panel.setBackground(textureStub(), { slices: 8, border: 12 });

    const background = panel.background;

    expect(background.kind === 'nineSlice' && background.slices).toBe(8);
    expect(background.kind === 'nineSlice' && background.border).toBe(12);
  });

  test('a sprite background paints a repeating sprite sized to the widget', () => {
    const panel = new Panel({ width: 40, height: 20 });

    panel.setBackground(textureStub(), { fit: 'tile' });

    expect(panel.backgroundNode).toBeInstanceOf(RepeatingSprite);
    expect(panel.background.kind).toBe('sprite');
  });

  test('a button states all four skins in one option, mixing textures and colours', () => {
    const button = new Button({ width: 80, height: 30, skin: { normal: textureStub(), hover: new Color(3, 4, 5, 1) } });

    expect(button.backgroundIn('normal').kind).toBe('nineSlice');
    expect(button.colors.hover?.r).toBe(3);
    expect(button.backgroundNode).toBeInstanceOf(NineSliceSprite);
  });

  test('a progress bar takes a texture per surface', () => {
    const bar = new ProgressBar({ width: 200, height: 12, trackBackground: textureStub(), barBackground: textureStub() });

    expect(bar.trackBackground.kind).toBe('nineSlice');
    expect(bar.barBackground.kind).toBe('nineSlice');
  });
});

describe('ProgressBar fill modes', () => {
  test('clips a textured bar to the value instead of squashing it', () => {
    const bar = new ProgressBar({ width: 200, height: 12, value: 0.25, barBackground: textureStub() });

    expect(bar.fillMode).toBe('clip');
    expect(bar.barNode).toBeInstanceOf(NineSliceSprite);
    expect((bar.barNode as NineSliceSprite).width).toBe(200);
    expect(bar.barVisibleWidth).toBe(50);
    expect(bar.barNode?.parent?.clip).toBe(true);
  });

  test('scales a textured bar with the value when asked to', () => {
    const bar = new ProgressBar({ width: 200, height: 12, value: 0.25, barBackground: textureStub(), fillMode: 'scale' });

    expect((bar.barNode as NineSliceSprite).width).toBe(50);
    expect(bar.barVisibleWidth).toBe(50);
  });

  test('paints a fill bar at the value width in either mode, so it is never clipped', () => {
    const clipped = new ProgressBar({ width: 200, height: 12, value: 0.5 });
    const scaled = new ProgressBar({ width: 200, height: 12, value: 0.5, fillMode: 'scale' });

    expect(clipped.barNode).toBeInstanceOf(Graphics);
    expect((clipped.barNode as Graphics).getBounds().width).toBe(100);
    expect((scaled.barNode as Graphics).getBounds().width).toBe(100);
    expect(clipped.barNode?.parent?.clip).toBe(false);
  });

  test('follows a later fill-mode change', () => {
    const bar = new ProgressBar({ width: 200, height: 12, value: 0.25, barBackground: textureStub(), fillMode: 'scale' });

    bar.fillMode = 'clip';

    expect((bar.barNode as NineSliceSprite).width).toBe(200);
    expect(bar.barVisibleWidth).toBe(50);
  });
});

describe('Checkbox', () => {
  test('is interactive and focusable and starts unchecked', () => {
    const checkbox = new Checkbox();

    expect(checkbox.interactive).toBe(true);
    expect(checkbox.focusable).toBe(true);
    expect(checkbox.checked).toBe(false);
  });

  test('a tap flips it and reports the new value once', () => {
    const checkbox = new Checkbox();
    const handler = vi.fn();

    checkbox.onChange.add(handler);
    checkbox.onPointerTap.dispatch({} as never);

    expect(checkbox.checked).toBe(true);
    expect(handler).toHaveBeenCalledWith(true, checkbox);

    // Assigning the value it already has changes nothing and stays silent.
    checkbox.checked = true;
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('Enter and Space flip it, other keys do not', () => {
    const checkbox = new Checkbox();

    checkbox.onKeyDown.dispatch(new KeyEvent('keydown', Keyboard.Enter, checkbox));
    expect(checkbox.checked).toBe(true);

    checkbox.onKeyDown.dispatch(new KeyEvent('keydown', Keyboard.Space, checkbox));
    expect(checkbox.checked).toBe(false);

    checkbox.onKeyDown.dispatch(new KeyEvent('keydown', Keyboard.Escape, checkbox));
    expect(checkbox.checked).toBe(false);
  });

  test('disabled it ignores activation and paints its disabled state', () => {
    const checkbox = new Checkbox();

    checkbox.enabled = false;
    checkbox.onKeyDown.dispatch(new KeyEvent('keydown', Keyboard.Enter, checkbox));
    checkbox.onPointerTap.dispatch({} as never);

    expect(checkbox.checked).toBe(false);
    expect(checkbox.interactive).toBe(false);
    expect(checkbox.state).toBe('disabled');
  });

  test('the tick is painted only while it is checked', () => {
    const checkbox = new Checkbox({ size: 20 });

    new UIRoot().addChild(checkbox);

    expect(checkbox.boxNode).toBeInstanceOf(Graphics);
    expect(checkbox.markNode).toBeNull();

    checkbox.checked = true;

    expect(checkbox.markNode).toBeInstanceOf(Graphics);
  });

  test('it sizes itself to the box plus its label', () => {
    const bare = new Checkbox({ size: 20 });
    const labelled = new Checkbox({ size: 20, label: 'Fullscreen', labelGap: 8 });

    new UIRoot().addChild(bare).addChild(labelled);

    expect(bare.uiWidth).toBe(20);
    expect(labelled.label).toBe('Fullscreen');
    expect(labelled.uiWidth).toBeGreaterThan(28);
    expect(labelled.labelNode).not.toBeNull();
  });

  test('an explicit size wins over its measurement', () => {
    const checkbox = new Checkbox({ size: 20, label: 'On' });

    new UIRoot().addChild(checkbox);
    checkbox.setSize(200, 40);

    expect(checkbox.uiWidth).toBe(200);
    expect(checkbox.uiHeight).toBe(40);
  });

  test('focus paints the focused state', () => {
    const checkbox = new Checkbox();

    checkbox.onFocus.dispatch(checkbox);
    expect(checkbox.focused).toBe(true);
    expect(checkbox.state).toBe('focused');

    checkbox.onBlur.dispatch(checkbox);
    expect(checkbox.focused).toBe(false);
    expect(checkbox.state).toBe('normal');
  });

  test('destroy disposes onChange, detaches its nodes, and tolerates a second call', () => {
    const checkbox = new Checkbox({ size: 20 });

    new UIRoot().addChild(checkbox);
    checkbox.checked = true;

    expect(checkbox.boxNode).not.toBeNull();
    expect(checkbox.markNode).not.toBeNull();

    checkbox.destroy();

    expect(checkbox.destroyed).toBe(true);
    expect(checkbox.boxNode).toBeNull();
    expect(checkbox.markNode).toBeNull();
    expect(checkbox.onChange.count).toBe(0);

    checkbox.onChange.add(() => {});
    expect(checkbox.onChange.count).toBe(0);

    expect(() => checkbox.destroy()).not.toThrow();
  });
});

describe('Toggle', () => {
  test('the knob slides to the side the value selects', () => {
    const toggle = new Toggle({ width: 44, height: 24, knobInset: 3 });

    new UIRoot().addChild(toggle);

    const offX = toggle.knobNode?.x;

    toggle.checked = true;

    expect(offX).toBe(3);
    expect(toggle.knobNode?.x).toBeGreaterThan(3);
    expect(toggle.trackNode).toBeInstanceOf(Graphics);
  });

  test('it flips on a tap like a checkbox does', () => {
    const toggle = new Toggle();
    const handler = vi.fn();

    toggle.onChange.add(handler);
    toggle.onPointerTap.dispatch({} as never);

    expect(toggle.checked).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('destroy disposes onChange, detaches its nodes, and tolerates a second call', () => {
    const toggle = new Toggle({ width: 44, height: 24 });

    new UIRoot().addChild(toggle);

    expect(toggle.trackNode).not.toBeNull();
    expect(toggle.knobNode).not.toBeNull();

    toggle.destroy();

    expect(toggle.destroyed).toBe(true);
    expect(toggle.trackNode).toBeNull();
    expect(toggle.knobNode).toBeNull();
    expect(toggle.onChange.count).toBe(0);

    toggle.onChange.add(() => {});
    expect(toggle.onChange.count).toBe(0);

    expect(() => toggle.destroy()).not.toThrow();
  });
});

describe('Slider', () => {
  test('it clamps and quantizes the value it is given', () => {
    const slider = new Slider({ min: 0, max: 10, step: 2, value: 3 });

    expect(slider.value).toBe(4);

    slider.value = 99;
    expect(slider.value).toBe(10);

    slider.value = -5;
    expect(slider.value).toBe(0);
  });

  test('fraction reports the value as a share of the range', () => {
    const slider = new Slider({ min: 10, max: 20, value: 15 });

    expect(slider.fraction).toBeCloseTo(0.5);
  });

  test('the arrow keys step it and consume the key', () => {
    const slider = new Slider({ min: 0, max: 10, step: 1, value: 5 });
    const right = new KeyEvent('keydown', Keyboard.Right, slider);

    slider.onKeyDown.dispatch(right);
    expect(slider.value).toBe(6);
    // Without this the same press would also move focus to the next widget.
    expect(right.defaultPrevented).toBe(true);

    slider.onKeyDown.dispatch(new KeyEvent('keydown', Keyboard.Left, slider));
    expect(slider.value).toBe(5);

    slider.onKeyDown.dispatch(new KeyEvent('keydown', Keyboard.Home, slider));
    expect(slider.value).toBe(0);

    slider.onKeyDown.dispatch(new KeyEvent('keydown', Keyboard.End, slider));
    expect(slider.value).toBe(10);
  });

  test('a continuous slider steps by a twentieth of its range', () => {
    const slider = new Slider({ min: 0, max: 20, value: 10 });

    slider.onKeyDown.dispatch(new KeyEvent('keydown', Keyboard.Right, slider));

    expect(slider.value).toBeCloseTo(11);
  });

  test('an unrelated key is left to the focus controller', () => {
    const slider = new Slider({ value: 0.5, min: 0, max: 1 });
    const event = new KeyEvent('keydown', Keyboard.Tab, slider);

    slider.onKeyDown.dispatch(event);

    expect(event.defaultPrevented).toBe(false);
  });

  test('onChange fires only when the value actually moves', () => {
    const slider = new Slider({ min: 0, max: 1, step: 0.5, value: 0 });
    const handler = vi.fn();

    slider.onChange.add(handler);
    slider.onKeyDown.dispatch(new KeyEvent('keydown', Keyboard.Left, slider));
    expect(handler).not.toHaveBeenCalled();

    slider.onKeyDown.dispatch(new KeyEvent('keydown', Keyboard.Right, slider));
    expect(handler).toHaveBeenCalledWith(0.5, slider);
  });

  test('disabled it ignores the keyboard and paints its disabled state', () => {
    const slider = new Slider({ min: 0, max: 10, step: 1, value: 5 });

    slider.enabled = false;
    slider.onKeyDown.dispatch(new KeyEvent('keydown', Keyboard.Right, slider));

    expect(slider.value).toBe(5);
    expect(slider.interactive).toBe(false);
    expect(slider.state).toBe('disabled');
  });

  test('it paints track, fill and thumb', () => {
    const slider = new Slider({ width: 200, height: 20, value: 0.5, min: 0, max: 1 });

    new UIRoot().addChild(slider);

    expect(slider.trackNode).toBeInstanceOf(Graphics);
    expect(slider.fillNode).toBeInstanceOf(Graphics);
    expect(slider.thumbNode).toBeInstanceOf(Graphics);
    expect(slider.thumbNode?.x).toBeCloseTo((200 - 20) / 2);
  });

  test('destroy disposes onChange, detaches its nodes, and tolerates a second call', () => {
    const slider = new Slider({ width: 200, height: 20, value: 0.5, min: 0, max: 1 });

    new UIRoot().addChild(slider);

    expect(slider.trackNode).not.toBeNull();
    expect(slider.fillNode).not.toBeNull();
    expect(slider.thumbNode).not.toBeNull();

    slider.destroy();

    expect(slider.destroyed).toBe(true);
    expect(slider.trackNode).toBeNull();
    expect(slider.fillNode).toBeNull();
    expect(slider.thumbNode).toBeNull();
    expect(slider.onChange.count).toBe(0);

    slider.onChange.add(() => {});
    expect(slider.onChange.count).toBe(0);

    expect(() => slider.destroy()).not.toThrow();
  });
});

describe('Dropdown', () => {
  const items = [
    { label: 'Low', value: 'low' },
    { label: 'Medium', value: 'medium' },
    { label: 'High', value: 'high' },
  ];

  test('it starts closed with nothing selected', () => {
    const dropdown = new Dropdown({ items });

    expect(dropdown.isOpen).toBe(false);
    expect(dropdown.selectedIndex).toBe(-1);
    expect(dropdown.selectedValue).toBeNull();
  });

  test('a tap opens the list and highlights the selection', () => {
    const dropdown = new Dropdown({ items, selectedIndex: 1 });

    dropdown.onPointerTap.dispatch({} as never);

    expect(dropdown.isOpen).toBe(true);
    expect(dropdown.highlightedIndex).toBe(1);
    expect(dropdown.listNode.visible).toBe(true);
    expect(dropdown.state).toBe('pressed');

    dropdown.onPointerTap.dispatch({} as never);
    expect(dropdown.isOpen).toBe(false);
  });

  test('while open, the arrows move the highlight and Enter picks it', () => {
    const dropdown = new Dropdown({ items, selectedIndex: 0 });
    const handler = vi.fn();

    dropdown.onChange.add(handler);
    dropdown.open();

    dropdown.onKeyDown.dispatch(new KeyEvent('keydown', Keyboard.Down, dropdown));
    expect(dropdown.highlightedIndex).toBe(1);
    expect(dropdown.selectedIndex).toBe(0);

    dropdown.onKeyDown.dispatch(new KeyEvent('keydown', Keyboard.Enter, dropdown));
    expect(dropdown.selectedIndex).toBe(1);
    expect(dropdown.selectedValue).toBe('medium');
    expect(dropdown.isOpen).toBe(false);
    expect(handler).toHaveBeenCalledWith('medium', 1, dropdown);
  });

  test('while closed, the arrows change the selection directly', () => {
    const dropdown = new Dropdown({ items, selectedIndex: 0 });

    dropdown.onKeyDown.dispatch(new KeyEvent('keydown', Keyboard.Down, dropdown));

    expect(dropdown.isOpen).toBe(false);
    expect(dropdown.selectedIndex).toBe(1);
  });

  test('stepping stops at either end rather than wrapping', () => {
    const dropdown = new Dropdown({ items, selectedIndex: 0 });

    dropdown.onKeyDown.dispatch(new KeyEvent('keydown', Keyboard.Up, dropdown));
    expect(dropdown.selectedIndex).toBe(0);

    dropdown.selectedIndex = 2;
    dropdown.onKeyDown.dispatch(new KeyEvent('keydown', Keyboard.Down, dropdown));
    expect(dropdown.selectedIndex).toBe(2);
  });

  test('Escape closes without changing the selection', () => {
    const dropdown = new Dropdown({ items, selectedIndex: 0 });

    dropdown.open();
    dropdown.onKeyDown.dispatch(new KeyEvent('keydown', Keyboard.Down, dropdown));
    dropdown.onKeyDown.dispatch(new KeyEvent('keydown', Keyboard.Escape, dropdown));

    expect(dropdown.isOpen).toBe(false);
    expect(dropdown.selectedIndex).toBe(0);
  });

  test('Escape with the list closed is left to the focus controller', () => {
    const dropdown = new Dropdown({ items });
    const event = new KeyEvent('keydown', Keyboard.Escape, dropdown);

    dropdown.onKeyDown.dispatch(event);

    expect(event.defaultPrevented).toBe(false);
  });

  test('losing focus closes the list', () => {
    const dropdown = new Dropdown({ items });

    dropdown.onFocus.dispatch(dropdown);
    dropdown.open();
    expect(dropdown.isOpen).toBe(true);

    dropdown.onBlur.dispatch(dropdown);
    expect(dropdown.isOpen).toBe(false);
  });

  test('a press on empty canvas blurs a focused, open dropdown and closes its list', () => {
    const harness = createUIApp();
    const dropdown = new Dropdown({ items });

    harness.scene.ui.addChild(dropdown);
    harness.im.focus(dropdown);
    dropdown.open();

    expect(harness.im.focused).toBe(dropdown);
    expect(dropdown.isOpen).toBe(true);

    // Outside the dropdown's default 180x36 bounds.
    press(harness, 500, 500);

    expect(harness.im.focused).toBeNull();
    expect(dropdown.isOpen).toBe(false);
  });

  test('disabling it closes the list and refuses to open', () => {
    const dropdown = new Dropdown({ items });

    dropdown.open();
    dropdown.enabled = false;

    expect(dropdown.isOpen).toBe(false);

    dropdown.open();
    expect(dropdown.isOpen).toBe(false);
    expect(dropdown.state).toBe('disabled');
  });

  test('an empty list has nothing to open', () => {
    const dropdown = new Dropdown<string>();

    dropdown.open();

    expect(dropdown.isOpen).toBe(false);
  });

  test('replacing the items keeps the selected index only while it still exists', () => {
    const dropdown = new Dropdown({ items, selectedIndex: 2 });

    dropdown.setItems(items.slice(0, 2));
    expect(dropdown.selectedIndex).toBe(1);

    dropdown.setItems([]);
    expect(dropdown.selectedIndex).toBe(-1);
    expect(dropdown.selectedValue).toBeNull();
  });

  test('one row per item paints the list surface', () => {
    const dropdown = new Dropdown({ items, width: 180, height: 36 });

    new UIRoot().addChild(dropdown);
    dropdown.open();

    expect(dropdown.listNode.children.length).toBeGreaterThanOrEqual(items.length);
    expect(dropdown.backgroundNode).toBeInstanceOf(Graphics);
  });

  test('destroy disposes onChange, detaches its background node, and tolerates a second call', () => {
    const dropdown = new Dropdown({ items, width: 180, height: 36 });

    new UIRoot().addChild(dropdown);

    expect(dropdown.backgroundNode).not.toBeNull();

    dropdown.destroy();

    expect(dropdown.destroyed).toBe(true);
    expect(dropdown.backgroundNode).toBeNull();
    expect(dropdown.onChange.count).toBe(0);

    dropdown.onChange.add(() => {});
    expect(dropdown.onChange.count).toBe(0);

    expect(() => dropdown.destroy()).not.toThrow();
  });
});
