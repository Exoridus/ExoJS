/**
 * `destroy()` idempotence across the node hierarchy: `Container` has always
 * guarded re-entry, and the two layers beneath it document releasing state
 * that a second pass must not touch again.
 */
import { SceneNode } from '#core/SceneNode';
import { Container } from '#rendering/Container';
import { RenderNode } from '#rendering/RenderNode';

/** RenderNode is abstract but adds no abstract members - a bare subclass is the layer itself. */
class BareRenderNode extends RenderNode {}

describe('SceneNode.destroy() idempotence', () => {
  test('a second destroy() on a bare SceneNode is a no-op', () => {
    const node = new SceneNode();
    const positionDestroy = vi.spyOn(node.position, 'destroy');

    node.destroy();

    expect(node.destroyed).toBe(true);
    expect(positionDestroy).toHaveBeenCalledTimes(1);

    node.destroy();

    expect(positionDestroy).toHaveBeenCalledTimes(1);
  });

  test('a second destroy() on a RenderNode is a no-op', () => {
    const node = new BareRenderNode();
    const positionDestroy = vi.spyOn(node.position, 'destroy');
    const filterDestroy = vi.fn();

    node.filters = [
      { destroy: filterDestroy, _attachOwner: (): void => {}, _detachOwner: (): void => {} } as unknown as NonNullable<typeof node.filters>[number],
    ];

    node.destroy();

    expect(positionDestroy).toHaveBeenCalledTimes(1);
    expect(filterDestroy).toHaveBeenCalledTimes(1);

    node.destroy();

    expect(positionDestroy).toHaveBeenCalledTimes(1);
    expect(filterDestroy).toHaveBeenCalledTimes(1);
  });

  test('a second destroy() on a RenderNode subclass releases nothing twice', () => {
    const node = new Container();
    const positionDestroy = vi.spyOn(node.position, 'destroy');

    node.destroy();
    node.destroy();

    expect(positionDestroy).toHaveBeenCalledTimes(1);
  });
});
