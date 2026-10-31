import { vi } from 'vitest';

import { Color } from '#core/Color';
import { Rectangle } from '#math/Rectangle';
import { Graphics } from '#rendering/primitives/Graphics';

describe('Graphics live rectangle sources', () => {
  test('nested edits, copies and no-op writes share the existing notification path', () => {
    const source = new Rectangle(0, 0, 10, 10);
    const graphics = new Graphics({ fill: Color.red });
    graphics.addShape(source);
    const mesh = graphics.getChildAt(0);
    const recompute = vi.spyOn(mesh, 'recomputeLocalBounds');

    source.position.set(4, 5);
    expect(mesh.getLocalBounds().x).toBe(4);
    expect(mesh.getLocalBounds().y).toBe(5);
    source.size.height = 20;
    expect(mesh.getLocalBounds().height).toBe(20);
    source.copy(new Rectangle(1, 2, 30, 40));
    expect(mesh.getLocalBounds().equals(source)).toBe(true);
    recompute.mockClear();
    source.width = 30;
    source.position.set(1, 2);
    expect(recompute).not.toHaveBeenCalled();
    graphics.destroy();
    expect(source).toHaveProperty('_geometryListeners', null);
    source.destroy();
  });

  test('an owner error cannot leave subscribed drawings stale', () => {
    const source = new Rectangle(0, 0, 10, 10, () => {
      throw new Error('owner failed');
    });
    const graphics = new Graphics({ fill: Color.red });
    graphics.addShape(source);

    expect(() => {
      source.width = 20;
    }).toThrow('owner failed');
    expect(graphics.getChildAt(0).getLocalBounds().width).toBe(20);
    graphics.destroy();
    source.destroy();
  });

  test('shares geometry mutations without replacing the existing owner or either mesh', () => {
    const owner = vi.fn();
    const source = new Rectangle(2, 3, 10, 20, owner);
    const first = new Graphics({ fill: Color.red });
    const second = new Graphics({ fill: Color.blue });
    const a = first.addShape(source);
    const b = second.addShape(source);
    const meshA = first.getChildAt(0);
    const meshB = second.getChildAt(0);
    const vertices = meshA.vertices;
    const revision = first._contentRevision;

    expect(a).not.toBe(b);
    source.size.width = 30;
    expect(owner).toHaveBeenCalledOnce();
    expect(first.getChildAt(0)).toBe(meshA);
    expect(second.getChildAt(0)).toBe(meshB);
    expect(meshA.vertices).toBe(vertices);
    expect(meshA.getLocalBounds().width).toBe(30);
    expect(meshB.getLocalBounds().width).toBe(30);
    expect(first._contentRevision).not.toBe(revision);
    expect(meshA.tint.equals(Color.red)).toBe(true);
    expect(meshB.tint.equals(Color.blue)).toBe(true);
    first.destroy();
    source.width = 40;
    expect(meshB.getLocalBounds().width).toBe(40);
    expect(owner).toHaveBeenCalledTimes(2);
    second.destroy();
    source.destroy();
  });

  test('lookup uses identity and rejects duplicate registration without adding a child', () => {
    const source = new Rectangle(0, 0, 10, 10);
    const graphics = new Graphics({ fill: Color.red });
    const handle = graphics.addShape(source);

    expect(graphics.getShape(source)).toBe(handle);
    expect(graphics.getShape(source.clone())).toBeNull();
    expect(() => graphics.addShape(source)).toThrow(/already registered/);
    expect(graphics.children).toHaveLength(1);
    graphics.clear();
    expect(graphics.getShape(source)).toBeNull();
    expect(() => handle.setStyle({ fill: Color.blue })).toThrow(/removed/);
    expect(graphics.addShape(source)).not.toBe(handle);
    graphics.destroy();
    source.destroy();
  });

  test('fill patches preserve geometry and inherited defaults respect local overrides', () => {
    const graphics = new Graphics({ fill: Color.red });
    const a = graphics.addShape(new Rectangle(0, 0, 10, 10));
    graphics.addShape(new Rectangle(20, 0, 10, 10), { fill: Color.blue });
    const mesh = graphics.getChildAt(0);
    const vertices = mesh.vertices.slice();
    const recompute = vi.spyOn(mesh, 'recomputeLocalBounds');

    graphics.setDefaultStyle({ fill: Color.green });
    expect(mesh.tint.equals(Color.green)).toBe(true);
    expect(graphics.getChildAt(1).tint.equals(Color.blue)).toBe(true);
    a.setStyle({ fill: Color.white });
    expect(mesh.tint.equals(Color.white)).toBe(true);
    expect(mesh.vertices).toEqual(vertices);
    expect(recompute).not.toHaveBeenCalled();
    a.setStyle({ fill: null });
    expect(mesh.visible).toBe(false);
    a.setStyle({ fill: Color.red });
    expect(mesh.visible).toBe(true);
    graphics.destroy();
  });

  test('clear unsubscribes and destroys only generated meshes', () => {
    const source = new Rectangle(0, 0, 10, 10);
    const subscribe = vi.spyOn(source, '_subscribeGeometry');
    const graphics = new Graphics({ fill: Color.red });
    graphics.addShape(source);
    const mesh = graphics.getChildAt(0);
    const recompute = vi.spyOn(mesh, 'recomputeLocalBounds');
    const destroySource = vi.spyOn(source, 'destroy');

    graphics.clear();
    source.width = 50;
    expect(recompute).not.toHaveBeenCalled();
    expect(mesh.destroyed).toBe(true);
    expect(destroySource).not.toHaveBeenCalled();
    expect(subscribe).toHaveBeenCalledOnce();
    expect(source).toHaveProperty('_geometryListeners', null);
    graphics.destroy();
    source.destroy();
  });
});
