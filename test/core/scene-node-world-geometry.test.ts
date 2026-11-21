import { Circle } from '#math/Circle';
import type { Collidable } from '#math/collisionTypes';
import { Ellipse } from '#math/Ellipse';
import { Line } from '#math/Line';
import { Polygon } from '#math/Polygon';
import { Rectangle } from '#math/Rectangle';
import { Vector } from '#math/Vector';
import { Container } from '#rendering/Container';
import { Drawable } from '#rendering/Drawable';
import { RetainedContainer } from '#rendering/RetainedContainer';
import { Sprite } from '#rendering/sprite/Sprite';
import { ScrollContainer } from '#ui/ScrollContainer';

const owned: Array<{ destroy(): void }> = [];

afterEach(() => {
  for (let index = owned.length - 1; index >= 0; index--) {
    owned[index]!.destroy();
  }

  owned.length = 0;
});

const shapeCases: Array<{ name: string; create: () => Collidable; response: boolean }> = [
  { name: 'rectangle', create: () => new Rectangle(125, 135, 10, 10), response: true },
  { name: 'circle', create: () => new Circle(130, 140, 3), response: true },
  { name: 'ellipse', create: () => new Ellipse(130, 140, 3, 2), response: true },
  { name: 'polygon', create: () => new Polygon([new Vector(125, 135), new Vector(135, 135), new Vector(130, 145)]), response: true },
  { name: 'line', create: () => new Line(125, 140, 135, 140), response: false },
  { name: 'point', create: () => new Vector(130, 140), response: false },
];

describe.each([
  { name: 'Drawable', makeNode: () => new Drawable() },
  { name: 'Sprite', makeNode: () => new Sprite() },
])('$name world geometry', ({ makeNode }) => {
  describe.each([
    { name: 'ordinary container', makeParent: () => new Container() },
    { name: 'retained container', makeParent: () => new RetainedContainer() },
  ])('under $name', ({ makeParent }) => {
    const hierarchy = (): { parent: Container; node: Drawable } => {
      const parent = makeParent();
      const node = makeNode();

      owned.push(parent);
      parent.setPosition(100, 100);
      node.setPosition(20, 30);
      node.setLocalBounds(0, 0, 40, 20);
      parent.addChild(node);

      return { parent, node };
    };

    test('contains accepts world points and rejects untranslated local points', () => {
      const { node } = hierarchy();

      expect(node.contains(130, 140)).toBe(true);
      expect(node.contains(30, 40)).toBe(false);
    });

    test.each(shapeCases)('queries $name in world space in either operand order', ({ create, response }) => {
      const { node } = hierarchy();
      const target = create();

      expect(node.intersectsWith(target)).toBe(true);
      expect(target.intersectsWith(node)).toBe(true);

      if (response) {
        expect(node.collidesWith(target)).not.toBeNull();
        expect(target.collidesWith(node)).not.toBeNull();
      }

      expect(node.intersectsWith(new Rectangle(25, 35, 10, 10))).toBe(false);
      expect(node.collidesWith(new Rectangle(25, 35, 10, 10))).toBeNull();
    });

    test('uses the inherited rotation for exact point and rectangle tests', () => {
      const { parent, node } = hierarchy();

      parent.setPosition(300, 300);
      parent.setRotation(45);
      parent.setScale(2);
      node.setPosition(0, 0);
      node.setLocalBounds(-40, -40, 80, 80);

      expect(node.contains(300, 300)).toBe(true);
      // The world diamond reaches ~113 along either axis, but not both at once.
      expect(node.contains(400, 400)).toBe(false);
      expect(node.intersectsWith(new Rectangle(296, 296, 8, 8))).toBe(true);
      expect(node.intersectsWith(new Rectangle(400, 400, 6, 6))).toBe(false);
      expect(new Rectangle(400, 400, 6, 6).intersectsWith(node)).toBe(false);
      expect(node.collidesWith(new Rectangle(400, 400, 6, 6))).toBeNull();
      expect(new Rectangle(400, 400, 6, 6).collidesWith(node)).toBeNull();
    });

    test('maps hit areas from world coordinates into the node local space', () => {
      const { node } = hierarchy();

      node.hitArea = new Circle(20, 10, 5);

      expect(node.contains(140, 140)).toBe(true);
      expect(node.contains(125, 135)).toBe(false);
    });
  });

  test('does not inflate a counter-rotated child by transforming its group AABB twice', () => {
    const group = new RetainedContainer();
    const node = makeNode();

    owned.push(group);
    group.setPosition(100, 100);
    group.setRotation(45);
    node.setLocalBounds(-20, -10, 40, 20);
    node.setRotation(-45);
    group.addChild(node);

    // Opposite rotations cancel: the world box is exactly [80,120] x [90,110].
    expect(node.contains(100, 100)).toBe(true);
    expect(node.contains(125, 100)).toBe(false);
    expect(node.intersectsWith(new Rectangle(124, 98, 2, 4))).toBe(false);
    expect(node.collidesWith(new Rectangle(124, 98, 2, 4))).toBeNull();
    expect(new Rectangle(124, 98, 2, 4).collidesWith(node)).toBeNull();

    const outside: Collidable[] = [
      new Circle(126, 100, 1),
      new Ellipse(126, 100, 1, 2),
      new Line(124, 98, 126, 102),
      new Vector(125, 100),
      new Polygon([new Vector(124, 98), new Vector(126, 98), new Vector(125, 102)]),
    ];

    for (const target of outside) {
      expect(node.intersectsWith(target)).toBe(false);
      expect(target.intersectsWith(node)).toBe(false);
      expect(node.collidesWith(target)).toBeNull();
      expect(target.collidesWith(node)).toBeNull();
    }
  });

  test('compares nodes across retained groups and updates after only an ancestor moves', () => {
    const first = new RetainedContainer();
    const second = new RetainedContainer();
    const a = makeNode();
    const b = makeNode();

    owned.push(first, second);
    first.setPosition(100, 100);
    second.setPosition(140, 125);
    a.setPosition(20, 30);
    b.setPosition(0, 10);
    a.setLocalBounds(0, 0, 40, 20);
    b.setLocalBounds(0, 0, 40, 20);
    first.addChild(a);
    second.addChild(b);

    expect(a.intersectsWith(b)).toBe(true);
    expect(b.intersectsWith(a)).toBe(true);
    expect(a.collidesWith(b)?.overlap).toBeCloseTo(15);
    expect(b.collidesWith(a)?.overlap).toBeCloseTo(15);

    second.setPosition(240, 125);

    expect(a.intersectsWith(b)).toBe(false);
    expect(b.intersectsWith(a)).toBe(false);
    expect(a.collidesWith(b)).toBeNull();
    expect(b.collidesWith(a)).toBeNull();
  });

  test('keeps nested retained bounds and sprite vertices in rendering space while world projections follow the groups', () => {
    const outer = new RetainedContainer();
    const inner = new RetainedContainer();
    const node = makeNode();

    owned.push(outer);
    outer.setPosition(100, 100);
    inner.setPosition(10, 20);
    node.setPosition(20, 30);
    node.setLocalBounds(0, 0, 40, 20);
    outer.addChild(inner);
    inner.addChild(node);

    const bounds = node.getBounds();
    const vertices = node instanceof Sprite ? Array.from(node.vertices) : null;
    const xAxis = new Vector(1, 0);

    expect([bounds.x, bounds.y, bounds.width, bounds.height]).toEqual([20, 30, 40, 20]);
    expect(node.project(xAxis).min).toBeCloseTo(130);
    expect(node.project(xAxis).max).toBeCloseTo(170);

    outer.setPosition(200, 100);

    expect(node.project(xAxis).min).toBeCloseTo(230);
    expect(node.project(xAxis).max).toBeCloseTo(270);
    expect(node.getBounds()).toBe(bounds);
    expect([bounds.x, bounds.y, bounds.width, bounds.height]).toEqual([20, 30, 40, 20]);
    expect([node.getGlobalTransform().x, node.getGlobalTransform().y]).toEqual([20, 30]);

    if (node instanceof Sprite) {
      expect(Array.from(node.vertices)).toEqual(vertices);
    }

    inner.setRotation(45);

    expect(node.getNormals().some(normal => Math.abs(normal.x) > 0.1 && Math.abs(normal.y) > 0.1)).toBe(true);
  });
});

test('world collision bounds preserve an ordinary container aggregate inside a retained group', () => {
  const group = new RetainedContainer();
  const container = new Container();
  const child = new Drawable();

  owned.push(group);
  group.setPosition(100, 100);
  container.setPosition(20, 30);
  child.setLocalBounds(0, 0, 40, 20);
  container.addChild(child);
  group.addChild(container);

  expect(container.intersectsWith(new Rectangle(125, 135, 10, 10))).toBe(true);
  expect(new Rectangle(125, 135, 10, 10).intersectsWith(container)).toBe(true);
  expect(container.collidesWith(new Rectangle(125, 135, 10, 10))).not.toBeNull();

  group.setPosition(200, 100);

  expect(container.intersectsWith(new Rectangle(225, 135, 10, 10))).toBe(true);
  expect(container.intersectsWith(new Rectangle(125, 135, 10, 10))).toBe(false);
  expect([container.getBounds().x, container.getBounds().y]).toEqual([20, 30]);
});

describe.each([
  { name: 'ordinary parent', makeParent: () => new Container() },
  { name: 'retained parent', makeParent: () => new RetainedContainer() },
])('rotated aggregate queries under $name', ({ makeParent }) => {
  describe.each([
    { name: 'ordinary aggregate', makeAggregate: () => new Container() },
    { name: 'retained aggregate', makeAggregate: () => new RetainedContainer() },
  ])('$name', ({ makeAggregate }) => {
    test.each(['inherited', 'own'])('uses child aggregate bounds with %s rotation in both operand orders', rotation => {
      const parent = makeParent();
      const aggregate = makeAggregate();
      const leaf = new Drawable();
      const rectangle = new Rectangle(108, 98, 4, 4);
      const circle = new Circle(110, 100, 2);
      const polygon = new Polygon([new Vector(108, 98), new Vector(112, 98), new Vector(110, 102)]);

      owned.push(parent, rectangle, circle, polygon);
      parent.setPosition(100, 100);
      (rotation === 'inherited' ? parent : aggregate).setRotation(45);
      leaf.setLocalBounds(-10, -10, 20, 20);
      aggregate.addChild(leaf);
      parent.addChild(aggregate);

      const bounds = aggregate.getBounds();
      const renderBounds = [bounds.x, bounds.y, bounds.width, bounds.height];

      expect(aggregate.contains(110, 100)).toBe(true);
      expect(rectangle.intersectsWith(leaf)).toBe(true);

      for (const probe of [rectangle, circle, polygon]) {
        expect(aggregate.intersectsWith(probe)).toBe(true);
        expect(probe.intersectsWith(aggregate)).toBe(true);
        expect(aggregate.collidesWith(probe)).not.toBeNull();
        expect(probe.collidesWith(aggregate)).not.toBeNull();
      }

      expect(aggregate.getBounds()).toBe(bounds);
      expect([bounds.x, bounds.y, bounds.width, bounds.height]).toEqual(renderBounds);

      parent.setPosition(200, 100);

      for (const probe of [rectangle, circle, polygon]) {
        expect(aggregate.intersectsWith(probe)).toBe(false);
        expect(probe.intersectsWith(aggregate)).toBe(false);
        expect(aggregate.collidesWith(probe)).toBeNull();
        expect(probe.collidesWith(aggregate)).toBeNull();
      }
    });
  });

  test('keeps a translated child in the aggregate while leaf queries retain oriented precision', () => {
    const parent = makeParent();
    const aggregate = new Container();
    const leaf = new Drawable();
    const inside = new Rectangle(112, 98, 4, 4);
    const corner = new Rectangle(122, 112, 1, 1);

    owned.push(parent, inside, corner);
    parent.setPosition(100, 100);
    aggregate.setRotation(45);
    leaf.setPosition(10 * Math.SQRT1_2, 10 * Math.SQRT1_2);
    leaf.setLocalBounds(-10, -10, 20, 20);
    aggregate.addChild(leaf);
    parent.addChild(aggregate);

    // The child's world centre is (110,100), away from the container's origin.
    expect(aggregate.contains(114, 100)).toBe(true);
    expect(aggregate.intersectsWith(inside)).toBe(true);
    expect(inside.intersectsWith(aggregate)).toBe(true);
    expect(aggregate.collidesWith(inside)).not.toBeNull();
    expect(inside.collidesWith(aggregate)).not.toBeNull();

    // The aggregate is conservative; the drawable still rejects the diamond's empty corner.
    expect(aggregate.intersectsWith(corner)).toBe(true);
    expect(corner.intersectsWith(aggregate)).toBe(true);
    expect(leaf.intersectsWith(corner)).toBe(false);
    expect(corner.intersectsWith(leaf)).toBe(false);
    expect(leaf.collidesWith(corner)).toBeNull();
    expect(corner.collidesWith(leaf)).toBeNull();
    expect(aggregate.contains(122, 112)).toBe(false);
  });
});

test.each([
  { name: 'ordinary container', makeNode: () => new Container() },
  { name: 'retained container', makeNode: () => new RetainedContainer() },
])('a childless $name with its own local extent keeps oriented collision geometry', ({ makeNode }) => {
  const node = makeNode();
  const inside = new Rectangle(108, 98, 4, 4);
  const corner = new Rectangle(112, 112, 1, 1);

  owned.push(node, inside, corner);
  node.setLocalBounds(-10, -10, 20, 20);
  node.setPosition(100, 100);
  node.setRotation(45);

  expect(node.intersectsWith(inside)).toBe(true);
  expect(inside.intersectsWith(node)).toBe(true);
  expect(node.collidesWith(inside)).not.toBeNull();
  expect(inside.collidesWith(node)).not.toBeNull();
  expect(node.intersectsWith(corner)).toBe(false);
  expect(corner.intersectsWith(node)).toBe(false);
  expect(node.collidesWith(corner)).toBeNull();
  expect(corner.collidesWith(node)).toBeNull();
});

test('an unclipped retained ScrollContainer checks its viewport and child union in the same world space', () => {
  const group = new RetainedContainer();
  const scroll = new ScrollContainer({ width: 40, height: 20, scrollbars: 'never' });
  const child = new Drawable();

  owned.push(group);
  group.setPosition(100, 100);
  scroll.clip = false;
  child.setLocalBounds(0, 0, 100, 100);
  scroll.content.addChild(child);
  group.addChild(scroll);

  expect(scroll.contains(110, 110)).toBe(true);
  expect(scroll.contains(150, 110)).toBe(false);
  expect(scroll.contains(10, 10)).toBe(false);
});
