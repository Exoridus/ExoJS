/**
 * Slider drag through the application's pointer signals - including the
 * multi-touch case, where a second contact must leave an in-flight drag alone.
 */

import type { Application } from '#core/Application';
import { Signal } from '#core/Signal';
import type { Stage } from '#core/Stage';
import type { InteractionEvent } from '#input/InteractionEvent';
import type { Pointer } from '#input/Pointer';
import { Slider } from '#ui/Slider';

interface PointerSignals {
  onPointerMove: Signal<[pointer: Pointer, x: number, y: number]>;
  onPointerUp: Signal<[pointer: Pointer, x: number, y: number]>;
  onPointerCancel: Signal<[pointer: Pointer, x: number, y: number]>;
}

/** A minimal Stage whose `app.input` carries the signals a drag subscribes to. */
const makeStage = (): { stage: Stage } & PointerSignals => {
  const signals: PointerSignals = {
    onPointerMove: new Signal(),
    onPointerUp: new Signal(),
    onPointerCancel: new Signal(),
  };
  const app = { input: { ...signals } } as unknown as Application;
  const interaction: Stage['interaction'] = {
    _notifyNodeAdded: vi.fn(),
    _notifyNodeRemoved: vi.fn(),
    _notifyInteractiveChanged: vi.fn(),
    _notifyBoundsInvalidated: vi.fn(),
    _notifyTransformGroupMoved: vi.fn(),
  };
  const focus: Stage['focus'] = {
    focused: null,
    focus: vi.fn(),
    blur: vi.fn(),
    _notifyNodeRemoved: vi.fn(),
  };

  return { stage: { interaction, focus, app }, ...signals };
};

const pointerDownAt = (x: number, y: number, id = 1): InteractionEvent => ({ x, y, pointer: { id } }) as unknown as InteractionEvent;

const contact = (id: number): Pointer => ({ id }) as Pointer;

describe('Slider drag', () => {
  test('a press seeks to the pointer and the drag follows it', () => {
    const { stage, onPointerMove, onPointerUp } = makeStage();
    const slider = new Slider({ width: 200, height: 20, min: 0, max: 1, value: 0 });

    slider._setStage(stage);
    slider.onPointerDown.dispatch(pointerDownAt(100, 10));

    expect(slider.dragging).toBe(true);
    expect(slider.fraction).toBeCloseTo(0.5);

    onPointerMove.dispatch(contact(1), 200, 10);

    expect(slider.fraction).toBe(1);

    onPointerUp.dispatch(contact(1), 200, 10);

    expect(slider.dragging).toBe(false);
  });

  test('a second contact neither moves the slider nor ends the drag', () => {
    const { stage, onPointerMove, onPointerUp } = makeStage();
    const slider = new Slider({ width: 200, height: 20, min: 0, max: 1, value: 0 });

    slider._setStage(stage);
    slider.onPointerDown.dispatch(pointerDownAt(100, 10));

    const held = slider.fraction;

    onPointerMove.dispatch(contact(2), 200, 10);

    expect(slider.fraction).toBe(held);

    onPointerUp.dispatch(contact(2), 200, 10);

    expect(slider.dragging).toBe(true);
  });
});

describe('Slider destroy', () => {
  test('disposes onChange and clears an in-flight drag', () => {
    const { stage } = makeStage();
    const slider = new Slider({ width: 200, height: 20, min: 0, max: 1, value: 0 });

    slider._setStage(stage);
    slider.onPointerDown.dispatch(pointerDownAt(100, 10));

    expect(slider.dragging).toBe(true);

    slider.destroy();

    expect(slider.destroyed).toBe(true);
    expect(slider.dragging).toBe(false);
    expect(slider.onChange.count).toBe(0);

    slider.onChange.add(() => {});
    expect(slider.onChange.count).toBe(0);

    expect(() => slider.destroy()).not.toThrow();
  });
});
