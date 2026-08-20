/**
 * Real InputManager + InteractionManager integration tests for the focus and
 * scope-ownership guarantees: active scopes as real focus traps (blocking
 * both Tab traversal and programmatic focus()), focus handling on scope
 * push/pop, app-level and scene-level scopes nesting without clobbering each
 * other, detachRoot() only ever touching what it owns, and KeyEvent bubbling
 * with currentTarget/stopPropagation.
 */

import type { Application } from '#core/Application';
import { Scene } from '#core/Scene';
import { SceneState } from '#core/SceneState';
import { InputManager } from '#input/InputManager';
import { InteractionManager } from '#input/InteractionManager';
import type { KeyEvent } from '#input/KeyEvent';
import { BrowserPlatform } from '#platform/BrowserPlatform';
import { Container } from '#rendering/Container';

interface Harness {
  scene: Scene;
  canvas: HTMLCanvasElement;
  input: InputManager;
  im: InteractionManager;
}

const createHarness = (): Harness => {
  const canvas = document.createElement('canvas');

  canvas.width = 800;
  canvas.height = 600;

  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    right: 800,
    bottom: 600,
    width: 800,
    height: 600,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);

  const scene = new Scene();
  const identity = { screenToWorld: (x: number, y: number): { x: number; y: number } => ({ x, y }) };
  const platform = new BrowserPlatform(canvas);

  const app = {
    canvas,
    platform,
    width: 800,
    height: 600,
    pixelRatio: 1,
    options: { input: {} },
    rendering: { view: identity, screenView: identity },
    scenes: {
      get currentScene(): Scene | null {
        return scene;
      },
      state: SceneState.Active as SceneState | null,
      _transitionGateOpen: false,
    },
    _backingStoreToDesign: (x: number, y: number): { x: number; y: number } => ({ x, y }),
  } as unknown as Application;

  const input = new InputManager(app);

  (app as unknown as { input: InputManager }).input = input;

  const im = new InteractionManager(app);

  im.attachRoot(scene.root);
  canvas.dispatchEvent(new FocusEvent('focus'));

  return { scene, canvas, input, im };
};

/** Dispatch a real keydown, then flush it through InputManager into FocusController. */
const pressKey = (h: Harness, code: string): void => {
  window.dispatchEvent(new KeyboardEvent('keydown', { code }));
  h.input.preUpdate(0 as never);
};

const focusableNode = (): Container => {
  const node = new Container();

  node.focusable = true;

  return node;
};

beforeAll(() => {
  Object.defineProperty(window.navigator, 'getGamepads', {
    configurable: true,
    value: (): ReturnType<Navigator['getGamepads']> => [] as unknown as ReturnType<Navigator['getGamepads']>,
  });
});

describe('active scopes as real focus traps', () => {
  it('rejects a programmatic focus() call targeting a node outside the active scope', () => {
    const h = createHarness();
    const outside = focusableNode();
    const modal = new Container();
    const inside = focusableNode();

    modal.addChild(inside);
    h.scene.root.addChild(outside);
    h.scene.root.addChild(modal);

    h.im.pushScope(modal);
    h.im.focus(outside);

    expect(h.im.focused).toBeNull();

    h.im.destroy();
  });

  it('allows a programmatic focus() call targeting a node inside the active scope', () => {
    const h = createHarness();
    const modal = new Container();
    const inside = focusableNode();

    modal.addChild(inside);
    h.scene.root.addChild(modal);

    h.im.pushScope(modal);
    h.im.focus(inside);

    expect(h.im.focused).toBe(inside);

    h.im.destroy();
  });

  it('Tab traversal cannot escape the active scope either', () => {
    const h = createHarness();
    const outside = focusableNode();
    const modal = new Container();
    const inA = focusableNode();

    modal.addChild(inA);
    h.scene.root.addChild(outside);
    h.scene.root.addChild(modal);

    h.im.pushScope(modal);
    pressKey(h, 'Tab');
    pressKey(h, 'Tab');
    pressKey(h, 'Tab');

    expect(h.im.focused).not.toBe(outside);

    h.im.destroy();
  });
});

describe('focus handling across push/pop', () => {
  it('blurs an out-of-scope focus the instant a scope is pushed', () => {
    const h = createHarness();
    const outside = focusableNode();

    h.scene.root.addChild(outside);
    h.im.focus(outside);
    expect(h.im.focused).toBe(outside);

    const modal = new Container();

    h.scene.root.addChild(modal);
    h.im.pushScope(modal);

    expect(h.im.focused).toBeNull();

    h.im.destroy();
  });

  it('leaves an already-inside focus alone when the scope activates', () => {
    const h = createHarness();
    const modal = new Container();
    const inside = focusableNode();

    modal.addChild(inside);
    h.scene.root.addChild(modal);
    h.im.focus(inside);

    h.im.pushScope(modal);

    expect(h.im.focused).toBe(inside);

    h.im.destroy();
  });

  it('restores the focus that was active before the scope opened, once it pops', () => {
    const h = createHarness();
    const trigger = focusableNode();
    const modal = new Container();
    const inside = focusableNode();

    modal.addChild(inside);
    h.scene.root.addChild(trigger);
    h.scene.root.addChild(modal);

    h.im.focus(trigger);

    const token = h.im.pushScope(modal);

    h.im.focus(inside);
    expect(h.im.focused).toBe(inside);

    h.im.popScope(token);

    expect(h.im.focused).toBe(trigger);

    h.im.destroy();
  });

  it('blurs instead of restoring when the remembered focus no longer exists', () => {
    const h = createHarness();
    const trigger = focusableNode();
    const modal = new Container();

    h.scene.root.addChild(trigger);
    h.scene.root.addChild(modal);
    h.im.focus(trigger);

    const token = h.im.pushScope(modal);

    trigger.destroy(); // the remembered node is gone by the time the scope pops

    h.im.popScope(token);

    expect(h.im.focused).toBeNull();

    h.im.destroy();
  });

  it('releasing a non-topmost scope does not disturb the currently active scope focus', () => {
    const h = createHarness();
    const outer = new Container();
    const outerInside = focusableNode();
    const inner = new Container();
    const innerInside = focusableNode();

    outer.addChild(outerInside);
    inner.addChild(innerInside);
    h.scene.root.addChild(outer);
    h.scene.root.addChild(inner);

    const outerToken = h.im.pushScope(outer);

    h.im.focus(outerInside);

    const innerToken = h.im.pushScope(inner);

    h.im.focus(innerInside);

    // Releasing the BURIED outer scope while inner is active must not touch
    // current focus at all - only popping the ACTIVE (topmost) scope does.
    h.im.popScope(outerToken);

    expect(h.im.focused).toBe(innerInside);

    h.im.popScope(innerToken);
    h.im.destroy();
  });
});

describe('pushScope on a not-yet-live root', () => {
  it('does not blur current focus until the pushed root actually attaches', () => {
    const h = createHarness();
    const trigger = focusableNode();
    const modal = new Container(); // deliberately not attached to the scene yet
    const insideModal = focusableNode();

    modal.addChild(insideModal);
    h.scene.root.addChild(trigger);
    h.im.focus(trigger);

    const token = h.im.pushScope(modal);

    // `modal` is not live yet, so nothing is trapped by it - the blur check
    // must not run just because a scope entry now exists.
    expect(h.im.focused).toBe(trigger);

    // Attaching `modal` makes it live, and re-enforces the trap immediately.
    h.scene.root.addChild(modal);

    expect(h.im.focused).toBeNull();

    h.im.popScope(token);
    h.im.destroy();
  });
});

describe('nested app-level and scene-level scopes', () => {
  it('a scene-level scope pushed above an app-level one does not clobber the app scope on release', () => {
    const h = createHarness();
    const appModal = new Container();
    const appInside = focusableNode();
    const sceneModal = new Container();
    const sceneInside = focusableNode();

    appModal.addChild(appInside);
    sceneModal.addChild(sceneInside);
    h.scene.root.addChild(appModal);
    h.scene.root.addChild(sceneModal);

    // App-level: pushed directly, independent of any scene facade.
    const appToken = h.im.pushScope(appModal);

    h.im.focus(appInside);

    // Scene-level: nested on top (simulating scene.interaction.scope()).
    const sceneToken = h.im.pushScope(sceneModal);

    h.im.focus(sceneInside);
    expect(h.im.focused).toBe(sceneInside);

    // Releasing the scene-level scope restores the app scope's own trap.
    h.im.popScope(sceneToken);

    expect(h.im.focused).toBe(appInside);
    h.im.focus(sceneInside); // now outside the (once again active) app scope
    expect(h.im.focused).toBe(appInside); // rejected — trap still holds

    h.im.popScope(appToken);
    h.im.destroy();
  });
});

describe('effectively-active scope truth (topmost LIVE entry, not physical stack position)', () => {
  it('still restores focus when the popped scope sits beneath a dead (never-popped) entry', () => {
    const h = createHarness();
    const trigger = focusableNode();
    const outer = new Container();
    const outerInside = focusableNode();
    const deadRoot = new Container();

    outer.addChild(outerInside);
    h.scene.root.addChild(trigger);
    h.scene.root.addChild(outer);
    h.scene.root.addChild(deadRoot);

    h.im.focus(trigger);

    const outerToken = h.im.pushScope(outer);

    h.im.focus(outerInside);

    const deadToken = h.im.pushScope(deadRoot);

    // Destroy the scope root directly (no removeChild) so its stack entry
    // goes stale without ever being popped - see `_isOwned`'s doc comment.
    deadRoot.destroy();

    // `outer`'s entry now sits BENEATH the dead `deadRoot` entry on the
    // stack - popping it must still be recognized as ending the
    // effectively-active scope (the topmost LIVE entry), not dismissed
    // just because it is no longer the last physical array slot.
    h.im.popScope(outerToken);

    expect(h.im.focused).toBe(trigger);

    h.im.popScope(deadToken);
    h.im.destroy();
  });
});

describe('scope reactivation re-enforces the focus trap immediately', () => {
  it('blurs an escaped focus the instant a temporarily-detached scope reattaches', () => {
    const h = createHarness();
    const modal = new Container();
    const insideModal = focusableNode();
    const outside = focusableNode();

    modal.addChild(insideModal);
    h.scene.root.addChild(modal);
    h.scene.root.addChild(outside);

    const token = h.im.pushScope(modal);

    h.im.focus(insideModal);

    // Detach the scope root WITHOUT popping its scope entry - it goes dead
    // (see `_isOwned`'s doc comment), so it stops trapping anything until
    // it reattaches.
    h.scene.root.removeChild(modal);

    // While dead, nothing traps focus - a direct focus() call elsewhere succeeds.
    h.im.focus(outside);
    expect(h.im.focused).toBe(outside);

    // Reattaching must re-enforce the trap immediately, not wait for the
    // next explicit focus() call to notice the escape.
    h.scene.root.addChild(modal);

    expect(h.im.focused).toBeNull();

    h.im.popScope(token);
    h.im.destroy();
  });
});

describe('detachRoot ownership', () => {
  it('does not release a foreign scope pushed outside the detached subtree', () => {
    const h = createHarness();
    const foreign = new Container(); // deliberately NOT added under the scene root being detached
    const sceneChild = new Container();

    h.scene.root.addChild(sceneChild);

    const foreignToken = h.im.pushScope(foreign);

    h.im.detachRoot(h.scene.root);

    // The foreign scope must still be releasable - it was never touched.
    const stack = (h.im as unknown as { _scopeStack: Array<{ token: unknown }> })._scopeStack;

    expect(stack.some(entry => entry.token === foreignToken)).toBe(true);

    h.im.popScope(foreignToken);
    h.im.destroy();
  });

  it('releases a scope rooted inside the detached subtree', () => {
    const h = createHarness();
    const modal = new Container();

    h.scene.root.addChild(modal);
    h.im.pushScope(modal);

    h.im.detachRoot(h.scene.root);

    const stack = (h.im as unknown as { _scopeStack: unknown[] })._scopeStack;

    expect(stack).toHaveLength(0);

    h.im.destroy();
  });

  it('blurs focus only when the focused node is inside the detached subtree', () => {
    const h = createHarness();
    const detachedChild = new Container();
    const inside = focusableNode();

    detachedChild.addChild(inside);
    h.scene.root.addChild(detachedChild);
    h.im.focus(inside);

    h.im.detachRoot(detachedChild);

    expect(h.im.focused).toBeNull();

    h.im.destroy();
  });
});

describe('KeyEvent bubbling', () => {
  it('bubbles keydown from the focused node through its ancestors', () => {
    const h = createHarness();
    const grandparent = new Container();
    const parent = new Container();
    const child = focusableNode();

    parent.addChild(child);
    grandparent.addChild(parent);
    h.scene.root.addChild(grandparent);

    const seen: string[] = [];

    child.onKeyDown.add(() => seen.push('child'));
    parent.onKeyDown.add(() => seen.push('parent'));
    grandparent.onKeyDown.add(() => seen.push('grandparent'));

    h.im.focus(child);
    pressKey(h, 'KeyA');

    expect(seen).toEqual(['child', 'parent', 'grandparent']);

    h.im.destroy();
  });

  it('advances currentTarget to each ancestor while target stays pinned to the focused node', () => {
    const h = createHarness();
    const parent = new Container();
    const child = focusableNode();

    parent.addChild(child);
    h.scene.root.addChild(parent);

    const seenCurrentTargets: unknown[] = [];
    let seenTarget: unknown = null;

    child.onKeyDown.add((event: KeyEvent) => {
      seenCurrentTargets.push(event.currentTarget);
      seenTarget = event.target;
    });
    parent.onKeyDown.add((event: KeyEvent) => {
      seenCurrentTargets.push(event.currentTarget);
    });

    h.im.focus(child);
    pressKey(h, 'KeyA');

    expect(seenCurrentTargets).toEqual([child, parent]);
    expect(seenTarget).toBe(child);

    h.im.destroy();
  });

  it('stopPropagation halts the bubble before it reaches an ancestor', () => {
    const h = createHarness();
    const parent = new Container();
    const child = focusableNode();

    parent.addChild(child);
    h.scene.root.addChild(parent);

    const parentHandler = vi.fn();

    child.onKeyDown.add((event: KeyEvent) => event.stopPropagation());
    parent.onKeyDown.add(parentHandler);

    h.im.focus(child);
    pressKey(h, 'KeyA');

    expect(parentHandler).not.toHaveBeenCalled();

    h.im.destroy();
  });

  it('bubbles keyup the same way as keydown', () => {
    const h = createHarness();
    const parent = new Container();
    const child = focusableNode();

    parent.addChild(child);
    h.scene.root.addChild(parent);

    const parentHandler = vi.fn();

    parent.onKeyUp.add(parentHandler);
    h.im.focus(child);

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA' }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyA' }));
    h.input.preUpdate(0 as never);

    expect(parentHandler).toHaveBeenCalledTimes(1);

    h.im.destroy();
  });
});
