import type { Application } from '#core/Application';
import { Scene } from '#core/scene/Scene';
import { SceneState } from '#core/scene/SceneState';
import { Signal } from '#core/Signal';
import type { InteractionHooks, Stage } from '#core/Stage';
import { FocusController } from '#input/FocusController';
import type { Gamepad } from '#input/Gamepad';
import { GamepadButton } from '#input/GamepadButton';
import type { InputSystem } from '#input/InputSystem';
import type { KeyEvent } from '#input/KeyEvent';
import { createScopeToken } from '#input/ScopeToken';
import { ChannelSize, Keyboard } from '#input/types';
import { Container } from '#rendering/Container';
import { Drawable } from '#rendering/Drawable';
import { Widget } from '#ui/Widget';

/** Minimal concrete non-Container leaf RenderNode, for exercising Tab-collection through a leaf. */
class LeafNode extends Drawable {}

/** Minimal concrete Widget, for exercising the `enabled` filter without pulling in Text/glyph-atlas mocks. */
class TestWidget extends Widget {}

const noopInteraction: InteractionHooks = {
  _notifyNodeAdded() {},
  _notifyNodeRemoved() {},
  _notifyInteractiveChanged() {},
  _notifyBoundsInvalidated() {},
  _notifyTransformGroupMoved() {},
};

/**
 * Build a minimal Application mock wired to a real Scene root + a
 * FocusController. Sets `Stage.app`, like every production stage does (see
 * that field's own doc comment) - needed for the ownership tests below to
 * tell two Applications' nodes apart; harmless for every other test here,
 * which only ever deals with one.
 */
const createFocusApp = (): {
  app: Application;
  scene: Scene;
  focus: FocusController;
  onKeyDown: Signal<[number]>;
  onKeyUp: Signal<[number]>;
  onAnyGamepadButtonDown: Signal<[Gamepad, GamepadButton, number]>;
  /** Backs `_actionSample().values` - tests set `channels[Keyboard.Shift]` to drive `_isShiftDown()`. */
  channels: Float32Array;
} => {
  const onKeyDown = new Signal<[number]>();
  const onKeyUp = new Signal<[number]>();
  const onAnyGamepadButtonDown = new Signal<[Gamepad, GamepadButton, number]>();
  const channels = new Float32Array(ChannelSize.Container);
  const scene = new Scene();
  const app = {
    input: {
      onKeyDown,
      onKeyUp,
      onAnyGamepadButtonDown,
      _actionSample: () => ({ values: channels, batches: [], frameId: 0, timestamp: 0 }),
    } as unknown as InputSystem,
    scenes: {
      get currentScene(): Scene | null {
        return scene;
      },
      state: SceneState.Active as SceneState | null,
      _transitionGateOpen: false,
    },
  } as unknown as Application;
  const focus = new FocusController(app);
  const stage: Stage = { interaction: noopInteraction, focus, app };

  scene.root._setStage(stage);

  return { app, scene, focus, onKeyDown, onKeyUp, onAnyGamepadButtonDown, channels };
};

const focusable = (tabIndex = 0): Container => {
  const node = new Container();

  node.focusable = true;
  node.tabIndex = tabIndex;

  return node;
};

/** A focusable node with a real extent, so directional navigation has geometry to compare. */
const spatial = (x: number, y: number, size = 10): Container => {
  const node = focusable();

  node._setLocalBounds(0, 0, size, size);
  node.setPosition(x, y);

  return node;
};

/** The gamepad signal reports a button object; only its channel matters here. */
const padButton = (channel: number): GamepadButton => ({ channel }) as GamepadButton;

const focusableWidget = (tabIndex = 0): Widget => {
  const widget = new TestWidget();

  widget.focusable = true;
  widget.tabIndex = tabIndex;

  return widget;
};

describe('FocusController', () => {
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
    const { scene, focus, onKeyDown, onKeyUp, channels } = createFocusApp();
    const a = focusable();
    const b = focusable();
    const c = focusable();

    scene.root.addChild(a).addChild(b).addChild(c);
    focus.focus(a);

    onKeyDown.dispatch(Keyboard.Tab);
    expect(focus.focused).toBe(b);

    onKeyDown.dispatch(Keyboard.Tab);
    expect(focus.focused).toBe(c);

    // `_isShiftDown` reads the aggregate `Keyboard.Shift` channel - the real
    // InputSystem sets it alongside ShiftLeft/ShiftRight (see
    // keyboardModifierChannelInfo), so the test drives both to match.
    channels[Keyboard.Shift] = 1;
    onKeyDown.dispatch(Keyboard.ShiftRight);
    onKeyDown.dispatch(Keyboard.Tab);
    expect(focus.focused).toBe(b);

    channels[Keyboard.Shift] = 0;
    onKeyUp.dispatch(Keyboard.ShiftRight);
    onKeyDown.dispatch(Keyboard.Tab);
    expect(focus.focused).toBe(c);
  });

  test('either physical Shift key (left or right) triggers Shift+Tab reverse navigation', () => {
    const { scene, focus, onKeyDown, onKeyUp, channels } = createFocusApp();
    const a = focusable();
    const b = focusable();

    scene.root.addChild(a).addChild(b);
    focus.focus(b);

    channels[Keyboard.Shift] = 1;
    onKeyDown.dispatch(Keyboard.ShiftLeft);
    onKeyDown.dispatch(Keyboard.Tab);
    expect(focus.focused).toBe(a);

    onKeyUp.dispatch(Keyboard.ShiftLeft);
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

  test('Tab advances to the next valid candidate instead of stalling when the natural next one fails validation mid-step', () => {
    const { scene, focus, onKeyDown } = createFocusApp();
    const a = focusable();
    const flaky = new Container();
    const c = focusable();

    scene.root.addChild(a).addChild(flaky).addChild(c);

    // `flaky` looks focusable while `_collectFocusables()` walks the tree,
    // but has stopped being focusable by the time `focus()` validates it -
    // simulating the race `_step()` must not stall on.
    let reads = 0;

    Object.defineProperty(flaky, 'focusable', {
      configurable: true,
      get: (): boolean => {
        reads++;

        return reads === 1;
      },
    });

    focus.focus(a);
    onKeyDown.dispatch(Keyboard.Tab);

    // A single `focus(next)` attempt would have silently no-opped on
    // `flaky`, leaving focus stuck on `a`. Tab must land on `c` instead.
    expect(focus.focused).toBe(c);
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

  test('focus() rejects an already-hidden node', () => {
    const { scene, focus } = createFocusApp();
    const node = focusable();

    node.visible = false;
    scene.root.addChild(node);

    focus.focus(node);

    expect(focus.focused).toBeNull();
  });

  test('hiding the focused node blurs it on the next key event', () => {
    const { scene, focus, onKeyDown } = createFocusApp();
    const node = focusable();
    const blurred = vi.fn();

    scene.root.addChild(node);
    focus.focus(node);
    node.onBlur.add(blurred);

    node.visible = false;
    onKeyDown.dispatch(Keyboard.Enter);

    expect(focus.focused).toBeNull();
    expect(blurred).toHaveBeenCalledTimes(1);
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

  test('destroy() detaches from InputSystem and clears state', () => {
    const { scene, focus, onKeyDown, onKeyUp } = createFocusApp();
    const node = focusable();

    scene.root.addChild(node);
    focus.focus(node);
    expect(focus.focused).toBe(node);

    focus.destroy();

    expect(focus.focused).toBeNull();

    // The onKeyDown/onKeyUp handlers were removed - further dispatches are no-ops.
    const handler = vi.fn();

    node.onKeyDown.add(handler);
    onKeyDown.dispatch(Keyboard.Tab);
    onKeyUp.dispatch(Keyboard.Tab);

    expect(handler).not.toHaveBeenCalled();
  });

  test('keyup is a no-op when nothing is focused', () => {
    const { onKeyUp } = createFocusApp();

    expect(() => onKeyUp.dispatch(Keyboard.Enter)).not.toThrow();
  });

  test('Tab is a no-op when the active scope has zero focusable nodes', () => {
    const { scene, focus, onKeyDown } = createFocusApp();

    scene.root.addChild(new Container()); // present, but not focusable

    expect(() => onKeyDown.dispatch(Keyboard.Tab)).not.toThrow();
    expect(focus.focused).toBeNull();
  });

  test('Tab is a no-op when there is no active scene (root resolves to null)', () => {
    const onKeyDown = new Signal<[number]>();
    const onKeyUp = new Signal<[number]>();
    const onAnyGamepadButtonDown = new Signal<[Gamepad, GamepadButton, number]>();
    const app = {
      input: { onKeyDown, onKeyUp, onAnyGamepadButtonDown } as unknown as InputSystem,
      scenes: {
        get currentScene(): Scene | null {
          return null;
        },
      },
    } as unknown as Application;
    const focus = new FocusController(app);

    expect(() => onKeyDown.dispatch(Keyboard.Tab)).not.toThrow();
    expect(focus.focused).toBeNull();
  });

  test('Tab/Enter/Escape are ignored while the scene-director transition gate is open', () => {
    const { app, scene, focus, onKeyDown } = createFocusApp();
    const a = focusable();
    const b = focusable();

    scene.root.addChild(a).addChild(b);
    focus.focus(a);

    const appMutable = app as unknown as { scenes: { _transitionGateOpen: boolean } };
    appMutable.scenes._transitionGateOpen = true;

    onKeyDown.dispatch(Keyboard.Tab);

    // Same gate InteractionSystem._dispatchFrame applies to pointer frames -
    // Tab must not move focus onto the outgoing scene's widgets mid-transition.
    expect(focus.focused).toBe(a);

    appMutable.scenes._transitionGateOpen = false;
    onKeyDown.dispatch(Keyboard.Tab);

    expect(focus.focused).toBe(b);
  });

  test('key events are ignored while the scene state is not Active', () => {
    const { app, scene, focus, onKeyDown } = createFocusApp();
    const a = focusable();

    scene.root.addChild(a);
    focus.focus(a);

    const appMutable = app as unknown as { scenes: { state: SceneState | null } };
    appMutable.scenes.state = SceneState.Suspended;

    const handler = vi.fn();
    a.onKeyDown.add(handler);
    onKeyDown.dispatch(Keyboard.Enter);

    expect(handler).not.toHaveBeenCalled();
  });

  test('focusPrevious() with nothing focused wraps to the last focusable node', () => {
    const { scene, focus } = createFocusApp();
    const a = focusable();
    const b = focusable();
    const c = focusable();

    scene.root.addChild(a).addChild(b).addChild(c);

    focus.focusPrevious();

    expect(focus.focused).toBe(c);
  });

  test('an invisible focusable node is excluded from Tab order', () => {
    const { scene, focus, onKeyDown } = createFocusApp();
    const visible = focusable();
    const hidden = focusable();

    hidden.visible = false;
    scene.root.addChild(visible).addChild(hidden);

    onKeyDown.dispatch(Keyboard.Tab);
    expect(focus.focused).toBe(visible);

    // Wraps back to `visible` - `hidden` is never a stop along the way.
    onKeyDown.dispatch(Keyboard.Tab);
    expect(focus.focused).toBe(visible);
  });

  test('a non-Container focusable leaf node participates in Tab order', () => {
    const { scene, focus, onKeyDown } = createFocusApp();
    const leaf = new LeafNode();

    leaf.focusable = true;
    scene.root.addChild(leaf);

    onKeyDown.dispatch(Keyboard.Tab);

    expect(focus.focused).toBe(leaf);

    leaf.destroy();
  });

  test('pushScope restricts Tab traversal to a subtree', () => {
    const { scene, focus, onKeyDown } = createFocusApp();
    const outside = focusable();
    const modal = new Container();
    const inA = focusable();
    const inB = focusable();

    modal.addChild(inA).addChild(inB);
    scene.root.addChild(outside).addChild(modal);

    const token = createScopeToken();

    focus.pushScope(token, modal);

    onKeyDown.dispatch(Keyboard.Tab);
    expect(focus.focused).toBe(inA);

    onKeyDown.dispatch(Keyboard.Tab);
    expect(focus.focused).toBe(inB);

    onKeyDown.dispatch(Keyboard.Tab);
    expect(focus.focused).toBe(inA);

    // Nothing was focused when the scope opened, so popping it restores
    // exactly that - not whatever Tab happened to land on inside the scope.
    focus.popScope(token);
    expect(focus.focused).toBeNull();
  });
});

describe('FocusController — ownership hardening', () => {
  test('focus() rejects a node that belongs to a different Application', () => {
    const a = createFocusApp();
    const b = createFocusApp();
    const nodeFromB = focusable();

    b.scene.root.addChild(nodeFromB);

    a.focus.focus(nodeFromB);

    expect(a.focus.focused).toBeNull();
    expect(b.focus.focused).toBeNull();
  });

  test('focus() rejects a node never attached to any stage', () => {
    const { focus } = createFocusApp();
    const node = focusable(); // constructed, but never added to a scene

    focus.focus(node);

    expect(focus.focused).toBeNull();
  });

  test('focus() rejects a node already removed from the tree', () => {
    const { scene, focus } = createFocusApp();
    const node = focusable();

    scene.root.addChild(node);
    scene.root.removeChild(node);

    focus.focus(node);

    expect(focus.focused).toBeNull();
  });

  test('a bare destroy() (no removeChild) on the focused node is noticed on the next key event, without dispatching onKeyDown on it', () => {
    const { scene, focus, onKeyDown } = createFocusApp();
    const node = focusable();
    const handler = vi.fn();

    node.onKeyDown.add(handler);
    scene.root.addChild(node);
    focus.focus(node);

    node.destroy(); // no removeChild first — still attached, structurally

    expect(() => onKeyDown.dispatch(Keyboard.Enter)).not.toThrow();
    expect(handler).not.toHaveBeenCalled();
    expect(focus.focused).toBeNull();
  });

  test('a node removed via removeChild (not destroyed) is not re-focused when the scope that remembered it pops', () => {
    const { scene, focus } = createFocusApp();
    const modal = new Container();
    const outside = focusable();

    scene.root.addChild(outside).addChild(modal);
    focus.focus(outside);

    const token = createScopeToken();

    // `outside` sits outside `modal`'s subtree, so pushing the scope blurs it
    // and remembers it as this scope's previousFocus.
    focus.pushScope(token, modal);
    expect(focus.focused).toBeNull();

    // `outside` is removed (not destroyed) while the scope is still active.
    scene.root.removeChild(outside);

    focus.popScope(token);

    expect(focus.focused).toBeNull();
  });

  test('nested scopes: a previousFocus destroyed while a scope above it is active is not resurrected, regardless of pop order', () => {
    const { scene, focus } = createFocusApp();
    const x = focusable();
    const y = focusable();
    const modalA = new Container();
    const modalB = new Container();

    modalA.addChild(y);
    scene.root.addChild(x).addChild(modalA).addChild(modalB);

    const tokenA = createScopeToken();
    const tokenB = createScopeToken();

    focus.focus(x);
    focus.pushScope(tokenA, modalA); // remembers previousFocus = x
    focus.focus(y);
    focus.pushScope(tokenB, modalB); // remembers previousFocus = y

    // x - scope A's remembered previousFocus - is destroyed while scope B
    // (unrelated to x) is the active one.
    x.destroy();

    // Popping the unrelated, still-active scope B first must not touch
    // scope A's bookkeeping.
    focus.popScope(tokenB);
    expect(focus.focused).toBe(y);

    // Now scope A pops and tries to restore x - already destroyed.
    focus.popScope(tokenA);
    expect(focus.focused).toBeNull();
  });

  test('a scope root removed via removeChild is skipped: Tab traversal falls through to the real (unscoped) scene graph instead of staying confined to the detached subtree', () => {
    const { scene, focus, onKeyDown } = createFocusApp();
    const modal = new Container();
    const inModal = focusable();
    const inScene = focusable();

    modal.addChild(inModal);
    scene.root.addChild(modal).addChild(inScene);

    const token = createScopeToken();

    focus.pushScope(token, modal);

    // Detach the scope root itself without popping the scope.
    scene.root.removeChild(modal);

    onKeyDown.dispatch(Keyboard.Tab);

    // The dead scope no longer confines traversal to its own (now detached)
    // subtree - `inScene`, part of the real graph, is reachable again.
    expect(focus.focused).toBe(inScene);

    focus.popScope(token);
  });

  test('a bare destroy() node (no removeChild) is excluded from Tab traversal even though the tree walk still finds it', () => {
    const { scene, focus, onKeyDown } = createFocusApp();
    const a = focusable();
    const b = focusable();

    scene.root.addChild(a).addChild(b);
    b.destroy(); // no removeChild — still structurally reachable by the tree walk

    onKeyDown.dispatch(Keyboard.Tab);

    // Without the ownership check in `_collectInto`, `b` would still be
    // collected and become the Tab target.
    expect(focus.focused).toBe(a);

    onKeyDown.dispatch(Keyboard.Tab);
    // Wraps back to `a` - the sole surviving candidate - `b` is never a stop.
    expect(focus.focused).toBe(a);
  });

  test('a disabled widget is excluded from Tab order and cannot be focused programmatically', () => {
    const { scene, focus, onKeyDown } = createFocusApp();
    const enabled = focusableWidget();
    const disabled = focusableWidget();

    disabled.enabled = false;
    scene.root.addChild(enabled).addChild(disabled);

    focus.focus(disabled);
    expect(focus.focused).toBeNull();

    onKeyDown.dispatch(Keyboard.Tab);
    expect(focus.focused).toBe(enabled);

    // Wraps straight back to `enabled` - `disabled` is never a stop along the way.
    onKeyDown.dispatch(Keyboard.Tab);
    expect(focus.focused).toBe(enabled);
  });

  test('re-enabling a widget makes it focusable again', () => {
    const { scene, focus } = createFocusApp();
    const widget = focusableWidget();

    widget.enabled = false;
    scene.root.addChild(widget);

    focus.focus(widget);
    expect(focus.focused).toBeNull();

    widget.enabled = true;
    focus.focus(widget);

    expect(focus.focused).toBe(widget);
  });

  test('a scope pop does not restore focus to a widget that was disabled meanwhile', () => {
    const { scene, focus } = createFocusApp();
    const widget = focusableWidget();
    const modal = new Container();

    scene.root.addChild(widget).addChild(modal);
    focus.focus(widget);
    expect(focus.focused).toBe(widget);

    const token = createScopeToken();

    focus.pushScope(token, modal);
    widget.enabled = false;
    focus.popScope(token);

    expect(focus.focused).toBeNull();
  });

  test('a widget nested under a disabled ancestor widget is excluded from Tab order, even though its own enabled flag stays true (ME-56)', () => {
    const { scene, focus, onKeyDown } = createFocusApp();
    const parent = new TestWidget();
    const child = focusableWidget();
    const sibling = focusableWidget();

    parent.addChild(child);
    scene.root.addChild(sibling).addChild(parent);

    parent.enabled = false;

    focus.focus(child);
    expect(focus.focused).toBeNull();

    onKeyDown.dispatch(Keyboard.Tab);
    expect(focus.focused).toBe(sibling);

    // Wraps straight back to `sibling` - `child` is never a stop along the way.
    onKeyDown.dispatch(Keyboard.Tab);
    expect(focus.focused).toBe(sibling);
  });

  test('re-enabling the ancestor widget restores focus eligibility for a descendant whose own enabled flag never changed (ME-56)', () => {
    const { scene, focus } = createFocusApp();
    const parent = new TestWidget();
    const child = focusableWidget();

    parent.addChild(child);
    scene.root.addChild(parent);

    parent.enabled = false;
    focus.focus(child);
    expect(focus.focused).toBeNull();

    parent.enabled = true;
    focus.focus(child);
    expect(focus.focused).toBe(child);
  });

  test('focus() rejects a scope-confined target once the scope root itself has been destroyed', () => {
    const { scene, focus } = createFocusApp();
    const modal = new Container();
    const inModal = focusable();
    const inScene = focusable();

    modal.addChild(inModal);
    scene.root.addChild(modal).addChild(inScene);

    const token = createScopeToken();

    focus.pushScope(token, modal);
    modal.destroy(); // no removeChild — the harder case, see `_isOwned`'s doc comment

    // The scope is now dead; focus is no longer confined to its subtree, so
    // a node from the real scene graph outside it can be focused again.
    focus.focus(inScene);

    expect(focus.focused).toBe(inScene);

    focus.popScope(token);
  });
});

describe('FocusController directional navigation', () => {
  /**
   * Four nodes on a grid, all in the world layer - reached only with the
   * `'always'` policy, which keeps these tests independent of a UI layer:
   *
   * ```
   * topLeft   topRight
   * bottomLeft bottomRight
   * ```
   */
  const createGrid = (): {
    focus: FocusController;
    onKeyDown: Signal<[number]>;
    onAnyGamepadButtonDown: Signal<[Gamepad, GamepadButton, number]>;
    nodes: { topLeft: Container; topRight: Container; bottomLeft: Container; bottomRight: Container };
  } => {
    const { scene, focus, onKeyDown, onAnyGamepadButtonDown } = createFocusApp();
    const topLeft = spatial(0, 0);
    const topRight = spatial(100, 0);
    const bottomLeft = spatial(0, 100);
    const bottomRight = spatial(100, 100);

    scene.root.addChild(topLeft).addChild(topRight).addChild(bottomLeft).addChild(bottomRight);
    focus.navigation = 'always';

    return { focus, onKeyDown, onAnyGamepadButtonDown, nodes: { topLeft, topRight, bottomLeft, bottomRight } };
  };

  test('the arrow keys move focus to the neighbour in that direction', () => {
    const { focus, onKeyDown, nodes } = createGrid();

    focus.focus(nodes.topLeft);

    onKeyDown.dispatch(Keyboard.Right);
    expect(focus.focused).toBe(nodes.topRight);

    onKeyDown.dispatch(Keyboard.Down);
    expect(focus.focused).toBe(nodes.bottomRight);

    onKeyDown.dispatch(Keyboard.Left);
    expect(focus.focused).toBe(nodes.bottomLeft);

    onKeyDown.dispatch(Keyboard.Up);
    expect(focus.focused).toBe(nodes.topLeft);
  });

  test('navigation does not wrap at the edge of the layout', () => {
    const { focus, onKeyDown, nodes } = createGrid();

    focus.focus(nodes.topLeft);

    onKeyDown.dispatch(Keyboard.Left);
    expect(focus.focused).toBe(nodes.topLeft);

    onKeyDown.dispatch(Keyboard.Up);
    expect(focus.focused).toBe(nodes.topLeft);
  });

  test('a node roughly straight ahead beats a closer one off to the side', () => {
    const { scene, focus } = createFocusApp();
    const origin = spatial(0, 0);
    const ahead = spatial(100, 0);
    const offAxis = spatial(60, 90);

    scene.root.addChild(origin).addChild(offAxis).addChild(ahead);
    focus.navigation = 'always';
    focus.focus(origin);

    focus.focusInDirection('right');

    expect(focus.focused).toBe(ahead);
  });

  test('with nothing focused, navigating enters at the first candidate', () => {
    const { focus, onKeyDown, nodes } = createGrid();

    onKeyDown.dispatch(Keyboard.Down);

    expect(focus.focused).toBe(nodes.topLeft);
  });

  test('a D-pad press navigates like the matching arrow key', () => {
    const { focus, onAnyGamepadButtonDown, nodes } = createGrid();

    focus.focus(nodes.topLeft);

    onAnyGamepadButtonDown.dispatch({} as Gamepad, padButton(GamepadButton.DPadRight), 1);
    expect(focus.focused).toBe(nodes.topRight);

    onAnyGamepadButtonDown.dispatch({} as Gamepad, padButton(GamepadButton.DPadDown), 1);
    expect(focus.focused).toBe(nodes.bottomRight);
  });

  test("the default 'ui' policy leaves world-layer nodes alone", () => {
    const { focus, onKeyDown, nodes } = createGrid();

    focus.navigation = 'ui';
    focus.focus(nodes.topLeft);

    onKeyDown.dispatch(Keyboard.Right);

    expect(focus.focused).toBe(nodes.topLeft);
  });

  test("'never' turns directional navigation off entirely", () => {
    const { focus, onKeyDown, onAnyGamepadButtonDown, nodes } = createGrid();

    focus.navigation = 'never';
    focus.focus(nodes.topLeft);

    onKeyDown.dispatch(Keyboard.Right);
    onAnyGamepadButtonDown.dispatch({} as Gamepad, padButton(GamepadButton.DPadRight), 1);
    focus.focusInDirection('right');

    expect(focus.focused).toBe(nodes.topLeft);
  });

  test('a focused node consuming the arrow key keeps focus where it is', () => {
    const { focus, onKeyDown, nodes } = createGrid();

    nodes.topLeft.onKeyDown.add(event => event.preventDefault());
    focus.focus(nodes.topLeft);

    onKeyDown.dispatch(Keyboard.Right);

    expect(focus.focused).toBe(nodes.topLeft);
  });

  test('an active scope confines navigation to its subtree, whatever the policy', () => {
    const { scene, focus } = createFocusApp();
    const modal = new Container();
    const inModal = spatial(0, 0);
    const alsoInModal = spatial(100, 0);
    const outside = spatial(200, 0);

    modal.addChild(inModal).addChild(alsoInModal);
    scene.root.addChild(modal).addChild(outside);

    const token = createScopeToken();

    focus.pushScope(token, modal);
    focus.focus(inModal);

    focus.focusInDirection('right');
    expect(focus.focused).toBe(alsoInModal);

    // `outside` is further right still, but the scope ends the list.
    focus.focusInDirection('right');
    expect(focus.focused).toBe(alsoInModal);

    focus.popScope(token);
  });
});
