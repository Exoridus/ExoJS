/**
 * Tooltip tests — delayed show/hide scheduling, UIRoot-ancestor lookup,
 * default vs. custom option decoding, and destroy() cleanup.
 */

import { InteractionEvent } from '#input/InteractionEvent';
import type { Pointer } from '#input/Pointer';
import { Container } from '#rendering/Container';
import { type Graphics } from '#rendering/primitives/Graphics';
import type { GlyphAtlasPool } from '#rendering/text/GlyphAtlasPool';
import { resetDefaultGlyphAtlasPool } from '#rendering/text/GlyphAtlasPool';
import { type Text } from '#rendering/text/Text';
import { Tooltip } from '#ui/Tooltip';
import { UIRoot } from '#ui/UIRoot';

// Stub the glyph atlas pool so Text construction never touches a real 2D canvas context.
const fakeGlyph = {
  x: 0,
  y: 0,
  width: 6,
  height: 10,
  advance: 6,
  ascent: 8,
  page: 0,
  uvLeft: 0,
  uvRight: 0.01,
  uvTop: 0,
  uvBottom: 0.02,
};
const fakePage = { texture: { updateSource: vi.fn() }, index: 0 };
const fakeAtlas = {
  getGlyph: vi.fn(() => fakeGlyph),
  pages: [fakePage],
  clear: vi.fn(),
};
const fakePool = { getAtlas: vi.fn(() => fakeAtlas) };

beforeEach(() => {
  resetDefaultGlyphAtlasPool(fakePool as unknown as GlyphAtlasPool);
  vi.useFakeTimers();
});
afterEach(() => {
  resetDefaultGlyphAtlasPool();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const dispatchOver = (target: Container, x = 0, y = 0): void => {
  target.onPointerOver.dispatch(new InteractionEvent('pointerover', target, {} as unknown as Pointer, x, y));
};

const dispatchOut = (target: Container): void => {
  target.onPointerOut.dispatch(new InteractionEvent('pointerout', target, {} as unknown as Pointer, 0, 0));
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Tooltip construction', () => {
  test('subscribes to the target onPointerOver/onPointerOut signals', () => {
    const target = new Container();

    expect(target.onPointerOver.count).toBe(0);
    expect(target.onPointerOut.count).toBe(0);

    const tip = new Tooltip(target, { text: 'Hi' });

    expect(target.onPointerOver.count).toBe(1);
    expect(target.onPointerOut.count).toBe(1);

    tip.destroy();
  });
});

describe('Tooltip._findUIRoot', () => {
  test('shows nothing when the target has no UIRoot ancestor', () => {
    const target = new Container();
    const tip = new Tooltip(target, { text: 'Hi', delay: 0.1 });

    dispatchOver(target, 10, 20);
    vi.advanceTimersByTime(200);

    expect(target.parent).toBeNull();

    tip.destroy();
  });

  test('finds a UIRoot ancestor through multiple levels of nesting', () => {
    const root = new UIRoot();
    const wrapper = new Container();
    const target = new Container();

    root.addChild(wrapper);
    wrapper.addChild(target);

    const tip = new Tooltip(target, { text: 'Hello', delay: 0.2, offsetX: 5, offsetY: -10 });

    expect(root.children.length).toBe(1); // only wrapper so far

    dispatchOver(target, 100, 200);
    vi.advanceTimersByTime(199);
    expect(root.children.length).toBe(1); // not yet shown

    vi.advanceTimersByTime(1);
    expect(root.children.length).toBe(2); // tooltip node appended

    const node = root.children[1] as Container;

    expect(node.position.x).toBe(105);
    expect(node.position.y).toBe(190);

    tip.destroy();
  });
});

describe('Tooltip show/hide scheduling', () => {
  test('pointer-out before the delay elapses cancels the scheduled show', () => {
    const root = new UIRoot();
    const target = new Container();

    root.addChild(target);

    const tip = new Tooltip(target, { text: 'Hello', delay: 0.3 });

    dispatchOver(target);
    vi.advanceTimersByTime(100);
    dispatchOut(target);
    vi.advanceTimersByTime(1000);

    expect(root.children.length).toBe(1); // only target — tooltip node never appeared

    tip.destroy();
  });

  test('pointer-out after the tooltip is shown removes the node', () => {
    const root = new UIRoot();
    const target = new Container();

    root.addChild(target);

    const tip = new Tooltip(target, { text: 'Hello', delay: 0.1 });

    dispatchOver(target);
    vi.advanceTimersByTime(100);
    expect(root.children.length).toBe(2);

    dispatchOut(target);
    expect(root.children.length).toBe(1);

    tip.destroy();
  });

  test('a second pointer-over before the delay elapses cancels the first scheduled timer', () => {
    const root = new UIRoot();
    const target = new Container();

    root.addChild(target);

    const tip = new Tooltip(target, { text: 'Hello', delay: 0.2 });

    dispatchOver(target);
    dispatchOver(target);

    expect(vi.getTimerCount()).toBe(1);

    tip.destroy();
  });

  test('showing the tooltip again after hiding does not leave stale nodes', () => {
    const root = new UIRoot();
    const target = new Container();

    root.addChild(target);

    const tip = new Tooltip(target, { text: 'Hello', delay: 0.05 });

    dispatchOver(target);
    vi.advanceTimersByTime(50);
    expect(root.children.length).toBe(2);

    dispatchOut(target);
    expect(root.children.length).toBe(1);

    dispatchOver(target);
    vi.advanceTimersByTime(50);
    expect(root.children.length).toBe(2);

    tip.destroy();
  });
});

describe('Tooltip._removeNode defensive guard', () => {
  test('hides safely when the tooltip node was already detached externally', () => {
    const root = new UIRoot();
    const target = new Container();

    root.addChild(target);

    const tip = new Tooltip(target, { text: 'Hello', delay: 0.05 });

    dispatchOver(target);
    vi.advanceTimersByTime(50);

    const node = root.children[1] as Container;

    // Simulate something else (e.g. the root being torn down) detaching the
    // node out from under the Tooltip before it gets a chance to hide it.
    root.removeChild(node);

    expect(() => dispatchOut(target)).not.toThrow();

    tip.destroy();
  });
});

describe('Tooltip.destroy()', () => {
  test('hides any visible tooltip and unsubscribes the listeners', () => {
    const root = new UIRoot();
    const target = new Container();

    root.addChild(target);

    const tip = new Tooltip(target, { text: 'Hello', delay: 0.05 });

    dispatchOver(target);
    vi.advanceTimersByTime(50);
    expect(root.children.length).toBe(2);

    tip.destroy();
    expect(root.children.length).toBe(1);
    expect(target.onPointerOver.count).toBe(0);
    expect(target.onPointerOut.count).toBe(0);

    // Further hover after destroy is inert — the listener was removed.
    dispatchOver(target);
    vi.advanceTimersByTime(1000);
    expect(root.children.length).toBe(1);
  });

  test('is safe to call twice', () => {
    const target = new Container();
    const tip = new Tooltip(target, { text: 'Hello' });

    expect(() => tip.destroy()).not.toThrow();
    expect(() => tip.destroy()).not.toThrow();
  });
});

describe('Tooltip option decoding', () => {
  test('applies default offset/delay/colors when options are omitted', () => {
    const root = new UIRoot();
    const target = new Container();

    root.addChild(target);

    const tip = new Tooltip(target, { text: 'Hello' });

    dispatchOver(target, 100, 100);
    vi.advanceTimersByTime(300); // default delay is 300ms

    const node = root.children[1] as Container;

    expect(node.position.x).toBe(100 + 12); // default offsetX
    expect(node.position.y).toBe(100 - 28); // default offsetY

    const bg = node.children[0] as Graphics;

    expect(bg.fillColor.r).toBe(0x22);
    expect(bg.fillColor.g).toBe(0x22);
    expect(bg.fillColor.b).toBe(0x22);

    const label = node.children[1] as Text;

    expect(label.style.fillColor.r).toBe(0xff);
    expect(label.style.fillColor.g).toBe(0xff);
    expect(label.style.fillColor.b).toBe(0xff);

    tip.destroy();
  });

  test('decodes custom background/textColor/padding/fontSize options', () => {
    const root = new UIRoot();
    const target = new Container();

    root.addChild(target);

    const tip = new Tooltip(target, {
      text: 'Hello',
      delay: 0.1,
      background: 0x112233,
      textColor: 0x445566,
      padding: 10,
      fontSize: 20,
    });

    dispatchOver(target);
    vi.advanceTimersByTime(100);

    const node = root.children[1] as Container;
    const bg = node.children[0] as Graphics;
    const label = node.children[1] as Text;

    expect(bg.fillColor.r).toBe(0x11);
    expect(bg.fillColor.g).toBe(0x22);
    expect(bg.fillColor.b).toBe(0x33);
    expect(label.style.fillColor.r).toBe(0x44);
    expect(label.style.fillColor.g).toBe(0x55);
    expect(label.style.fillColor.b).toBe(0x66);

    tip.destroy();
  });
});
