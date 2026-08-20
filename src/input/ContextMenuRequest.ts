import type { Pointer } from './Pointer';

/**
 * A request to show a context menu, in design-space coordinates. Right-click,
 * the keyboard context-menu key, and Shift+F10 all funnel into the same
 * native `contextmenu` event - the latter two can fire with no pointer ever
 * having touched the surface, so the request carries its own `x`/`y` rather
 * than forcing the contract onto a {@link Pointer}. `pointer` is best-effort
 * attribution (the primary tracked pointer, if any, at the moment of the
 * request) for consumers that want it; it is `null` when no pointer exists to
 * attribute the request to, which no longer prevents the request itself from
 * firing.
 */
export interface ContextMenuRequest {
  readonly x: number;
  readonly y: number;
  readonly pointer: Pointer | null;
}
