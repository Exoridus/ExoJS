import { Container, Graphics, RenderNode, Sprite } from '@codexo/exojs';

class Enemy extends Sprite {}

const named = <T extends RenderNode>(node: T, name: string): T => {
  node.name = name;

  return node;
};

/**
 * root
 * ├─ a: Container "group"
 * │  ├─ b: Sprite "player"
 * │  └─ c: Enemy "enemy"
 * ├─ d: Enemy "enemy"
 * └─ e: Graphics "player"
 */
const buildTree = () => {
  const root = new Container();
  const a = named(new Container(), 'group');
  const b = named(new Sprite(), 'player');
  const c = named(new Enemy(), 'enemy');
  const d = named(new Enemy(), 'enemy');
  const e = named(new Graphics(), 'player');

  a.addChild(b, c);
  root.addChild(a, d, e);

  return { root, a, b, c, d, e };
};

describe('Container.find', () => {
  test('walks depth-first in child-list order, visiting a node before its children', () => {
    const { root, a, b, c, d } = buildTree();

    expect(root.find(Container)).toBe(a);
    expect(root.find(Sprite)).toBe(b);
    expect(root.find(Enemy)).toBe(c);
    expect(root.findAll(Sprite)).toEqual([b, c, d]);
    expect(root.findAll(RenderNode).length).toBeGreaterThanOrEqual(5);

    root.destroy();
  });

  test('matches subclasses and filters by exact name and predicate', () => {
    const { root, b, c, d, e } = buildTree();

    expect(root.find(Sprite, { name: 'enemy' })).toBe(c);
    expect(root.find(Graphics, { name: 'player' })).toBe(e);
    expect(root.findAll(Enemy, { name: 'enemy' })).toEqual([c, d]);
    expect(root.find(Sprite, { name: 'Player' })).toBeNull();
    expect(root.findAll(Sprite, { where: sprite => sprite.parent === root })).toEqual([d]);
    expect(root.find(Sprite, { name: 'player', where: sprite => sprite === b })).toBe(b);

    root.destroy();
  });

  test('searches descendants only and returns null or an empty array when nothing matches', () => {
    const { root, a, b, c } = buildTree();

    expect(a.find(Container)).toBeNull();
    expect(a.findAll(Sprite)).toEqual([b, c]);
    expect(root.find(Sprite, { name: 'missing' })).toBeNull();
    expect(root.findAll(Sprite, { where: () => false })).toEqual([]);
    expect(new Container().findAll(Sprite)).toEqual([]);

    root.destroy();
  });

  test('calls where only for nodes that passed the type and name checks', () => {
    const { root, c, d } = buildTree();
    const seen: RenderNode[] = [];

    root.findAll(Enemy, {
      name: 'enemy',
      where: enemy => {
        seen.push(enemy);

        return true;
      },
    });

    expect(seen).toEqual([c, d]);

    root.destroy();
  });

  test('reflects the hierarchy at the time of the call', () => {
    const { root, b } = buildTree();

    b.parent!.removeChild(b);
    expect(root.find(Sprite, { name: 'player' })).toBeNull();
    root.addChild(b);
    expect(root.findAll(Sprite, { name: 'player' })).toEqual([b]);

    root.destroy();
  });
});
