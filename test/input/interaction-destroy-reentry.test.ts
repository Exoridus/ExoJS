import type { Application } from '#core/Application';
import { Signal } from '#core/Signal';
import { InteractionSystem } from '#input/InteractionSystem';
import type { Pointer } from '#input/Pointer';

test('a pointer callback captured before destroy cannot repopulate the interaction journal', () => {
  const input = {
    onPointerDown: new Signal<[Pointer, number, number]>(),
    onPointerMove: new Signal<[Pointer, number, number]>(),
    onPointerUp: new Signal<[Pointer, number, number]>(),
    onPointerTap: new Signal<[Pointer, number, number]>(),
    onPointerCancel: new Signal<[Pointer, number, number]>(),
    onPointerLeave: new Signal<[Pointer, number, number]>(),
    onContextMenu: new Signal(),
    onKeyDown: new Signal<[number]>(),
    onKeyUp: new Signal<[number]>(),
    onAnyGamepadButtonDown: new Signal(),
  };
  input.onPointerDown.add(() => interaction.destroy());

  const interaction = new InteractionSystem({ input, options: {}, platform: {} } as unknown as Application);

  const pointer = { id: 1, type: 'mouse', x: 10, y: 10 } as Pointer;
  const state = interaction as unknown as { _journal: unknown[]; _livePointers: Map<number, Pointer> };

  try {
    input.onPointerDown.dispatch(pointer, 10, 10);

    expect(state._journal).toHaveLength(0);
    expect(state._livePointers.size).toBe(0);
  } finally {
    interaction.destroy();

    for (const signal of Object.values(input)) {
      signal.destroy();
    }
  }
});
