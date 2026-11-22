import { Container, logger, RetainedContainer, Scene, SceneDirector, Sprite, Texture } from '@codexo/exojs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BoxShape, type PhysicsBody, PhysicsBodyComponent, PhysicsWorld } from '../src/index';
import { createAppStub } from './sceneHarness';

const owned: Array<{ destroy(): void }> = [];

class PivotScene extends Scene {}

afterEach(() => {
  for (let index = owned.length - 1; index >= 0; index--) {
    owned[index]!.destroy();
  }

  owned.length = 0;
  vi.restoreAllMocks();
});

const sprite = (): Sprite => {
  const canvas = document.createElement('canvas');

  canvas.width = 128;
  canvas.height = 32;

  const texture = new Texture(canvas);
  const node = new Sprite(texture);

  owned.push(texture, node);
  node.setPosition(100, 200);

  return node;
};

describe.each(['attach', 'component'] as const)('automatic world pivot via %s', mode => {
  const bind = async (node: Sprite, options: { position?: { x: number; y: number }; angle?: number } = {}): Promise<PhysicsBody> => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: 0 } });

    owned.push(world);

    if (mode === 'attach') {
      return world.attach(node, { type: 'kinematic', shape: new BoxShape(128, 32), ...options });
    }

    const { app } = createAppStub();
    const director = new SceneDirector(app, { scene: PivotScene });

    owned.push(director);
    await director.change(PivotScene);

    const component = node.addComponent(
      new PhysicsBodyComponent(world, { type: 'kinematic', colliders: [{ shape: new BoxShape(128, 32) }], ...options }),
    );
    let root = node as Sprite | Container;

    while (root.parent !== null) {
      root = root.parent;
    }

    director.currentScene!.addChild(root);

    return component.body;
  };

  it('keeps a centered 128x32 sprite at its position pivot on first bind', async () => {
    const node = sprite();

    node.anchor.set(0.5, 0.5);

    const body = await bind(node);

    expect([body.x, body.y]).toEqual([100, 200]);
    expect([node.x, node.y]).toEqual([100, 200]);
    expect([node.getWorldTransform().x, node.getWorldTransform().y]).toEqual([36, 184]);
  });

  it('keeps an explicit pixel origin under rotation and scale', async () => {
    const node = sprite();

    node.setOrigin(9, 13);
    node.setRotation(90);
    node.setScale(2, 3);

    const body = await bind(node);

    expect(body.x).toBeCloseTo(100);
    expect(body.y).toBeCloseTo(200);
    expect(body.angle).toBeCloseTo(-Math.PI / 2);
    expect([node.x, node.y]).toEqual([body.x, body.y]);
    expect(node.rotation).toBeCloseTo(90);
    expect([node.scale.x, node.scale.y]).toEqual([2, 3]);
  });

  it('keeps the unanchored position unchanged', async () => {
    const node = sprite();
    const body = await bind(node);

    expect([body.x, body.y]).toEqual([100, 200]);
    expect([node.x, node.y]).toEqual([100, 200]);
  });

  it('lets an explicit body position override the centered pivot', async () => {
    const node = sprite();

    node.anchor.set(0.5, 0.5);

    const body = await bind(node, { position: { x: 7, y: 11 } });

    expect([body.x, body.y]).toEqual([7, 11]);
    expect([node.x, node.y]).toEqual([7, 11]);
  });

  it.each([
    { name: 'Container', create: () => new Container() },
    { name: 'RetainedContainer', create: () => new RetainedContainer() },
  ])('reads the pivot through a transformed $name and retains the parent guard', async ({ create }) => {
    const node = sprite();
    const parent = create();

    owned.push(parent);
    parent.setPosition(300, 400);
    parent.setRotation(90);
    parent.setScale(2, 3);
    parent.setOrigin(5, 7);
    node.setPosition(10, 20);
    node.anchor.set(0.5, 0.5);
    parent.addChild(node);

    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const body = await bind(node);

    // Parent maps the position pivot (10,20) to (300 + 3*(20-7), 400 - 2*(10-5)).
    expect(body.x).toBeCloseTo(339);
    expect(body.y).toBeCloseTo(390);
    expect(warn.mock.calls.some(call => String(call[0]).includes('world-space-rooted'))).toBe(true);
    // Binding still writes world pose into local state; transformed parents remain unsupported.
    expect([node.x, node.y]).toEqual([body.x, body.y]);
  });
});
