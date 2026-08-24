import { assert } from '#core/dev';

import type { CanvasSizingContext, CanvasSizingHostMetrics } from './CanvasSizing';

/**
 * The largest rectangle with the base aspect ratio that fits inside a host of
 * the given CSS size. Grows as well as shrinks: a host larger than the base
 * resolution in both axes yields a rectangle larger than it.
 * @internal
 */
export const fitToHost = (hostWidth: number, hostHeight: number, baseWidth: number, baseHeight: number): CanvasSizingHostMetrics => {
  const scale = Math.min(hostWidth / baseWidth, hostHeight / baseHeight);

  return { width: baseWidth * scale, height: baseHeight * scale };
};

/**
 * The host a DOM sizing policy needs, or `null` when the configuration cannot
 * provide one. Both misconfigurations are a hard error in a development build:
 * a policy that silently observes nothing would look like a rendering bug much
 * later, with nothing pointing back at the surface it was given.
 * @internal
 */
export const resolveHost = (context: CanvasSizingContext, policy: string): HTMLElement | null => {
  if (context.element === null) {
    assert(
      false,
      `${policy} sizes a canvas against its parent element, and an OffscreenCanvas has neither. Size the surface from its host and pass no sizing, or use ManualCanvasSizing.`,
    );

    return null;
  }

  if (context.host === null) {
    assert(
      false,
      `${policy} needs the canvas to be in the document, and this one has no parent element. Mount it first (canvas.mount), or append it before the Application is constructed.`,
    );

    return null;
  }

  return context.host;
};

/**
 * A host element and the `ResizeObserver` watching it, as one unit that can be
 * started and stopped.
 *
 * The observation is deliberately not shared between policies: an instance owns
 * exactly one observer, disconnects it in {@link HostTracker.stop} and reads the
 * host's layout box once per callback, so nothing survives a detach and no
 * change is measured twice.
 * @internal
 */
export class HostTracker {
  private _observer: ResizeObserver | null = null;
  private _active = false;

  /**
   * Measure `host` once and then on every change, until {@link HostTracker.stop}.
   * Sizes of zero are passed on unchanged - the commit seam rejects them, and a
   * collapsed host is a state to sit out rather than a value to invent one for.
   */
  public start(host: HTMLElement, onMeasure: (width: number, height: number) => void): void {
    this.stop();
    this._active = true;

    onMeasure(host.clientWidth, host.clientHeight);

    // Absent in a non-DOM test realm. There is nothing to fall back to - a
    // policy without an observer keeps the size it measured above.
    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    this._observer = new ResizeObserver(() => {
      // A callback already queued when the observer was disconnected can still
      // be delivered, and by then the application it would commit into may be
      // torn down.
      if (!this._active) {
        return;
      }

      // Measured here and passed on: reading the layout box again downstream is
      // a second forced reflow, and a value that could already have moved on.
      onMeasure(host.clientWidth, host.clientHeight);
    });
    this._observer.observe(host);
  }

  /** Disconnect the observer, if any. Safe to call repeatedly. */
  public stop(): void {
    this._active = false;
    this._observer?.disconnect();
    this._observer = null;
  }
}
