import type { Application } from '#core/Application';
import type { FocusHooks, Stage } from '#core/Stage';
import { Container } from '#rendering/Container';
import type { RenderNode } from '#rendering/RenderNode';

import { KeyEvent } from './KeyEvent';
import type { ScopeToken } from './ScopeToken';
import { Keyboard } from './types';

/** One entry of the focus-scope stack — see {@link FocusController.pushScope}. */
interface FocusScopeEntry {
  readonly token: ScopeToken;
  readonly root: RenderNode;
  /** Whatever held focus the instant this scope activated, restored when it pops. */
  readonly previousFocus: RenderNode | null;
}

/**
 * Keyboard-focus service owned by the {@link InteractionManager}. Tracks the
 * single focused {@link RenderNode}, routes keyboard input from the
 * {@link InputManager} to it, and provides Tab-order traversal across the
 * focusable nodes of the active scope.
 *
 * Not public API — RenderNode focus is reached through `app.interaction`
 * (`focused`, `focus`, `blur`, `focusNext`, `focusPrevious`), which forwards
 * here. Kept as a separate class because focus and pointer picking are
 * genuinely different concerns; they merely share an owner and a scope stack.
 * Distinct from canvas/application focus, which lives on
 * `app.input.canvasFocused`.
 *
 * Built-in key handling: `Tab` / `Shift+Tab` move focus to the next / previous
 * focusable node. A focused node can call {@link KeyEvent.preventDefault} on its
 * `onKeyDown` event to opt out of this and consume the key itself.
 *
 * @internal
 */
export class FocusController implements FocusHooks {
  private readonly _app: Application;
  private _focused: RenderNode | null = null;
  private _shiftDown = false;

  // Stack of scopes that bound Tab traversal AND act as a focus trap; a modal
  // dialog pushes one. Keyed by stable token, not by root — see ScopeToken's
  // doc comment for why root identity alone cannot identify an entry.
  private readonly _scopeStack: FocusScopeEntry[] = [];

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
   * Move keyboard focus to `node`. No-op when `node` is already focused, is
   * not {@link RenderNode.focusable}, does not belong to this
   * {@link Application} (a different Application's node, one never attached
   * to any stage, or one already removed — see {@link _isOwned}'s doc
   * comment), or — while a scope is active — sits outside that scope's
   * subtree: an active scope is a real focus trap, not only a Tab-order
   * boundary, so programmatic focus cannot escape it either. Fires `onBlur`
   * on the previously focused node, then `onFocus` on `node`.
   */
  public focus(node: RenderNode): void {
    if (node === this._focused || !node.focusable || !this._isOwned(node)) {
      return;
    }

    const activeScope = this._activeScopeRoot();

    if (activeScope !== null && !this._isInsideScope(node, activeScope)) {
      return;
    }

    this.blur();
    this._focused = node;
    node._peekFocusSignal('focus')?.dispatch(node);
  }

  /**
   * Clear focus, or only clear it when `node` currently holds it. Fires
   * `onBlur` — unless the previously focused node is already destroyed (a
   * bare `destroy()` with no prior `removeChild()` never reaches
   * {@link _notifyNodeRemoved}, so this can be the first place that notices),
   * in which case no event is dispatched on it.
   */
  public blur(node?: RenderNode): void {
    const previous = this._focused;

    if (previous === null || (node !== undefined && node !== previous)) {
      return;
    }

    this._focused = null;

    if (!previous.destroyed) {
      previous._peekFocusSignal('blur')?.dispatch(previous);
    }
  }

  /**
   * Bound subsequent Tab traversal — and, from this point on, every
   * programmatic {@link focus} call — to `root`'s subtree. Pushed by
   * {@link InteractionManager.pushScope} so focus navigation and pointer
   * hit-testing are confined to the same subtree — a modal that shields
   * clicks must shield Tab (and focus) too.
   *
   * Whatever holds focus at this instant is blurred immediately if it sits
   * outside `root` — a scope is a trap from the moment it activates, not
   * only once something inside it is explicitly focused. That prior focus is
   * remembered either way and restored by the matching {@link popScope}.
   */
  public pushScope(token: ScopeToken, root: RenderNode): void {
    const previousFocus = this._focused;

    if (previousFocus !== null && !this._isInsideScope(previousFocus, root)) {
      this.blur();
    }

    this._scopeStack.push({ token, root, previousFocus });
  }

  /**
   * Whether `node` belongs to this controller's {@link Application}: not
   * destroyed, and currently attached to a stage — one installed by THIS
   * Application, or (per {@link Stage.app}'s own doc comment) a lightweight
   * stub stage that does not declare an owner at all, which every production
   * stage does. Rejects a different Application's node, one never attached
   * to any stage, and one already removed alike. `destroyed` alone is not
   * enough: `removeChild()` detaches a node from its stage without
   * destroying it, and a node merely reparented elsewhere within the SAME
   * Application (a temporary state, not a removal) still passes here, which
   * is the point — ownership is what matters at the point of use, not
   * whether the node briefly changed parents.
   */
  private _isOwned(node: RenderNode): boolean {
    const stage = node._getStage();

    return !node.destroyed && stage !== null && (stage.app === undefined || stage.app === this._app);
  }

  /**
   * The nearest active scope root that is still owned by this Application —
   * walking down the stack skips any entry whose root died (destroyed or
   * detached) since it was pushed, rather than either trusting a stale root
   * or letting it permanently block the real scene graph once the live entry
   * beneath it (or none at all) should take over. Entries are not eagerly
   * removed from the stack here: a root only temporarily detached (e.g.
   * mid-reparent within the same Application) is revalidated fresh on the
   * next call rather than being discarded.
   */
  private _activeScopeRoot(): RenderNode | null {
    for (let i = this._scopeStack.length - 1; i >= 0; i--) {
      const root = this._scopeStack[i]!.root;

      if (this._isOwned(root)) {
        return root;
      }
    }

    return null;
  }

  /**
   * Release the scope identified by `token`, wherever it sits in the stack —
   * a targeted removal, never a rebuild of the entries around it. Only
   * popping the topmost (currently active) scope affects focus: whatever was
   * focused when that scope was pushed is restored, provided it is still
   * focusable and — if another scope is now active underneath — still inside
   * that scope; otherwise focus is cleared rather than left somewhere the
   * newly-active scope does not own. Releasing a scope buried under others
   * (see {@link InteractionScope.release}'s any-order contract) changes
   * nothing about current focus, since the actually-active scope above it is
   * untouched.
   */
  public popScope(token: ScopeToken): void {
    const index = this._scopeStack.findIndex(entry => entry.token === token);

    if (index === -1) {
      return;
    }

    const wasActive = index === this._scopeStack.length - 1;
    const [entry] = this._scopeStack.splice(index, 1);

    if (wasActive && entry) {
      this._restoreFocusAfterPop(entry.previousFocus);
    }
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

    const focused = this._liveFocused();
    let defaultPrevented = false;

    if (focused !== null) {
      const event = new KeyEvent('keydown', channel, focused);

      this._dispatchKeyBubble(event, 'keydown');
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

    const focused = this._liveFocused();

    if (focused !== null) {
      this._dispatchKeyBubble(new KeyEvent('keyup', channel, focused), 'keyup');
    }
  }

  /**
   * The currently focused node, or `null` — blurring first (silently, since
   * {@link blur} itself skips the event for an already-destroyed node) if
   * the focused node died since it was last checked, so a stale target never
   * receives a key event. See {@link blur}'s doc comment for why this can be
   * the first place that notices a bare `destroy()`.
   */
  private _liveFocused(): RenderNode | null {
    const focused = this._focused;

    if (focused === null) {
      return null;
    }

    if (!this._isOwned(focused)) {
      this.blur();

      return null;
    }

    return focused;
  }

  /**
   * Bubble `event` from its target up through every ancestor, same shape as
   * {@link InteractionManager}'s pointer-event bubble: `focusable` gates
   * which nodes can be the *target*, not which ones may observe an event
   * bubbling past them, so a plain container above the focused node still
   * receives it. Stops early on {@link KeyEvent.stopPropagation}.
   */
  private _dispatchKeyBubble(event: KeyEvent, type: 'keydown' | 'keyup'): void {
    let current: RenderNode | null = event.target;

    while (current !== null) {
      event.currentTarget = current;
      current._peekKeySignal(type)?.dispatch(event);

      if (event.propagationStopped) {
        break;
      }

      current = current.parent;
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
    let nextIndex: number;
    if (currentIndex === -1) {
      nextIndex = direction === 1 ? 0 : count - 1;
    } else {
      nextIndex = (currentIndex + direction + count) % count;
    }

    const next = focusables[nextIndex];
    if (next !== undefined) {
      this.focus(next);
    }
  }

  /** Whether `node` is `scopeRoot` itself or lives somewhere in its subtree. */
  private _isInsideScope(node: RenderNode, scopeRoot: RenderNode): boolean {
    let current: RenderNode | null = node;

    while (current !== null) {
      if (current === scopeRoot) {
        return true;
      }

      current = current.parent;
    }

    return false;
  }

  /**
   * Restore whatever was focused before the just-popped scope activated —
   * provided it is still focusable and, if another scope is now active
   * underneath, still inside that one. Blurs otherwise: guessing at a
   * different node to focus instead would be surprising, and leaving focus
   * on a node the newly-active scope doesn't own would break its trap.
   */
  private _restoreFocusAfterPop(previousFocus: RenderNode | null): void {
    const activeScope = this._activeScopeRoot();
    const canRestore =
      previousFocus !== null &&
      this._isOwned(previousFocus) &&
      previousFocus.focusable &&
      (activeScope === null || this._isInsideScope(previousFocus, activeScope));

    if (canRestore && previousFocus !== null) {
      this.focus(previousFocus);
    } else {
      this.blur();
    }
  }

  /**
   * Collect the focusable nodes of the active scope (the topmost pushed scope,
   * else the active scene root) in Tab order: ascending `tabIndex`, ties broken
   * by document (tree) order.
   */
  private _collectFocusables(): RenderNode[] {
    const root: RenderNode | null = this._activeScopeRoot() ?? this._app.scenes.currentScene?.root ?? null;

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
