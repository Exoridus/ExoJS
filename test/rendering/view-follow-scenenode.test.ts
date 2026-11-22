import { SceneNode } from '#core/SceneNode';
import { Container } from '#rendering/Container';
import { RetainedContainer } from '#rendering/RetainedContainer';
import { Sprite } from '#rendering/sprite/Sprite';
import { View } from '#rendering/View';

describe('View.follow(SceneNode)', () => {
  test('follow with plain {x, y} still works as before', () => {
    const view = new View(0, 0, 100, 100);
    const target = { x: 100, y: 100 };

    view.follow(target);
    view.update(16);

    expect(view.center.x).toBe(100);
    expect(view.center.y).toBe(100);
  });

  test('follow(node) tracks world position of a root-level SceneNode', () => {
    const view = new View(0, 0, 100, 100);
    const node = new SceneNode();

    node.setPosition(50, 50);

    view.follow(node);
    view.update(16);

    expect(view.center.x).toBeCloseTo(50);
    expect(view.center.y).toBeCloseTo(50);
  });

  test('follow(nestedNode) tracks world position (not local) of a nested Container', () => {
    const view = new View(0, 0, 200, 200);
    const parent = new Container();
    const child = new Container();

    // Parent at (100, 100), child at (20, 30) in local space
    // => world position of child = (120, 130)
    parent.setPosition(100, 100);
    child.setPosition(20, 30);
    parent.addChild(child);

    view.follow(child);
    view.update(16);

    expect(view.center.x).toBeCloseTo(120);
    expect(view.center.y).toBeCloseTo(130);
  });

  test('follow composes translation through nested retained groups', () => {
    const view = new View(0, 0, 200, 200);
    const outer = new RetainedContainer();
    const inner = new RetainedContainer();
    const child = new Container();

    outer.setPosition(100, 100);
    inner.setPosition(10, 20);
    child.setPosition(20, 30);
    outer.addChild(inner);
    inner.addChild(child);
    view.follow(child);
    view.update(1 / 60);

    expect(view.center.x).toBe(130);
    expect(view.center.y).toBe(150);
    expect([child.getGlobalTransform().x, child.getGlobalTransform().y]).toEqual([20, 30]);

    outer.setPosition(200, 300);
    view.update(1 / 60);

    expect(view.center.x).toBe(230);
    expect(view.center.y).toBe(350);

    view.destroy();
    outer.destroy();
  });

  test.each([
    { name: 'ordinary', create: () => new Container() },
    { name: 'retained', create: () => new RetainedContainer() },
  ])('follow applies world offsets and lerp after a rotated, scaled $name parent', ({ create }) => {
    const view = new View(0, 0, 200, 200);
    const parent = create();
    const child = new Container();

    parent.setPosition(100, 100);
    parent.setRotation(90);
    parent.setScale(2, 3);
    child.setPosition(20, 30);
    parent.addChild(child);
    view.follow(child, { lerp: 0.5, offsetX: 5, offsetY: -10 });
    view.update(1 / 60);

    // World target (190,60), offset (5,-10), then halfway from the original center.
    expect(view.center.x).toBeCloseTo(97.5);
    expect(view.center.y).toBeCloseTo(25);

    view.destroy();
    parent.destroy();
  });

  test('follow preserves the local-origin target for an anchored sprite inside a retained group', () => {
    const view = new View(0, 0, 200, 200);
    const group = new RetainedContainer();
    const child = new Sprite();

    group.setPosition(100, 100);
    child.setLocalBounds(0, 0, 128, 32);
    child.anchor.set(0.5, 0.5);
    child.setPosition(100, 200);
    group.addChild(child);
    view.follow(child);
    view.update(1 / 60);

    expect(view.center.x).toBe(136);
    expect(view.center.y).toBe(284);

    view.destroy();
    group.destroy();
  });

  test('switching follow target from nodeA to nodeB works', () => {
    const view = new View(0, 0, 100, 100);
    const nodeA = new SceneNode();
    const nodeB = new SceneNode();

    nodeA.setPosition(10, 10);
    nodeB.setPosition(80, 80);

    view.follow(nodeA);
    view.update(16);
    expect(view.center.x).toBeCloseTo(10);
    expect(view.center.y).toBeCloseTo(10);

    view.follow(nodeB);
    view.update(16);
    expect(view.center.x).toBeCloseTo(80);
    expect(view.center.y).toBeCloseTo(80);
  });

  test('follow(null) clears the follow target', () => {
    const view = new View(0, 0, 100, 100);
    const node = new SceneNode();

    node.setPosition(50, 50);

    view.follow(node);
    view.update(16);
    expect(view.center.x).toBeCloseTo(50);

    view.follow(null);
    view.setCenter(0, 0);
    view.update(16);

    // After clearing, center should stay at 0,0
    expect(view.center.x).toBe(0);
    expect(view.center.y).toBe(0);
  });
});
