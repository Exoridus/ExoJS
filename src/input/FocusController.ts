import type { Application } from '#core/Application';
import type { FocusHooks, Stage } from '#core/Stage';
import { Container } from '#rendering/Container';
import type { RenderNode } from '#rendering/RenderNode';
import { Widget } from '#ui/Widget';

import { KeyEvent } from './KeyEvent';
import type { ScopeToken } from './ScopeToken';
import { Keyboard } from './types';

/** One entry of the focus-scope stack - see {@link FocusController.pushScope}. */
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
 * Not public API - RenderNode focus is reached through `app.interaction`
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
  // dialog pushes one. Keyed by stable token, not by root - see ScopeToken's
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
   * not {@link _isFocusEligible eligible for focus}, does not belong to this
   * {@link Application} (a different Application's node, one never attached
   * to any stage, or one already removed - see {@link _isOwned}'s doc
   * comment), or - while a scope is active - sits outside that scope's
   * subtree: an active scope is a real focus trap, not only a Tab-order
   * boundary, so programmatic focus cannot escape it either. Fires `onBlur`
   * on the previously focused node, then `onFocus` on `node`.
   */
  public focus(node: RenderNode): void {
    if (node === this._focused || !this._isFocusEligible(node) || !this._isOwned(node)) {
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
   * `onBlur` - unless the previously focused node is already destroyed, in
   * which case no event is dispatched on it. `destroy()` unlinks the node and
   * so routes through {@link _notifyNodeRemoved} here, but it raises the
   * destroyed flag first precisely so a teardown drops focus without calling
   * back into user code on a node that is going away.
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
   * Bound subsequent Tab traversal - and, from this point on, every
   * programmatic {@link focus} call - to `root`'s subtree. Pushed by
   * {@link InteractionManager.pushScope} so focus navigation and pointer
   * hit-testing are confined to the same subtree - a modal that shields
   * clicks must shield Tab (and focus) too.
   *
   * Whatever holds focus at this instant is blurred immediately if it sits
   * outside `root` - a scope is a trap from the moment it activates, not
   * only once something inside it is explicitly focused. That prior focus is
   * remembered either way and restored by the matching {@link popScope}.
   *
   * The immediate blur only happens when `root` is already live (see
   * {@link _isOwned}): pushing a scope for a root that isn't attached yet
   * (e.g. a dialog subtree prepared before being added to the scene) must
   * not blur current focus right now - there is nothing live to trap
   * anything with yet. Once `root` does attach, it becomes the topmost live
   * entry on this stack (it was just pushed last) and
   * `InteractionManager._notifyNodeAdded` calls {@link _enforceActiveScopeTrap}
   * for exactly this reason, engaging the trap at that point instead.
   */
  public pushScope(token: ScopeToken, root: RenderNode): void {
    const previousFocus = this._focused;

    this._scopeStack.push({ token, root, previousFocus });

    if (previousFocus !== null && this._isOwned(root) && !this._isInsideScope(previousFocus, root)) {
      this.blur();
    }
  }

  /**
   * Whether `node` may hold keyboard focus at all: {@link RenderNode.focusable}
   * must be set, and a {@link Widget} must additionally be
   * {@link Widget.effectiveEnabled}. A widget that is effectively disabled -
   * its own flag, or that of a disabled ancestor widget - stops responding to
   * input the moment it becomes so, so leaving it in the Tab order would
   * strand focus on something that swallows every key it receives.
   */
  private _isFocusEligible(node: RenderNode): boolean {
    return node.focusable && (!(node instanceof Widget) || node.effectiveEnabled);
  }

  /**
   * Whether `node` belongs to this controller's {@link Application}: not
   * destroyed, and currently attached to a stage - one installed by THIS
   * Application, or (per {@link Stage.app}'s own doc comment) a lightweight
   * stub stage that does not declare an owner at all, which every production
   * stage does. Rejects a different Application's node, one never attached
   * to any stage, and one already removed alike. `destroyed` alone is not
   * enough: `removeChild()` detaches a node from its stage without
   * destroying it, and a node merely reparented elsewhere within the SAME
   * Application (a temporary state, not a removal) still passes here, which
   * is the point - ownership is what matters at the point of use, not
   * whether the node briefly changed parents.
   */
  private _isOwned(node: RenderNode): boolean {
    const stage = node._getStage();

    return !node.destroyed && stage !== null && (stage.app === undefined || stage.app === this._app);
  }

  /**
   * The nearest active scope root that is still owned by this Application -
   * walking down the stack skips any entry whose root died (destroyed or
   * detached) since it was pushed, rather than either trusting a stale root
   * or letting it permanently block the real scene graph once the live entry
   * beneath it (or none at all) should take over. Entries are not eagerly
   * removed from the stack here: a root only temporarily detached (e.g.
   * mid-reparent within the same Application) is revalidated fresh on the
   * next call rather than being discarded.
   */
  private _activeScopeRoot(): RenderNode | null {
    const index = this._topmostLiveScopeIndex();

    return index === -1 ? null : this._scopeStack[index]!.root;
  }

  /**
   * Release the scope identified by `token`, wherever it sits in the stack -
   * a targeted removal, never a rebuild of the entries around it. Only
   * popping the EFFECTIVELY active scope affects focus - the topmost entry
   * whose root is still live, not necessarily the last physical array
   * entry: an entry above it that already died (its root destroyed or
   * detached) was never really the one focus was trapped by, so popping
   * something BELOW a dead entry must still be recognized as ending the
   * true active scope, and popping a dead entry itself must not restore
   * focus as though it had been active. Whatever was focused when the
   * popped scope was pushed is restored, provided it is still focusable
   * and - if another scope is now active underneath - still inside that
   * scope; otherwise focus is cleared rather than left somewhere the
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

    const wasEffectivelyActive = index === this._topmostLiveScopeIndex();
    const [entry] = this._scopeStack.splice(index, 1);

    if (wasEffectivelyActive && entry) {
      this._restoreFocusAfterPop(entry.previousFocus);
    }
  }

  /** Index of the topmost entry whose root is still live, or `-1` if none is. See {@link _activeScopeRoot}. */
  private _topmostLiveScopeIndex(): number {
    for (let i = this._scopeStack.length - 1; i >= 0; i--) {
      if (this._isOwned(this._scopeStack[i]!.root)) {
        return i;
      }
    }

    return -1;
  }

  /** Move focus to the next focusable node in the active scope (Tab order). */
  public focusNext(): void {
    this._step(1);
  }

  /** Move focus to the previous focusable node in the active scope (Shift+Tab order). */
  public focusPrevious(): void {
    this._step(-1);
  }

  /**
   * Re-enforce the active scope's focus trap right now, rather than waiting
   * for the next explicit {@link focus} call to notice - called by
   * {@link InteractionManager._notifyNodeAdded} whenever a subtree attaches
   * to the scene, since a scope root that was temporarily detached (and so
   * not actively trapping anything - see {@link _activeScopeRoot}'s doc
   * comment) may have just become live again. Blurs the currently focused
   * node if it now sits outside the (possibly newly reactivated) active
   * scope.
   *
   * @internal
   */
  public _enforceActiveScopeTrap(): void {
    const activeScope = this._activeScopeRoot();

    if (activeScope === null) {
      return;
    }

    const focused = this._focused;

    if (focused !== null && !this._isInsideScope(focused, activeScope)) {
      this.blur();
    }
  }

  /** @internal - clear focus when a focused node (or an ancestor of it) leaves the tree. */
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
    if (channel === Keyboard.ShiftLeft || channel === Keyboard.ShiftRight) {
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
    if (channel === Keyboard.ShiftLeft || channel === Keyboard.ShiftRight) {
      this._shiftDown = false;
    }

    const focused = this._liveFocused();

    if (focused !== null) {
      this._dispatchKeyBubble(new KeyEvent('keyup', channel, focused), 'keyup');
    }
  }

  /**
   * The currently focused node, or `null` - blurring first (silently, since
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

  /**
   * Advance focus by `direction` (+1 next, -1 previous), wrapping around the
   * scope. {@link focus} is a silent no-op when its target turns out to be
   * invalid (not focusable, not owned, or outside an active scope - see its
   * own doc comment), so a single candidate is not enough: this walks
   * forward through the candidate list, trying each in turn, and stops at
   * the first one `focus()` actually applies. Bounded by `count` attempts so
   * a list where every candidate is invalid cannot loop forever.
   */
  private _step(direction: 1 | -1): void {
    const focusables = this._collectFocusables();
    const count = focusables.length;

    if (count === 0) {
      return;
    }

    const currentIndex = this._focused === null ? -1 : focusables.indexOf(this._focused);
    // With nothing focused yet, entering forwards starts at the first candidate
    // and entering backwards at the last.
    const entryIndex = direction === 1 ? 0 : count - 1;
    let nextIndex = currentIndex === -1 ? entryIndex : currentIndex;

    for (let attempt = 0; attempt < count; attempt++) {
      if (currentIndex !== -1 || attempt > 0) {
        nextIndex = (nextIndex + direction + count) % count;
      }

      const candidate = focusables[nextIndex];

      if (candidate !== undefined) {
        this.focus(candidate);

        if (this._focused === candidate) {
          return;
        }
      }
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
   * Restore whatever was focused before the just-popped scope activated -
   * provided it is still {@link _isFocusEligible eligible} and, if another
   * scope is now active underneath, still inside that one. Blurs otherwise: guessing at a
   * different node to focus instead would be surprising, and leaving focus
   * on a node the newly-active scope doesn't own would break its trap.
   */
  private _restoreFocusAfterPop(previousFocus: RenderNode | null): void {
    const activeScope = this._activeScopeRoot();
    const canRestore =
      previousFocus !== null &&
      this._isOwned(previousFocus) &&
      this._isFocusEligible(previousFocus) &&
      (activeScope === null || this._isInsideScope(previousFocus, activeScope));

    if (canRestore && previousFocus !== null) {
      this.focus(previousFocus);
    } else {
      this.blur();
    }
  }

  /**
   * Collect the focusable nodes of the active scope in Tab order: ascending
   * `tabIndex`, ties broken by document (tree) order. A scope confines
   * traversal to its own single subtree, whichever layer it lives in - a
   * modal has no business reaching into the other layer. Without an active
   * scope, traversal spans BOTH of the scene's layers - `scene.ui` AND
   * `scene.root` - since a screen-fixed UI button and a world node are both
   * legitimately Tab-reachable at the same time; `tabIndex` orders across
   * them exactly as it does within either alone, and a tie between a UI
   * node and a world node favors the UI one (it paints on top and is the
   * more likely intended stop).
   */
  private _collectFocusables(): RenderNode[] {
    const scope = this._activeScopeRoot();

    if (scope !== null) {
      const collected: RenderNode[] = [];

      this._collectInto(scope, collected);

      return this._sortFocusables(collected.map(node => ({ node, isUi: false })));
    }

    const scene = this._app.scenes.currentScene;

    if (scene === null) {
      return [];
    }

    const entries: Array<{ node: RenderNode; isUi: boolean }> = [];
    const uiRoot = scene._peekUI();

    if (uiRoot !== null) {
      const uiNodes: RenderNode[] = [];

      this._collectInto(uiRoot, uiNodes);

      for (const node of uiNodes) {
        entries.push({ node, isUi: true });
      }
    }

    const worldNodes: RenderNode[] = [];

    this._collectInto(scene.root, worldNodes);

    for (const node of worldNodes) {
      entries.push({ node, isUi: false });
    }

    return this._sortFocusables(entries);
  }

  /** Sort by ascending `tabIndex`; ties favor a UI-layer entry over a world one, then fall back to collection (document) order. */
  private _sortFocusables(entries: ReadonlyArray<{ readonly node: RenderNode; readonly isUi: boolean }>): RenderNode[] {
    return entries
      .map((entry, index) => ({ ...entry, index }))
      .sort((a, b) => a.node.tabIndex - b.node.tabIndex || Number(b.isUi) - Number(a.isUi) || a.index - b.index)
      .map(entry => entry.node);
  }

  /**
   * Recursively collect focus-eligible, owned descendants of `node`
   * (inclusive) into `out`. {@link _isFocusEligible} and {@link _isOwned} gate
   * collection the same way they gate {@link focus} itself - a disabled
   * widget, a node killed via a bare `destroy()` (no prior `removeChild()`, so
   * it is still structurally reachable by this walk) or one belonging to a
   * different Application must not be Tab-reachable just because the tree walk
   * still finds it.
   *
   * An effectively-disabled widget is skipped as a Tab STOP but its subtree
   * is still walked - {@link Widget.effectiveEnabled} already accounts for
   * every ancestor, so a descendant nested inside a disabled container
   * correctly stops being reachable too, and re-enabling the container makes
   * it reachable again without this walk needing to change.
   */
  private _collectInto(node: RenderNode, out: RenderNode[]): void {
    if (!node.visible) {
      return;
    }

    if (this._isFocusEligible(node) && this._isOwned(node)) {
      out.push(node);
    }

    if (node instanceof Container) {
      for (const child of node.children) {
        this._collectInto(child, out);
      }
    }
  }
}
