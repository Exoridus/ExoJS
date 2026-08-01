import { ActionMap } from '#input/actions/ActionMap';
import { ButtonAction } from '#input/actions/ButtonAction';
import { InputBinding } from '#input/InputBinding';
import { Keyboard } from '#input/types';
import { Container } from '#rendering/Container';
import { RenderNode } from '#rendering/RenderNode';

class TestNode extends RenderNode {}

const disposeKey = Symbol.dispose ?? Symbol.for('Symbol.dispose');

describe('JavaScript protocols', () => {
  test('Container iteration is a stable document-order snapshot', () => {
    const container = new Container();
    const first = new TestNode();
    const second = new TestNode();
    const later = new TestNode();
    container.addChild(first, second);

    const iterator = container[Symbol.iterator]();
    container.addChild(later);

    // Identity checks, not `toEqual` — interchangeable blank `TestNode`
    // instances are structurally identical, so a deep-equality assertion would
    // pass even if iteration silently yielded clones or the wrong nodes.
    const snapshot = [...iterator];
    expect(snapshot).toHaveLength(2);
    expect(snapshot[0]).toBe(first);
    expect(snapshot[1]).toBe(second);

    const live = [...container];
    expect(live).toHaveLength(3);
    expect(live[0]).toBe(first);
    expect(live[1]).toBe(second);
    expect(live[2]).toBe(later);
  });

  test('using binding = ... disposes exactly once via the real Explicit Resource Management protocol', () => {
    const detach = vi.fn();

    {
      using binding = new InputBinding([Keyboard.Space], {}, { detach });
      expect(binding.active).toBe(false);
    }

    expect(detach).toHaveBeenCalledTimes(1);
  });

  test('InputBinding disposal delegates to idempotent unbind regardless of call order', () => {
    const detach = vi.fn();
    const binding = new InputBinding([Keyboard.Space], {}, { detach });
    const dispose = (binding as unknown as Record<symbol, () => void>)[disposeKey]!;

    // Automatic disposal first, then a redundant automatic disposal.
    dispose.call(binding);
    dispose.call(binding);
    expect(detach).toHaveBeenCalledTimes(1);

    // A manual `unbind()` after disposal — still a no-op.
    binding.unbind();
    expect(detach).toHaveBeenCalledTimes(1);
  });

  test('explicit unbind() followed by automatic disposal stays idempotent', () => {
    const detach = vi.fn();
    const binding = new InputBinding([Keyboard.Space], {}, { detach });
    const dispose = (binding as unknown as Record<symbol, () => void>)[disposeKey]!;

    // A `using` scope disposing a binding the caller already unbound manually
    // (e.g. `using binding = input.onStart(...)` where the body itself calls
    // `binding.unbind()` before falling out of scope) must not double-detach.
    binding.unbind();
    expect(detach).toHaveBeenCalledTimes(1);

    dispose.call(binding);
    expect(detach).toHaveBeenCalledTimes(1);
  });

  test('engine-owned collections are iterable but not caller-disposable', () => {
    const container = new Container();
    const map = new ActionMap({ jump: new ButtonAction(Keyboard.Space) });

    expect(Symbol.iterator in container).toBe(true);
    expect(disposeKey in container).toBe(false);

    // An ActionMap is deliberately NOT iterable: `map.actions` already exposes
    // the same array in the same order, and an iterator yielding the `Action`
    // union has no member a consumer could use without narrowing.
    expect(Symbol.iterator in map).toBe(false);
    expect(disposeKey in map).toBe(false);
  });
});
