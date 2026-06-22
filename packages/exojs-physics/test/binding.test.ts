import type { SceneNode } from '@codexo/exojs';
import { describe, expect, it } from 'vitest';

import { BoxShape, PhysicsBody, PhysicsWorld } from '../src/index';

interface FakeNode {
  skewX: number;
  skewY: number;
  x: number;
  y: number;
  rotation: number;
  setPosition(x: number, y: number): FakeNode;
  setRotation(degrees: number): FakeNode;
}

const fakeNode = (skewX = 0, skewY = 0): FakeNode => ({
  skewX,
  skewY,
  x: 0,
  y: 0,
  rotation: 0,
  setPosition(x: number, y: number) {
    this.x = x;
    this.y = y;

    return this;
  },
  setRotation(degrees: number) {
    this.rotation = degrees;

    return this;
  },
});

describe('SceneNode binding (gate B-1)', () => {
  it('writes the body position onto the node on bind and after each step', () => {
    const world = new PhysicsWorld();
    const body = world.add(new PhysicsBody({ type: 'kinematic', position: { x: 10, y: 20 }, colliders: [{ shape: new BoxShape(10, 10) }] }));
    const node = fakeNode();

    world.bind(body, node as unknown as SceneNode);
    expect(node.x).toBe(10);
    expect(node.y).toBe(20);

    body.setTransform({ x: 33, y: 44 });
    world.step(1 / 60);
    expect(node.x).toBe(33);
    expect(node.y).toBe(44);
  });

  it('writes the body rotation onto the node (radians → degrees)', () => {
    const world = new PhysicsWorld();
    const body = world.add(
      new PhysicsBody({ type: 'kinematic', position: { x: 0, y: 0 }, angle: Math.PI / 2, colliders: [{ shape: new BoxShape(10, 10) }] }),
    );
    const node = fakeNode();

    world.bind(body, node as unknown as SceneNode);

    expect(node.rotation).toBeCloseTo(90, 6);

    body.setTransform({ x: 0, y: 0 }, Math.PI);
    world.step(1 / 60);

    expect(node.rotation).toBeCloseTo(180, 6);
  });

  it('rejects binding a node with non-zero skew', () => {
    const world = new PhysicsWorld();
    const body = world.add(new PhysicsBody({ type: 'kinematic', position: { x: 0, y: 0 }, colliders: [{ shape: new BoxShape(10, 10) }] }));

    expect(() => world.bind(body, fakeNode(15, 0) as unknown as SceneNode)).toThrow();
  });

  it('stops tracking after unbind', () => {
    const world = new PhysicsWorld();
    const body = world.add(new PhysicsBody({ type: 'kinematic', position: { x: 0, y: 0 }, colliders: [{ shape: new BoxShape(10, 10) }] }));
    const node = fakeNode();

    world.bind(body, node as unknown as SceneNode);
    world.unbind(body);

    body.setTransform({ x: 99, y: 99 });
    world.step(1 / 60);
    expect(node.x).toBe(0);
    expect(node.y).toBe(0);
  });
});
