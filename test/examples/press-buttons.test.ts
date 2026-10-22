// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { trackPressButtons } from '../../examples/shared/runtime.ts';

const press = (target: EventTarget, pointerId: number, button: number): void => {
  target.dispatchEvent(Object.assign(new Event('pointerdown', { bubbles: true }), { pointerId, button }));
};

const mountCanvas = (): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');

  document.body.append(canvas);

  return canvas;
};

describe('trackPressButtons', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  it('releases consumed pointer queues instead of retaining every pointer ID', () => {
    const canvas = mountCanvas();
    const tracker = trackPressButtons(canvas);
    const writes = vi.spyOn(Map.prototype, 'set');

    press(canvas, 41, 2);
    const recorded = writes.mock.calls.findIndex(([key, value]) => key === 41 && Array.isArray(value) && value[0] === 2);
    expect(recorded).toBeGreaterThanOrEqual(0);
    const queues = writes.mock.contexts[recorded]!;
    writes.mockRestore();

    try {
      expect(tracker.take(41)).toBe(2);
      expect(queues.size).toBe(0);

      for (let id = 42; id < 142; id++) {
        press(canvas, id, 2);
        expect(tracker.take(id)).toBe(2);
      }

      expect(queues.size).toBe(0);
    } finally {
      tracker.dispose();
    }
  });

  it.each(['pointerup', 'pointercancel'])('preserves deferred presses across %s and pointer ID reuse', type => {
    const canvas = mountCanvas();
    const tracker = trackPressButtons(canvas);

    try {
      press(canvas, 7, 2);
      canvas.dispatchEvent(Object.assign(new Event(type, { bubbles: true }), { pointerId: 7, button: 2 }));
      press(canvas, 7, 1);

      expect(tracker.take(7)).toBe(2);
      expect(tracker.take(7)).toBe(1);
      expect(tracker.take(7)).toBe(0);
      press(canvas, 7, 2);
      expect(tracker.take(7)).toBe(2);
    } finally {
      tracker.dispose();
    }
  });

  it('hands each press its own button in press order, per pointer', () => {
    const canvas = mountCanvas();
    const tracker = trackPressButtons(canvas);

    press(canvas, 1, 2);
    press(canvas, 1, 0);
    press(canvas, 7, 1);

    expect(tracker.take(1)).toBe(2);
    expect(tracker.take(1)).toBe(0);
    expect(tracker.take(7)).toBe(1);
  });

  it('still sees presses a canvas listener consumes before any later listener', () => {
    const canvas = mountCanvas();
    const tracker = trackPressButtons(canvas);

    canvas.addEventListener('pointerdown', event => event.stopImmediatePropagation(), { capture: true });
    press(canvas, 1, 2);

    expect(tracker.take(1)).toBe(2);
  });

  it('ignores presses elsewhere in the document', () => {
    const canvas = mountCanvas();
    const tracker = trackPressButtons(canvas);

    press(document.body, 1, 2);

    expect(tracker.take(1)).toBe(0);
  });

  it('treats a press nobody recorded as a main press', () => {
    expect(trackPressButtons(mountCanvas()).take(3)).toBe(0);
  });

  it('stops recording and drops pending presses on dispose', () => {
    const canvas = mountCanvas();
    const tracker = trackPressButtons(canvas);

    press(canvas, 1, 2);
    tracker.dispose();
    press(canvas, 1, 2);

    expect(tracker.take(1)).toBe(0);
  });
});
