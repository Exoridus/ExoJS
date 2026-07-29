import type { RenderNode } from '#rendering/RenderNode';

import type { Pointer } from './Pointer';

/**
 * String literal union of every interaction event the
 * {@link InteractionManager} can deliver to a {@link RenderNode}.
 * Handlers attach via the node's `interactive*` API.
 */
export type InteractionEventType =
  | 'pointerdown'
  | 'pointerup'
  | 'pointermove'
  | 'pointerover'
  | 'pointerout'
  | 'pointertap'
  | 'contextmenu'
  | 'dragstart'
  | 'drag'
  | 'dragend';

/**
 * DOM-Event-shaped envelope dispatched by {@link InteractionManager} to
 * interactive scene nodes. Bubbles up the *entire* parent chain — `target`
 * stays pinned to the hit-deepest node while `currentTarget` advances to each
 * ancestor, whether or not that ancestor is itself interactive. Handlers may
 * call {@link InteractionEvent.stopPropagation} to halt the bubble.
 *
 * The envelope deliberately exposes no native `PointerEvent`: engine events
 * are frame-synchronous and outlive the platform event they came from. It
 * does have {@link InteractionEvent.preventDefault}, but only for suppressing
 * this event's own engine-level default (currently: the automatic
 * drag-candidate creation a `pointerdown` would otherwise start — see that
 * method's own doc comment). It never suppresses a *browser*-native default
 * (touch scrolling, text selection, the native context menu, ...); those are
 * handled separately and synchronously at the `InputManager` platform-event
 * boundary, before this engine-level event is even constructed.
 */
export class InteractionEvent {
  public readonly type: InteractionEventType;
  /** The node that was originally hit (deepest interactive). Stable across bubble. */
  public readonly target: RenderNode;
  /** The node currently dispatching this event during bubbling. Changes per bubble step. */
  public currentTarget: RenderNode;
  public readonly pointer: Pointer;
  /**
   * Coordinates in `target`'s own rendering layer — **not** a single fixed
   * space. A hit inside the scene's UI layer reads in screen space (the same
   * space `RenderingContext.screenView` maps into); a hit against the world
   * tree reads in camera/world space (post pan/zoom/rotate — identical to
   * screen space only at the default centered camera). This matches the
   * space `target.position`/`target.contains()` already operate in for
   * whichever layer `target` lives in, so the two always agree; it is
   * deliberately not `Pointer.x`/`Pointer.y`, which is raw design-pixel space
   * and does not track a panned or zoomed camera at all.
   */
  public readonly x: number;
  /** See {@link InteractionEvent.x}. */
  public readonly y: number;
  private _stopped = false;
  private _defaultPrevented = false;

  public constructor(type: InteractionEventType, target: RenderNode, pointer: Pointer, x: number, y: number) {
    this.type = type;
    this.target = target;
    this.currentTarget = target;
    this.pointer = pointer;
    this.x = x;
    this.y = y;
  }

  public get propagationStopped(): boolean {
    return this._stopped;
  }

  /** Halt further bubbling up the parent chain for this event. */
  public stopPropagation(): void {
    this._stopped = true;
  }

  /** Whether {@link InteractionEvent.preventDefault} was called on this event. */
  public get defaultPrevented(): boolean {
    return this._defaultPrevented;
  }

  /**
   * Suppress this event's own default engine behavior — currently
   * meaningful only for `pointerdown`, where it suppresses the automatic
   * creation (and so promotion) of a drag candidate for {@link target}, on
   * a node whose own `draggable` would otherwise start one. Independent of
   * {@link InteractionEvent.stopPropagation}: propagation still bubbles
   * normally unless that is also called. Also independent of the browser's
   * own native default (e.g. touch scrolling, text selection, the native
   * context menu) — those are suppressed synchronously in `InputManager`,
   * at the platform-event boundary, before this engine-level event is even
   * constructed; calling this method has no effect on them.
   */
  public preventDefault(): void {
    this._defaultPrevented = true;
  }
}
