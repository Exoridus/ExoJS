import { KeyEvent } from '#input/KeyEvent';
import { Keyboard } from '#input/types';
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
});

describe('Label', () => {
  test('exposes and updates its text', () => {
    const label = new Label('Hello');

    expect(label.text).toBe('Hello');

    label.text = 'World';
    expect(label.text).toBe('World');
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
});
