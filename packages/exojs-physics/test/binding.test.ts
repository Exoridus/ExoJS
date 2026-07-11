import { Container, Drawable, logger, RetainedContainer, type SceneNode } from '@codexo/exojs';
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

describe('SceneNode binding: world-space-rooted guard (F16)', () => {
  const makeBody = (): PhysicsBody => new PhysicsBody({ type: 'kinematic', position: { x: 0, y: 0 }, colliders: [{ shape: new BoxShape(10, 10) }] });

  it('warns in dev when an ancestor carries a non-identity transform', () => {
    const registry = new BindingRegistry();
    const parent = new Container();
    const node = new Drawable();

    parent.setPosition(100, 50);
    parent.addChild(node);

    const warnSpy = vi.spyOn(logger, 'warn');

    registry.bind(makeBody(), node);

    const guardWarnings = warnSpy.mock.calls.filter(call => String(call[0]).includes('world-space-rooted'));

    expect(guardWarnings).toHaveLength(1);
    expect(String(guardWarnings[0]?.[0])).toContain('double-transform');

    warnSpy.mockRestore();
    parent.destroy();
  });

  it('warns in dev when an ancestor is an engaged transform-group boundary, even at identity', () => {
    const registry = new BindingRegistry();
    const group = new RetainedContainer();
    const node = new Drawable();

    group.addChild(node);

    const warnSpy = vi.spyOn(logger, 'warn');

    registry.bind(makeBody(), node);

    expect(warnSpy.mock.calls.filter(call => String(call[0]).includes('world-space-rooted'))).toHaveLength(1);

    warnSpy.mockRestore();
    group.destroy();
  });

  it('does not warn for a node whose ancestor chain is identity-transformed', () => {
    const registry = new BindingRegistry();
    const root = new Container();
    const mid = new Container();
    const node = new Drawable();

    root.addChild(mid);
    mid.addChild(node);

    const warnSpy = vi.spyOn(logger, 'warn');

    registry.bind(makeBody(), node);

    expect(warnSpy.mock.calls.filter(call => String(call[0]).includes('world-space-rooted'))).toHaveLength(0);

    warnSpy.mockRestore();
    root.destroy();
  });

  it('the guard does not change sync() semantics: local position is still written verbatim', () => {
    const registry = new BindingRegistry();
    const parent = new Container();
    const node = new Drawable();

    parent.setPosition(100, 50);
    parent.addChild(node);

    const warnSpy = vi.spyOn(logger, 'warn');
    const body = new PhysicsBody({ type: 'kinematic', position: { x: 7, y: 9 }, colliders: [{ shape: new BoxShape(10, 10) }] });

    registry.bind(body, node);

    expect(node.x).toBe(7);
    expect(node.y).toBe(9);

    warnSpy.mockRestore();
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
});

describe('NativePhysicsBackend', () => {
  it('exposes the latest broad-phase candidate pairs', () => {
    // A real PhysicsWorld is used only to attach + synchronize the colliders (assign
    // ids, compute their AABBs) — the backend under test is a fresh, standalone instance,
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
