import { Container, Drawable, logger, type SceneNode, Vector } from '@codexo/exojs';
import { describe, expect, it, vi } from 'vitest';

import { NativePhysicsBackend } from '../src/backend/NativePhysicsBackend';
import { BindingRegistry } from '../src/binding/BindingRegistry';
import { Collider } from '../src/Collider';
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

describe('SceneNode binding', () => {
  it('writes the body position onto the node on bind and after each step', () => {
    const world = new PhysicsWorld();
    const body = world.add(
      new PhysicsBody({ type: 'kinematic', position: { x: 10, y: 20 }, colliders: [{ shape: new BoxShape(10, 10) }] }),
    );
    const node = fakeNode();

    world.bind(body, node as unknown as SceneNode);
    expect(node.x).toBe(10);
    expect(node.y).toBe(20);

    body.setTransform({ x: 33, y: 44 });
    world.step(1 / 60);
    expect(node.x).toBe(33);
    expect(node.y).toBe(44);
  });

  it('writes the body rotation as the counter-rotating degrees a SceneNode expects', () => {
    const world = new PhysicsWorld();
    const body = world.add(
      new PhysicsBody({ type: 'kinematic', position: { x: 0, y: 0 }, angle: Math.PI / 2, colliders: [{ shape: new BoxShape(10, 10) }] }),
    );
    const node = fakeNode();

    world.bind(body, node as unknown as SceneNode);

    expect(node.rotation).toBeCloseTo(-90, 6);

    body.setTransform({ x: 0, y: 0 }, Math.PI);
    world.step(1 / 60);

    expect(node.rotation).toBeCloseTo(-180, 6);
  });

  it("renders the bound node where the body's colliders are", () => {
    const world = new PhysicsWorld();
    const angle = Math.PI / 6;
    const body = world.add(
      new PhysicsBody({ type: 'kinematic', position: { x: 50, y: 20 }, angle, colliders: [{ shape: new BoxShape(10, 10) }] }),
    );
    const node = new Drawable();

    world.bind(body, node);

    const rendered = new Vector(100, 0).transform(node.getGlobalTransform());

    expect(rendered.x).toBeCloseTo(50 + Math.cos(angle) * 100, 4);
    expect(rendered.y).toBeCloseTo(20 + Math.sin(angle) * 100, 4);

    node.destroy();
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

describe('SceneNode binding: parent transforms', () => {
  const makeBody = (): PhysicsBody =>
    new PhysicsBody({ type: 'kinematic', position: { x: 7, y: 9 }, colliders: [{ shape: new BoxShape(10, 10) }] });

  it('rejects a non-rigid parent without installing a binding', () => {
    const registry = new BindingRegistry();
    const parent = new Container();
    const node = new Drawable();
    parent.setScale(2, 1);
    parent.addChild(node);

    expect(() => registry.bind(makeBody(), node)).toThrow(/rigid/);
    expect(registry.size).toBe(0);
    parent.destroy();
  });

  it('skips presentation while the parent transform is unsupported and recovers when it is repaired', () => {
    const registry = new BindingRegistry();
    const parent = new Container();
    const node = new Drawable();
    parent.addChild(node);
    const body = makeBody();
    registry.bind(body, node);

    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    parent.setScale(-1, 1);
    body.setTransform({ x: 20, y: 30 });
    registry.sync();
    registry.sync();
    expect(warn).toHaveBeenCalledTimes(1);
    expect([node.x, node.y]).toEqual([7, 9]);
    parent.setScale(1);
    registry.sync();
    expect([node.x, node.y]).toEqual([20, 30]);
    warn.mockRestore();
    parent.destroy();
  });

  it.each([false, true])('syncs a bound ancestor first (interpolation: %s)', interpolation => {
    const world = new PhysicsWorld({ interpolation, frameAlphaSource: () => 0.5 });
    const parent = new Container();
    const middle = new Container();
    const child = new Drawable();
    parent.addChild(middle);
    middle.addChild(child);
    const childBody = world.attach(child, { type: 'kinematic', shape: new BoxShape(10, 10), position: { x: 100, y: 0 } });
    const parentBody = world.attach(parent, { type: 'kinematic', shape: new BoxShape(10, 10) });
    parentBody.linearVelocityX = 600;

    world.step(1 / 60);
    expect(parent.x).toBeCloseTo(interpolation ? 5 : 10);
    expect(child.getWorldTransform().x).toBeCloseTo(100);
    expect(() => world.bind(parentBody, child)).toThrow(/already bound/);
    expect(childBody.x).toBeCloseTo(100);
    world.destroy();
    parent.destroy();
  });
});

describe('BindingRegistry', () => {
  it('tracks the number of active bindings via size', () => {
    const registry = new BindingRegistry();
    const bodyA = new PhysicsBody({ type: 'kinematic', position: { x: 0, y: 0 }, colliders: [{ shape: new BoxShape(10, 10) }] });
    const bodyB = new PhysicsBody({ type: 'kinematic', position: { x: 0, y: 0 }, colliders: [{ shape: new BoxShape(10, 10) }] });

    expect(registry.size).toBe(0);

    registry.bind(bodyA, fakeNode() as unknown as SceneNode);
    expect(registry.size).toBe(1);

    registry.bind(bodyB, fakeNode() as unknown as SceneNode);
    expect(registry.size).toBe(2);

    registry.unbind(bodyA);
    expect(registry.size).toBe(1);

    registry.clear();
    expect(registry.size).toBe(0);
  });

  it('drops a binding whose node was destroyed instead of writing into its released transform', () => {
    const registry = new BindingRegistry();
    const body = new PhysicsBody({ type: 'kinematic', position: { x: 1, y: 2 }, colliders: [{ shape: new BoxShape(10, 10) }] });
    const node = new Drawable();

    registry.bind(body, node);
    expect(registry.size).toBe(1);

    const setPosition = vi.spyOn(node, 'setPosition');
    const setRotation = vi.spyOn(node, 'setRotation');

    node.destroy();
    registry.sync();

    expect(setPosition).not.toHaveBeenCalled();
    expect(setRotation).not.toHaveBeenCalled();
    expect(registry.size).toBe(0);
  });

  it('keeps syncing the surviving bindings when one node is destroyed', () => {
    const registry = new BindingRegistry();
    const deadBody = new PhysicsBody({ type: 'kinematic', position: { x: 0, y: 0 }, colliders: [{ shape: new BoxShape(10, 10) }] });
    const liveBody = new PhysicsBody({ type: 'kinematic', position: { x: 5, y: 6 }, colliders: [{ shape: new BoxShape(10, 10) }] });
    const deadNode = new Drawable();
    const liveNode = fakeNode();

    registry.bind(deadBody, deadNode);
    registry.bind(liveBody, liveNode as unknown as SceneNode);

    deadNode.destroy();
    liveBody.setTransform({ x: 40, y: 50 });
    registry.sync();

    expect(registry.size).toBe(1);
    expect(liveNode.x).toBe(40);
    expect(liveNode.y).toBe(50);
  });

  it('rejects binding a node that is already destroyed', () => {
    const registry = new BindingRegistry();
    const body = new PhysicsBody({ type: 'kinematic', position: { x: 0, y: 0 }, colliders: [{ shape: new BoxShape(10, 10) }] });
    const node = new Drawable();

    node.destroy();

    expect(() => registry.bind(body, node)).toThrow(/destroyed node/);
    expect(registry.size).toBe(0);
  });

  it('a world step stops writing into a destroyed bound node', () => {
    const world = new PhysicsWorld();
    const body = world.add(new PhysicsBody({ type: 'kinematic', position: { x: 0, y: 0 }, colliders: [{ shape: new BoxShape(10, 10) }] }));
    const node = new Drawable();

    world.bind(body, node);
    node.destroy();

    const setPosition = vi.spyOn(node, 'setPosition');

    body.setTransform({ x: 77, y: 88 });
    world.step(1 / 60);

    expect(setPosition).not.toHaveBeenCalled();
  });
});

describe('NativePhysicsBackend', () => {
  it('exposes the latest broad-phase candidate pairs', () => {
    // A real PhysicsWorld is used only to attach + synchronize the colliders (assign
    // ids, compute their AABBs) - the backend under test is a fresh, standalone instance,
    // not the world's own backend.
    const world = new PhysicsWorld();
    const colliderA = new Collider({ shape: new BoxShape(10, 10) });
    const colliderB = new Collider({ shape: new BoxShape(10, 10) });

    world.add(new PhysicsBody({ type: 'static', position: { x: 0, y: 0 }, colliders: [colliderA] }));
    world.add(new PhysicsBody({ type: 'static', position: { x: 5, y: 0 }, colliders: [colliderB] }));

    const backend = new NativePhysicsBackend();

    expect(backend.candidatePairs.length).toBe(0);

    backend.detect([colliderA, colliderB]);

    expect(backend.candidatePairs.length).toBe(1);
    expect(backend.candidatePairs[0]?.a).toBe(colliderA);
    expect(backend.candidatePairs[0]?.b).toBe(colliderB);
  });
});
