import type { Application } from '#core/Application';
import { Scene } from '#core/Scene';
import { Signal } from '#core/Signal';
import type { InteractionHooks, Stage } from '#core/Stage';
import { FocusManager } from '#input/FocusManager';
import type { InputManager } from '#input/InputManager';
import type { KeyEvent } from '#input/KeyEvent';
import { Keyboard } from '#input/types';
import { Container } from '#rendering/Container';

const noopInteraction: InteractionHooks = {
  _notifyNodeAdded() {},
  _notifyNodeRemoved() {},
  _notifyInteractiveChanged() {},
  _notifyBoundsInvalidated() {},
};

/** Build a minimal Application mock wired to a real Scene root + a FocusManager. */
const createFocusApp = (): {
  scene: Scene;
  focus: FocusManager;
  onKeyDown: Signal<[number]>;
  onKeyUp: Signal<[number]>;
} => {
  const onKeyDown = new Signal<[number]>();
  const onKeyUp = new Signal<[number]>();
  const scene = new Scene();
  const app = {
    input: { onKeyDown, onKeyUp } as unknown as InputManager,
    scene: {
      get currentScene(): Scene | null {
        return scene;
      },
    },
  } as unknown as Application;
  const focus = new FocusManager(app);
  const stage: Stage = { interaction: noopInteraction, focus };

  scene.root._setStage(stage);

  return { scene, focus, onKeyDown, onKeyUp };
};

const focusable = (tabIndex = 0): Container => {
  const node = new Container();

  node.focusable = true;
  node.tabIndex = tabIndex;

  return node;
};

describe('FocusManager', () => {
  test('focus sets the focused node and fires onFocus', () => {
    const { scene, focus } = createFocusApp();
    const node = focusable();

    scene.root.addChild(node);

    const onFocus = vi.fn();

    node.onFocus.add(onFocus);
    focus.focus(node);

    expect(focus.focused).toBe(node);
    expect(onFocus).toHaveBeenCalledWith(node);
  });

  test('focus is a no-op for a non-focusable node', () => {
    const { scene, focus } = createFocusApp();
    const node = new Container();

    scene.root.addChild(node);
    focus.focus(node);

    expect(focus.focused).toBeNull();
  });

  test('moving focus blurs the previous node then focuses the new one', () => {
    const { scene, focus } = createFocusApp();
    const a = focusable();
    const b = focusable();

    scene.root.addChild(a).addChild(b);

    const order: string[] = [];

    a.onBlur.add(() => order.push('blur-a'));
    b.onFocus.add(() => order.push('focus-b'));

    focus.focus(a);
    focus.focus(b);

    expect(focus.focused).toBe(b);
    expect(order).toEqual(['blur-a', 'focus-b']);
  });

  test('blur clears focus and fires onBlur', () => {
    const { scene, focus } = createFocusApp();
    const node = focusable();

    scene.root.addChild(node);

    const onBlur = vi.fn();

    node.onBlur.add(onBlur);
    focus.focus(node);
    focus.blur();

    expect(focus.focused).toBeNull();
    expect(onBlur).toHaveBeenCalledWith(node);
  });

  test('blur(node) only clears when that node currently holds focus', () => {
    const { scene, focus } = createFocusApp();
    const a = focusable();
    const b = focusable();

    scene.root.addChild(a).addChild(b);
    focus.focus(a);

    focus.blur(b);
    expect(focus.focused).toBe(a);

    focus.blur(a);
    expect(focus.focused).toBeNull();
  });

  test('routes keydown/keyup to the focused node', () => {
    const { scene, focus, onKeyDown, onKeyUp } = createFocusApp();
    const node = focusable();

    scene.root.addChild(node);

    const downs: KeyEvent[] = [];
    const ups: KeyEvent[] = [];

    node.onKeyDown.add(event => downs.push(event));
    node.onKeyUp.add(event => ups.push(event));

    focus.focus(node);
    onKeyDown.dispatch(Keyboard.Enter);
    onKeyUp.dispatch(Keyboard.Enter);

    expect(downs).toHaveLength(1);
    expect(downs[0].channel).toBe(Keyboard.Enter);
    expect(downs[0].type).toBe('keydown');
    expect(downs[0].target).toBe(node);
    expect(ups[0].type).toBe('keyup');
  });

  test('does not route keys when nothing is focused', () => {
    const { scene, onKeyDown } = createFocusApp();
    const node = focusable();

    scene.root.addChild(node);

    const handler = vi.fn();

    node.onKeyDown.add(handler);
    onKeyDown.dispatch(Keyboard.Enter);

    expect(handler).not.toHaveBeenCalled();
  });

  test('Tab moves focus forward, Shift+Tab moves it backward', () => {
    const { scene, focus, onKeyDown, onKeyUp } = createFocusApp();
    const a = focusable();
    const b = focusable();
    const c = focusable();

    scene.root.addChild(a).addChild(b).addChild(c);
    focus.focus(a);

    onKeyDown.dispatch(Keyboard.Tab);
    expect(focus.focused).toBe(b);

    onKeyDown.dispatch(Keyboard.Tab);
    expect(focus.focused).toBe(c);

    onKeyDown.dispatch(Keyboard.Shift);
    onKeyDown.dispatch(Keyboard.Tab);
    expect(focus.focused).toBe(b);

    onKeyUp.dispatch(Keyboard.Shift);
    onKeyDown.dispatch(Keyboard.Tab);
    expect(focus.focused).toBe(c);
  });

  test('Tab wraps around the scope', () => {
    const { scene, focus, onKeyDown } = createFocusApp();
    const a = focusable();
    const b = focusable();

    scene.root.addChild(a).addChild(b);
    focus.focus(b);

    onKeyDown.dispatch(Keyboard.Tab);
    expect(focus.focused).toBe(a);
  });

  test('Tab traversal honors tabIndex over document order', () => {
    const { scene, focus, onKeyDown } = createFocusApp();
    const first = focusable(1);
    const second = focusable(2);

    // Added in reverse document order; the lower tabIndex must still win.
    scene.root.addChild(second).addChild(first);

    onKeyDown.dispatch(Keyboard.Tab);
    expect(focus.focused).toBe(first);

    onKeyDown.dispatch(Keyboard.Tab);
    expect(focus.focused).toBe(second);
  });

  test('preventDefault on a Tab keydown suppresses traversal', () => {
    const { scene, focus, onKeyDown } = createFocusApp();
    const a = focusable();
    const b = focusable();

    scene.root.addChild(a).addChild(b);
    a.onKeyDown.add(event => event.preventDefault());
    focus.focus(a);

    onKeyDown.dispatch(Keyboard.Tab);

    expect(focus.focused).toBe(a);
  });

  test('removing a focused node from the tree clears focus', () => {
    const { scene, focus } = createFocusApp();
    const node = focusable();

    scene.root.addChild(node);
    focus.focus(node);
    scene.root.removeChild(node);

    expect(focus.focused).toBeNull();
  });

  test('removing an ancestor of the focused node clears focus', () => {
    const { scene, focus } = createFocusApp();
    const panel = new Container();
    const node = focusable();

    panel.addChild(node);
    scene.root.addChild(panel);
    focus.focus(node);
    scene.root.removeChild(panel);

    expect(focus.focused).toBeNull();
  });

  test('node.focus()/blur() convenience routes through the stage', () => {
    const { scene, focus } = createFocusApp();
    const node = focusable();

    scene.root.addChild(node);

    node.focus();
    expect(focus.focused).toBe(node);

    node.blur();
    expect(focus.focused).toBeNull();
  });

  test('pushScope restricts Tab traversal to a subtree', () => {
    const { scene, focus, onKeyDown } = createFocusApp();
    const outside = focusable();
    const modal = new Container();
    const inA = focusable();
    const inB = focusable();

    modal.addChild(inA).addChild(inB);
    scene.root.addChild(outside).addChild(modal);
    focus.pushScope(modal);

    onKeyDown.dispatch(Keyboard.Tab);
    expect(focus.focused).toBe(inA);

    onKeyDown.dispatch(Keyboard.Tab);
    expect(focus.focused).toBe(inB);

    onKeyDown.dispatch(Keyboard.Tab);
    expect(focus.focused).toBe(inA);

    focus.popScope();
    expect(focus.focused).toBe(inA);
  });
});
