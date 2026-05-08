import { SceneNode } from '@/core/SceneNode';
import { Container } from '@/rendering/Container';
import { View } from '@/rendering/View';

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
