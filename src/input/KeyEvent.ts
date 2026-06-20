import type { RenderNode } from '#rendering/RenderNode';

/** Keyboard phase delivered to a focused node. */
export type KeyEventType = 'keydown' | 'keyup';

/**
 * Envelope dispatched by {@link FocusManager} to the focused {@link RenderNode}
 * for keyboard input. `channel` is the input channel of the key — compare it
 * with the `Keyboard` constants (e.g. `event.channel === Keyboard.Enter`).
 *
 * A handler may call {@link KeyEvent.preventDefault} to suppress the
 * FocusManager's built-in handling for this key (currently `Tab` focus
 * traversal), letting the focused widget consume the key itself.
 */
export class KeyEvent {
  public readonly type: KeyEventType;
  /** Input channel of the key — compare with the `Keyboard.*` channel constants. */
  public readonly channel: number;
  /** The focused node this event was delivered to. */
  public readonly target: RenderNode;
  private _defaultPrevented = false;

  public constructor(type: KeyEventType, channel: number, target: RenderNode) {
    this.type = type;
    this.channel = channel;
    this.target = target;
  }

  public get defaultPrevented(): boolean {
    return this._defaultPrevented;
  }

  /** Suppress the FocusManager's built-in handling (e.g. Tab traversal) for this key. */
  public preventDefault(): void {
    this._defaultPrevented = true;
  }
}
