/**
 * The adapter for a surface with no document around it: what it reports on its
 * own, what the host has to feed it, and that nothing survives its teardown.
 */

import { OffscreenPlatform } from '#platform/OffscreenPlatform';
import type { PlatformEventData, PlatformPointerEvent, RenderSurface } from '#platform/index';

/** A stand-in for a sized render surface - jsdom has no `OffscreenCanvas`. */
const createSurface = (width = 800, height = 600): RenderSurface => ({ width, height }) as RenderSurface;

const createPointerEvent = (pointerId: number): PlatformEventData<PlatformPointerEvent> => ({
  pointerId,
  pointerType: 'mouse',
  clientX: 0,
  clientY: 0,
  width: 1,
  height: 1,
  tiltX: 0,
  tiltY: 0,
  twist: 0,
  pressure: 0.5,
  buttons: 1,
  isPrimary: true,
});

describe('OffscreenPlatform', () => {
  it('reports the surface backing size and a rect the host supplies', () => {
    const platform = new OffscreenPlatform(createSurface(1024, 512));

    expect(platform.getSurfaceMetrics()).toEqual({ left: 0, top: 0, width: 1024, height: 512, backingWidth: 1024, backingHeight: 512 });

    platform.setSurfaceRect({ left: 40, top: 12, width: 512, height: 256 });

    expect(platform.getSurfaceMetrics()).toEqual({ left: 40, top: 12, width: 512, height: 256, backingWidth: 1024, backingHeight: 512 });

    platform.destroy();
  });

  it('reports a visible, unfocused surface with no input until a host says otherwise', () => {
    const platform = new OffscreenPlatform(createSurface());

    expect(platform.documentVisible).toBe(true);
    expect(platform.surfaceFocused).toBe(false);
    expect(platform.pollGamepads()).toEqual([]);

    platform.setSurfaceFocused(true);

    expect(platform.surfaceFocused).toBe(true);

    platform.destroy();
  });

  it('delivers forwarded surface and window events to their subscribers', () => {
    const platform = new OffscreenPlatform(createSurface());
    const pointers: number[] = [];
    const keys: string[] = [];

    platform.onSurfaceEvent('pointerdown', event => void pointers.push(event.pointerId));
    platform.onWindowEvent('keydown', event => void keys.push(event.code));

    platform.emitSurfaceEvent('pointerdown', createPointerEvent(7));
    platform.emitWindowEvent('keydown', { code: 'KeyW', repeat: false });

    expect(pointers).toEqual([7]);
    expect(keys).toEqual(['KeyW']);

    platform.destroy();
  });

  it('reports back whether the engine asked for the host default to be suppressed', () => {
    const platform = new OffscreenPlatform(createSurface());

    platform.onSurfaceEvent('pointerdown', event => event.preventDefault());
    platform.onSurfaceEvent('pointermove', () => undefined);

    expect(platform.emitSurfaceEvent('pointerdown', createPointerEvent(1))).toBe(true);
    expect(platform.emitSurfaceEvent('pointermove', createPointerEvent(1))).toBe(false);
    expect(platform.emitSurfaceEvent('pointerup', createPointerEvent(1))).toBe(false);

    platform.destroy();
  });

  it('stops delivery once a subscription is released, and releasing twice is a no-op', () => {
    const platform = new OffscreenPlatform(createSurface());
    const pointers: number[] = [];
    const unsubscribe = platform.onSurfaceEvent('pointerdown', event => void pointers.push(event.pointerId));

    platform.emitSurfaceEvent('pointerdown', createPointerEvent(1));
    unsubscribe();
    unsubscribe();
    platform.emitSurfaceEvent('pointerdown', createPointerEvent(2));

    expect(pointers).toEqual([1]);

    platform.destroy();
  });

  it('delivers to a listener that unsubscribes another mid-dispatch', () => {
    const platform = new OffscreenPlatform(createSurface());
    const seen: string[] = [];

    const second = platform.onSurfaceEvent('pointerdown', () => void seen.push('second'));

    platform.onSurfaceEvent('pointerdown', () => {
      seen.push('first');
      second();
    });

    platform.emitSurfaceEvent('pointerdown', createPointerEvent(1));

    expect(seen).toEqual(['second', 'first']);

    platform.destroy();
  });

  it('notifies visibility subscribers only on an actual change', () => {
    const platform = new OffscreenPlatform(createSurface());
    const changes: boolean[] = [];

    platform.onVisibilityChange(visible => void changes.push(visible));

    platform.setVisible(true);
    platform.setVisible(false);
    platform.setVisible(false);
    platform.setVisible(true);

    expect(changes).toEqual([false, true]);

    platform.destroy();
  });

  it('delivers nothing after destroy, however late the host is', () => {
    const platform = new OffscreenPlatform(createSurface());
    const seen: string[] = [];

    platform.onSurfaceEvent('pointerdown', () => void seen.push('pointer'));
    platform.onWindowEvent('keydown', () => void seen.push('key'));
    platform.onVisibilityChange(() => void seen.push('visibility'));

    platform.destroy();

    platform.emitSurfaceEvent('pointerdown', createPointerEvent(1));
    platform.emitWindowEvent('keydown', { code: 'KeyW', repeat: false });
    platform.setVisible(false);

    expect(seen).toEqual([]);
  });

  it('leaves the document affordances inert rather than throwing', () => {
    const platform = new OffscreenPlatform(createSurface());

    expect(() => {
      platform.focusSurface();
      platform.setCursor();
      platform.setTouchAction();
      platform.capturePointer();
      platform.releasePointer();
    }).not.toThrow();

    expect(platform.surfaceFocused).toBe(false);

    platform.destroy();
  });

  it('schedules frames through the realm scheduler when it has one', () => {
    const request = vi.spyOn(globalThis, 'requestAnimationFrame');
    const cancel = vi.spyOn(globalThis, 'cancelAnimationFrame');
    // The adapter binds the realm's schedulers at construction, so it has to be
    // built after the spies are in place to route through them.
    const platform = new OffscreenPlatform(createSurface());
    const handle = platform.requestFrame(() => undefined);

    platform.cancelFrame(handle);

    expect(request).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledWith(handle);

    request.mockRestore();
    cancel.mockRestore();
    platform.destroy();
  });

  describe('in a realm that schedules no display frames', () => {
    let realRequest: typeof requestAnimationFrame;
    let realCancel: typeof cancelAnimationFrame;

    beforeEach(() => {
      realRequest = globalThis.requestAnimationFrame;
      realCancel = globalThis.cancelAnimationFrame;

      // The adapter reads the schedulers once, at construction, so they have to
      // be gone before the instance under test exists.
      (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame = undefined;
      (globalThis as { cancelAnimationFrame?: unknown }).cancelAnimationFrame = undefined;
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
      globalThis.requestAnimationFrame = realRequest;
      globalThis.cancelAnimationFrame = realCancel;
    });

    it('falls back to a timer and reports a timestamp on its own clock', () => {
      const platform = new OffscreenPlatform(createSurface());
      const timestamps: number[] = [];

      platform.requestFrame(timestamp => void timestamps.push(timestamp));
      vi.advanceTimersByTime(20);

      expect(timestamps).toHaveLength(1);
      expect(timestamps[0]).toBeGreaterThanOrEqual(0);

      platform.destroy();
    });

    it('honours a cancelled frame', () => {
      const platform = new OffscreenPlatform(createSurface());
      const frames: number[] = [];
      const handle = platform.requestFrame(timestamp => void frames.push(timestamp));

      platform.cancelFrame(handle);
      vi.advanceTimersByTime(50);

      expect(frames).toEqual([]);

      platform.destroy();
    });

    it('drops a pending frame on destroy', () => {
      const platform = new OffscreenPlatform(createSurface());
      const frames: number[] = [];

      platform.requestFrame(timestamp => void frames.push(timestamp));
      platform.destroy();
      vi.advanceTimersByTime(50);

      expect(frames).toEqual([]);
    });
  });
});
