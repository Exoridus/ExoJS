import type { Application } from '#core/Application';
import type { FocusHooks } from '#core/Stage';
import { Container } from '#rendering/Container';
import type { RenderNode } from '#rendering/RenderNode';

import { KeyEvent } from './KeyEvent';
import { Keyboard } from './types';

/**
 * Per-Application keyboard-focus service. Tracks the single focused
 * {@link RenderNode}, routes keyboard input from the {@link InputManager} to
 * it, and provides Tab-order traversal across the focusable nodes of the active
 * focus scope.
 *
 * A node reaches this service through its {@link Stage} (`stage.focus`); app
 * code reaches it through `app.focus`. Constructed automatically by
 * {@link Application}; you do not instantiate this class yourself.
 *
 * Built-in key handling: `Tab` / `Shift+Tab` move focus to the next / previous
 * focusable node. A focused node can call {@link KeyEvent.preventDefault} on its
 * `onKeyDown` event to opt out of this and consume the key itself.
 */
export class FocusManager implements FocusHooks {
  private readonly _app: Application;
  private _focused: RenderNode | null = null;
  private _shiftDown = false;

  // Stack of subtree roots that bound Tab traversal; a modal dialog pushes one.
  private readonly _scopeStack: RenderNode[] = [];

  private readonly _onKeyDownHandler: (channel: number) => void;
  private readonly _onKeyUpHandler: (channel: number) => void;

  public constructor(app: Application) {
    this._app = app;
    this._onKeyDownHandler = this._handleKeyDown.bind(this);
    this._onKeyUpHandler = this._handleKeyUp.bind(this);

    app.input.onKeyDown.add(this._onKeyDownHandler);
    app.input.onKeyUp.add(this._onKeyUpHandler);
  }

  /** The node that currently holds keyboard focus, or `null`. */
  public get focused(): RenderNode | null {
    return this._focused;
  }

  /**
   * Move keyboard focus to `node`. No-op when `node` is already focused or is
   * not {@link RenderNode.focusable}. Fires `onBlur` on the previously focused
   * node, then `onFocus` on `node`.
   */
  public focus(node: RenderNode): void {
    if (node === this._focused || !node.focusable) {
      return;
    }

    this.blur();
    this._focused = node;
    node._peekFocusSignal('focus')?.dispatch(node);
  }

  /** Clear focus, or only clear it when `node` currently holds it. Fires `onBlur`. */
  public blur(node?: RenderNode): void {
    const previous = this._focused;

    if (previous === null || (node !== undefined && node !== previous)) {
      return;
    }

    this._focused = null;
    previous._peekFocusSignal('blur')?.dispatch(previous);
  }

  /** Push a subtree root that bounds subsequent Tab traversal (e.g. a modal dialog). */
  public pushScope(root: RenderNode): void {
    this._scopeStack.push(root);
  }

  /** Pop the most recently pushed focus scope. */
  public popScope(): void {
    this._scopeStack.pop();
  }

  /** Move focus to the next focusable node in the active scope (Tab order). */
  public focusNext(): void {
    this._step(1);
  }

  /** Move focus to the previous focusable node in the active scope (Shift+Tab order). */
  public focusPrevious(): void {
    this._step(-1);
  }

  /** @internal — clear focus when a focused node (or an ancestor of it) leaves the tree. */
  public _notifyNodeRemoved(node: RenderNode): void {
    let current: RenderNode | null = this._focused;

    while (current !== null) {
      if (current === node) {
        this.blur();

        return;
      }

      current = current.parent;
    }
  }

  public destroy(): void {
    this._app.input.onKeyDown.remove(this._onKeyDownHandler);
    this._app.input.onKeyUp.remove(this._onKeyUpHandler);
    this._scopeStack.length = 0;
    this._focused = null;
  }

  private _handleKeyDown(channel: number): void {
    if (channel === Keyboard.Shift) {
      this._shiftDown = true;
    }

    const focused = this._focused;
    let defaultPrevented = false;

    if (focused !== null) {
      const event = new KeyEvent('keydown', channel, focused);

      focused._peekKeySignal('keydown')?.dispatch(event);
      defaultPrevented = event.defaultPrevented;
    }

    if (!defaultPrevented && channel === Keyboard.Tab) {
      if (this._shiftDown) {
        this.focusPrevious();
      } else {
        this.focusNext();
      }
    }
  }

  private _handleKeyUp(channel: number): void {
    if (channel === Keyboard.Shift) {
      this._shiftDown = false;
    }

    const focused = this._focused;

    if (focused !== null) {
      focused._peekKeySignal('keyup')?.dispatch(new KeyEvent('keyup', channel, focused));
    }
  }

  /** Advance focus by `direction` (+1 next, -1 previous), wrapping around the scope. */
  private _step(direction: 1 | -1): void {
    const focusables = this._collectFocusables();

    if (focusables.length === 0) {
      return;
    }

    const currentIndex = this._focused === null ? -1 : focusables.indexOf(this._focused);
    const count = focusables.length;
    const nextIndex = currentIndex === -1 ? (direction === 1 ? 0 : count - 1) : (currentIndex + direction + count) % count;

    this.focus(focusables[nextIndex]);
  }

  /**
   * Collect the focusable nodes of the active scope (the topmost pushed scope,
   * else the active scene root) in Tab order: ascending `tabIndex`, ties broken
   * by document (tree) order.
   */
  private _collectFocusables(): RenderNode[] {
    const root: RenderNode | null = this._scopeStack.at(-1) ?? this._app.scene.currentScene?.root ?? null;

    if (root === null) {
      return [];
    }

    const collected: RenderNode[] = [];

    this._collectInto(root, collected);

    return collected
      .map((node, index) => ({ node, index }))
      .sort((a, b) => a.node.tabIndex - b.node.tabIndex || a.index - b.index)
      .map(entry => entry.node);
  }

  private _collectInto(node: RenderNode, out: RenderNode[]): void {
    if (!node.visible) {
      return;
    }

    if (node.focusable) {
      out.push(node);
    }

    if (node instanceof Container) {
      for (const child of node.children) {
        this._collectInto(child, out);
      }
    }
  }
}
