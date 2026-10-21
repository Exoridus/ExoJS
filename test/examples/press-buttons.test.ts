// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';

import { trackPressButtons } from '../../examples/shared/runtime';

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
    document.body.replaceChildren();
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
