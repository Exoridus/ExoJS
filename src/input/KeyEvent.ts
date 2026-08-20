import type { RenderNode } from '#rendering/RenderNode';

/** Keyboard phase delivered to a focused node. */
export type KeyEventType = 'keydown' | 'keyup';

/**
 * Envelope dispatched by `app.interaction` to the focused {@link RenderNode}
 * for keyboard input, then bubbled up its entire parent chain - same
 * DOM-style shape as {@link InteractionEvent}: `target` stays pinned to the
 * focused node while `currentTarget` advances to each ancestor, whether or
 * not that ancestor is itself focusable. A handler may call
 * {@link KeyEvent.stopPropagation} to halt the bubble early, e.g. a panel
 * listening for `Escape` from any of its focused descendants without each
 * one needing its own handler.
 *
 * `channel` is the input channel of the key - compare it with the `Keyboard`
 * constants (e.g. `event.channel === Keyboard.Enter`).
 *
 * A handler may call {@link KeyEvent.preventDefault} to suppress ExoJS's own
 * built-in handling for this key (currently `Tab` focus traversal), letting
 * the focused widget consume the key itself. It affects engine behaviour only
 * - the browser's own default was already decided synchronously when the
 * platform event arrived, long before this envelope was dispatched.
 */
export class KeyEvent {
  public readonly type: KeyEventType;
  /** Input channel of the key - compare with the `Keyboard.*` channel constants. */
  public readonly channel: number;
  /** The node that held focus when this event fired. Stable across the bubble. */
  public readonly target: RenderNode;
  /** The node currently dispatching this event during bubbling. Changes per bubble step. */
  public currentTarget: RenderNode;
  private _defaultPrevented = false;
  private _stopped = false;

  public constructor(type: KeyEventType, channel: number, target: RenderNode) {
    this.type = type;
    this.channel = channel;
    this.target = target;
    this.currentTarget = target;
  }

  public get defaultPrevented(): boolean {
    return this._defaultPrevented;
  }

  /** Suppress ExoJS's built-in handling (e.g. Tab traversal) for this key. Never affects the browser. */
  public preventDefault(): void {
    this._defaultPrevented = true;
  }

  public get propagationStopped(): boolean {
    return this._stopped;
  }

  /** Halt further bubbling up the parent chain for this event. */
  public stopPropagation(): void {
    this._stopped = true;
  }
}
