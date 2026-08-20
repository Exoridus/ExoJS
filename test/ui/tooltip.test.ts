/**
 * Tooltip tests - delayed show/hide scheduling (driven by Application.onFrame,
 * frozen while the scene is paused), UIRoot-ancestor lookup, screen-space
 * pointer coordinates, node teardown on hide, default vs. custom option
 * decoding, and destroy() cleanup.
 */

import type { Application } from '#core/Application';
import { Signal } from '#core/Signal';
import type { Stage } from '#core/Stage';
import { Time } from '#core/Time';
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
});
afterEach(() => {
  resetDefaultGlyphAtlasPool();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A minimal fake app carrying a real onFrame Signal and a mutable scene.paused flag. */
interface FakeApp {
  app: Application;
  onFrame: Signal<[Time]>;
  scene: { paused: boolean };
}

const makeApp = (): FakeApp => {
  const onFrame = new Signal<[Time]>();
  const scene = { paused: false };
  const app = {
    onFrame,
    scenes: { currentScene: scene },
  } as unknown as Application;

  return { app, onFrame, scene };
};

/** Attach `app` to `root` via a minimal Stage - cascades to every current and future descendant. */
const attachStage = (root: UIRoot, app: Application): void => {
  const interaction: Stage['interaction'] = {
    _notifyNodeAdded: vi.fn(),
    _notifyNodeRemoved: vi.fn(),
    _notifyInteractiveChanged: vi.fn(),
    _notifyBoundsInvalidated: vi.fn(),
    _notifyTransformGroupMoved: vi.fn(),
  };
  const focus: Stage['focus'] = {
    focused: null,
    focus: vi.fn(),
    blur: vi.fn(),
    _notifyNodeRemoved: vi.fn(),
  };

  root._setStage({ interaction, focus, app });
};

/** Advance the fake app's frame clock by `seconds`. */
const tick = (onFrame: Signal<[Time]>, seconds: number): void => {
  onFrame.dispatch(new Time(seconds, Time.seconds));
};

/**
 * Dispatch a pointerover. `(x, y)` is the InteractionEvent's own layer-space
 * position; `(pointerX, pointerY)` - defaulting to the same values - is the
 * separate screen-space `Pointer` position Tooltip now actually positions
 * from. Pass them apart to simulate a world-tree target under a moved camera.
 */
const dispatchOver = (target: Container, x = 0, y = 0, pointerX = x, pointerY = y): void => {
  const pointer = { x: pointerX, y: pointerY } as unknown as Pointer;

  target.onPointerOver.dispatch(new InteractionEvent('pointerover', target, pointer, x, y));
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

    expect(target.parent).toBeNull();

    tip.destroy();
  });

  test('finds a UIRoot ancestor through multiple levels of nesting', () => {
    const root = new UIRoot();
    const wrapper = new Container();
    const target = new Container();

    root.addChild(wrapper);
    wrapper.addChild(target);

    const { app, onFrame } = makeApp();

    attachStage(root, app);

    const tip = new Tooltip(target, { text: 'Hello', delay: 0.2, offsetX: 5, offsetY: -10 });

    expect(root.children.length).toBe(1); // only wrapper so far

    dispatchOver(target, 100, 200);
    tick(onFrame, 0.199);
    expect(root.children.length).toBe(1); // not yet shown

    tick(onFrame, 0.001);
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

    const { app, onFrame } = makeApp();

    attachStage(root, app);

    const tip = new Tooltip(target, { text: 'Hello', delay: 0.3 });

    dispatchOver(target);
    tick(onFrame, 0.1);
    dispatchOut(target);
    tick(onFrame, 1.0);

    expect(root.children.length).toBe(1); // only target — tooltip node never appeared

    tip.destroy();
  });

  test('pointer-out after the tooltip is shown removes the node', () => {
    const root = new UIRoot();
    const target = new Container();

    root.addChild(target);

    const { app, onFrame } = makeApp();

    attachStage(root, app);

    const tip = new Tooltip(target, { text: 'Hello', delay: 0.1 });

    dispatchOver(target);
    tick(onFrame, 0.1);
    expect(root.children.length).toBe(2);

    dispatchOut(target);
    expect(root.children.length).toBe(1);

    tip.destroy();
  });

  test('a second pointer-over before the delay elapses cancels the first scheduled subscription', () => {
    const root = new UIRoot();
    const target = new Container();

    root.addChild(target);

    const { app, onFrame } = makeApp();

    attachStage(root, app);

    const tip = new Tooltip(target, { text: 'Hello', delay: 0.2 });

    dispatchOver(target);
    dispatchOver(target);

    // _scheduleShow() cancels its own prior subscription before re-adding -
    // two overs in a row must still leave exactly one onFrame listener, not two.
    expect(onFrame.count).toBe(1);

    tip.destroy();
  });

  test('showing the tooltip again after hiding does not leave stale nodes', () => {
    const root = new UIRoot();
    const target = new Container();

    root.addChild(target);

    const { app, onFrame } = makeApp();

    attachStage(root, app);

    const tip = new Tooltip(target, { text: 'Hello', delay: 0.05 });

    dispatchOver(target);
    tick(onFrame, 0.05);
    expect(root.children.length).toBe(2);

    dispatchOut(target);
    expect(root.children.length).toBe(1);

    dispatchOver(target);
    tick(onFrame, 0.05);
    expect(root.children.length).toBe(2);

    tip.destroy();
  });
});

describe('Tooltip pause-aware scheduling (ME-59: time base)', () => {
  test('the show delay does not advance while the scene is paused', () => {
    const root = new UIRoot();
    const target = new Container();

    root.addChild(target);

    const { app, onFrame, scene } = makeApp();

    attachStage(root, app);

    const tip = new Tooltip(target, { text: 'Hello', delay: 0.2 });

    dispatchOver(target);
    tick(onFrame, 0.1); // half the delay elapsed

    scene.paused = true;
    tick(onFrame, 5.0); // would easily clear the delay if it were still counting

    expect(root.children.length).toBe(1); // still not shown — frozen while paused

    scene.paused = false;
    tick(onFrame, 0.1); // the remaining half

    expect(root.children.length).toBe(2); // resumes from where it left off

    tip.destroy();
  });

  test('a delay that would elapse mid-pause instead fires right after resume, not during it', () => {
    const root = new UIRoot();
    const target = new Container();

    root.addChild(target);

    const { app, onFrame, scene } = makeApp();

    attachStage(root, app);

    const tip = new Tooltip(target, { text: 'Hello', delay: 0.1 });

    dispatchOver(target);
    scene.paused = true;
    tick(onFrame, 1.0); // far past the delay, but paused throughout

    expect(root.children.length).toBe(1);

    scene.paused = false;
    tick(onFrame, 0.1);

    expect(root.children.length).toBe(2);

    tip.destroy();
  });
});

describe('Tooltip pointer coordinate basis (ME-59: coordinate base)', () => {
  test('positions from the screen-space Pointer, not the target-layer-space InteractionEvent x/y', () => {
    const root = new UIRoot();
    const target = new Container();

    root.addChild(target);

    const { app, onFrame } = makeApp();

    attachStage(root, app);

    const tip = new Tooltip(target, { text: 'Hello', delay: 0.1, offsetX: 0, offsetY: 0 });

    // Simulate a world-tree target under a panned camera: InteractionEvent's
    // own x/y (target-layer space) reads far from the pointer's actual
    // screen-space position.
    dispatchOver(target, /* event x/y */ 900, 900, /* pointer x/y */ 40, 60);
    tick(onFrame, 0.1);

    const node = root.children[1] as Container;

    expect(node.position.x).toBe(40);
    expect(node.position.y).toBe(60);

    tip.destroy();
  });
});

describe('Tooltip._removeNode defensive guard', () => {
  test('hides safely when the tooltip node was already detached externally', () => {
    const root = new UIRoot();
    const target = new Container();

    root.addChild(target);

    const { app, onFrame } = makeApp();

    attachStage(root, app);

    const tip = new Tooltip(target, { text: 'Hello', delay: 0.05 });

    dispatchOver(target);
    tick(onFrame, 0.05);

    const node = root.children[1] as Container;

    // Simulate something else (e.g. the root being torn down) detaching the
    // node out from under the Tooltip before it gets a chance to hide it.
    root.removeChild(node);

    expect(() => dispatchOut(target)).not.toThrow();

    tip.destroy();
  });
});

describe('Tooltip node teardown (ME-59: leak)', () => {
  test('hiding a shown tooltip destroys its node instead of merely detaching it', () => {
    const root = new UIRoot();
    const target = new Container();

    root.addChild(target);

    const { app, onFrame } = makeApp();

    attachStage(root, app);

    const tip = new Tooltip(target, { text: 'Hello', delay: 0.05 });

    dispatchOver(target);
    tick(onFrame, 0.05);

    const node = root.children[1] as Container;
    const bg = node.children[0] as Graphics;
    const label = node.children[1] as Text;

    dispatchOut(target);

    expect(node.destroyed).toBe(true);
    expect(bg.destroyed).toBe(true);
    expect(label.destroyed).toBe(true);

    tip.destroy();
  });

  test('replacing a shown tooltip (re-hover without an intervening hide) destroys the previous node', () => {
    const root = new UIRoot();
    const target = new Container();

    root.addChild(target);

    const { app, onFrame } = makeApp();

    attachStage(root, app);

    const tip = new Tooltip(target, { text: 'Hello', delay: 0.05 });

    dispatchOver(target);
    tick(onFrame, 0.05);
    const firstNode = root.children[1] as Container;

    // _show() is re-entered (e.g. a second show while already visible) via a
    // fresh over/delay cycle - the first node must not survive as a leak.
    dispatchOut(target);
    dispatchOver(target);
    tick(onFrame, 0.05);

    expect(firstNode.destroyed).toBe(true);

    tip.destroy();
  });

  test('destroy() while a tooltip is visible destroys its node', () => {
    const root = new UIRoot();
    const target = new Container();

    root.addChild(target);

    const { app, onFrame } = makeApp();

    attachStage(root, app);

    const tip = new Tooltip(target, { text: 'Hello', delay: 0.05 });

    dispatchOver(target);
    tick(onFrame, 0.05);
    const node = root.children[1] as Container;

    tip.destroy();

    expect(node.destroyed).toBe(true);
  });
});

describe('Tooltip.destroy()', () => {
  test('hides any visible tooltip and unsubscribes the listeners', () => {
    const root = new UIRoot();
    const target = new Container();

    root.addChild(target);

    const { app, onFrame } = makeApp();

    attachStage(root, app);

    const tip = new Tooltip(target, { text: 'Hello', delay: 0.05 });

    dispatchOver(target);
    tick(onFrame, 0.05);
    expect(root.children.length).toBe(2);

    tip.destroy();
    expect(root.children.length).toBe(1);
    expect(target.onPointerOver.count).toBe(0);
    expect(target.onPointerOut.count).toBe(0);

    // Further hover after destroy is inert - the listener was removed.
    dispatchOver(target);
    tick(onFrame, 1.0);
    expect(root.children.length).toBe(1);
  });

  test('is safe to call twice', () => {
    const target = new Container();
    const tip = new Tooltip(target, { text: 'Hello' });

    expect(() => tip.destroy()).not.toThrow();
    expect(() => tip.destroy()).not.toThrow();
  });

  test('unsubscribes from onFrame — destroy() while a delay is pending leaves no listener behind', () => {
    const root = new UIRoot();
    const target = new Container();

    root.addChild(target);

    const { app, onFrame } = makeApp();

    attachStage(root, app);

    const tip = new Tooltip(target, { text: 'Hello', delay: 0.2 });

    dispatchOver(target);
    expect(onFrame.count).toBe(1);

    tip.destroy();
    expect(onFrame.count).toBe(0);
  });
});

describe('Tooltip option decoding', () => {
  test('applies default offset/delay/colors when options are omitted', () => {
    const root = new UIRoot();
    const target = new Container();

    root.addChild(target);

    const { app, onFrame } = makeApp();

    attachStage(root, app);

    const tip = new Tooltip(target, { text: 'Hello' });

    dispatchOver(target, 100, 100);
    tick(onFrame, 0.3); // default delay is 0.3s

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

    const { app, onFrame } = makeApp();

    attachStage(root, app);

    const tip = new Tooltip(target, {
      text: 'Hello',
      delay: 0.1,
      background: 0x112233,
      textColor: 0x445566,
      padding: 10,
      fontSize: 20,
    });

    dispatchOver(target);
    tick(onFrame, 0.1);

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
