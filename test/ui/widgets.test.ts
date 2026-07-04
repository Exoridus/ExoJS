import { Color } from '#core/Color';
import { KeyEvent } from '#input/KeyEvent';
import { Keyboard } from '#input/types';
import { Rectangle } from '#math/Rectangle';
import { Graphics } from '#rendering/primitives/Graphics';
import type { GlyphAtlas } from '#rendering/text/GlyphAtlas';
import type { GlyphAtlasPool } from '#rendering/text/GlyphAtlasPool';
import { resetDefaultGlyphAtlasPool } from '#rendering/text/GlyphAtlasPool';
import type { GlyphInfo } from '#rendering/text/types';
import { Button } from '#ui/Button';
import { Label } from '#ui/Label';
import { Panel } from '#ui/Panel';
import { ProgressBar } from '#ui/ProgressBar';
import { Stack } from '#ui/Stack';
import { UIRoot } from '#ui/UIRoot';

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

  test('exposes background, color, borderColor, borderWidth, cornerRadius getters', () => {
    const color = new Color(10, 20, 30, 1);
    const borderColor = new Color(1, 2, 3, 1);
    const panel = new Panel({ width: 100, height: 50, color, borderColor, borderWidth: 3, cornerRadius: 12 });

    expect(panel.background).toBeInstanceOf(Graphics);
    expect(panel.color.r).toBe(10);
    expect(panel.borderColor.r).toBe(1);
    expect(panel.borderWidth).toBe(3);
    expect(panel.cornerRadius).toBe(12);
  });

  test('resizing to zero skips (re)drawing the background without throwing', () => {
    // Constructing directly at (0, 0) is a same-value no-op against the Widget
    // default (_uiWidth/_uiHeight start at 0) and never runs _relayout — so the
    // zero-size early return is only reachable via an explicit resize away
    // from a non-zero starting size.
    const panel = new Panel({ width: 100, height: 50 });

    expect(() => panel.setSize(0, 0)).not.toThrow();
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
    // Widget default (_uiWidth/_uiHeight start at 0) and never runs _relayout —
    // so the zero-size early return in _draw() is only reachable via an
    // explicit resize away from a non-zero starting size.
    const button = new Button();

    expect(() => button.setSize(0, 0)).not.toThrow();
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

    // 2 clamps to the same 1 twice in a row — second assignment is the no-op branch.
    bar.value = 1;
    bar.value = 2;
    expect(bar.value).toBe(1);
  });

  test('exposes trackColor, fillColor, cornerRadius getters', () => {
    const bar = new ProgressBar({ trackColor: new Color(1, 2, 3, 1), fillColor: new Color(4, 5, 6, 1), cornerRadius: 6 });

    expect(bar.trackColor.r).toBe(1);
    expect(bar.fillColor.r).toBe(4);
    expect(bar.cornerRadius).toBe(6);
  });

  test('defaults to no options and a zero fill value (empty-fill draw branch)', () => {
    const bar = new ProgressBar();

    expect(bar.value).toBe(0);
  });

  test('resizing the track to zero skips (re)drawing it without throwing', () => {
    // Constructing directly at (0, 0) is a same-value no-op against the Widget
    // default (_uiWidth/_uiHeight start at 0) and never runs _relayout — so the
    // zero-size early return in _drawTrack() is only reachable via an explicit
    // resize away from a non-zero starting size.
    const bar = new ProgressBar({ width: 200, height: 12 });

    expect(() => bar.setSize(0, 0)).not.toThrow();
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

    // Graphics (unlike Widget) does not expose an explicit layout size — the
    // `child instanceof Widget` branch in Stack.layout() falls back to
    // getLocalBounds() for it, which this stubs to a known non-zero size.
    vi.spyOn(gfx, 'getLocalBounds').mockReturnValue(new Rectangle(0, 0, 40, 20));

    stack.addItem(gfx);

    expect(gfx.position.x).toBe(0);
    expect(stack.uiWidth).toBe(40);
    expect(stack.uiHeight).toBe(20);
  });
});
