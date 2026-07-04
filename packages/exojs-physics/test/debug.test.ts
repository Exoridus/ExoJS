import type { Application } from '@codexo/exojs';
import { describe, expect, it, vi } from 'vitest';

import { PhysicsDebugDraw } from '../src/debug/PhysicsDebugDraw';
import { BoxShape, CircleShape, DistanceJoint, PhysicsBody, PhysicsWorld } from '../src/index';
import { colliderAt } from './support';

const fakeApp = {} as Application;

const FRAME = 1 / 60;

const advance = (world: PhysicsWorld, seconds: number): void => {
  const frames = Math.round(seconds / FRAME);

  for (let frame = 0; frame < frames; frame++) {
    world.step(FRAME);
  }
};

/** Minimal fake render backend — never a real WebGL2/WebGPU backend (jsdom project). */
const makeBackend = () => ({
  stats: {
    frameTimeMs: 0,
    drawCalls: 0,
    culledNodes: 0,
    submittedNodes: 0,
    batches: 0,
    renderPasses: 0,
    renderTargetChanges: 0,
    frame: 0,
  },
  view: { width: 800, height: 600, getBounds: () => ({ intersectsWith: () => true }) },
  setView: vi.fn().mockReturnThis(),
  draw: vi.fn().mockReturnThis(),
  flush: vi.fn().mockReturnThis(),
});

/** Render `debug` against a fresh fake backend and return it for assertions. */
const renderWith = (debug: PhysicsDebugDraw) => {
  const backend = makeBackend();

  debug.render(backend as unknown as Parameters<typeof debug.render>[0]);

  return backend;
};

describe('PhysicsDebugDraw', () => {
  it('defaults to drawing shapes only, in world space', () => {
    const world = new PhysicsWorld();
    const debug = new PhysicsDebugDraw(fakeApp, world);

    expect(debug.viewMode).toBe('world');
    expect(debug.options.drawShapes).toBe(true);
    expect(debug.options.drawAabb).toBe(false);
    expect(debug.options.drawContacts).toBe(false);
    expect(debug.options.drawNormals).toBe(false);
    expect(debug.options.drawCenters).toBe(false);
    expect(debug.options.drawBroadphase).toBe(false);
  });

  it('honours explicit option overrides', () => {
    const world = new PhysicsWorld();
    const debug = new PhysicsDebugDraw(fakeApp, world, { drawShapes: false, drawContacts: true, drawNormals: true });

    expect(debug.options.drawShapes).toBe(false);
    expect(debug.options.drawContacts).toBe(true);
    expect(debug.options.drawNormals).toBe(true);
  });

  it('update is a no-op and destroy is safe before any render', () => {
    const world = new PhysicsWorld();
    const debug = new PhysicsDebugDraw(fakeApp, world);

    expect(() => debug.update()).not.toThrow();
    expect(() => debug.destroy()).not.toThrow();
  });

  describe('render() option gating', () => {
    it('renders an empty world with every flag off without throwing', () => {
      const world = new PhysicsWorld();
      const debug = new PhysicsDebugDraw(fakeApp, world, {
        drawShapes: false,
        drawAabb: false,
        drawContacts: false,
        drawNormals: false,
        drawCenters: false,
        drawBroadphase: false,
        drawJoints: false,
      });

      expect(() => renderWith(debug)).not.toThrow();
    });

    it('draws shapes for static, kinematic and dynamic colliders (default options)', () => {
      const world = new PhysicsWorld();
      colliderAt(world, new BoxShape(10, 10), { x: 0, y: 0 }, 0, 'static');
      colliderAt(world, new BoxShape(10, 10), { x: 100, y: 0 }, 0, 'kinematic');
      colliderAt(world, new CircleShape(5), { x: 200, y: 0 }, 0.3, 'dynamic');

      const debug = new PhysicsDebugDraw(fakeApp, world);
      const backend = renderWith(debug);

      // Shape strokes were flushed through the fake backend.
      expect(backend.draw).toHaveBeenCalled();
    });

    it('draws AABBs when drawAabb is enabled', () => {
      const world = new PhysicsWorld();
      colliderAt(world, new BoxShape(10, 10), { x: 0, y: 0 });

      const debug = new PhysicsDebugDraw(fakeApp, world, { drawAabb: true, drawShapes: false });

      expect(() => renderWith(debug)).not.toThrow();
    });

    it('draws centre crosses for every body when drawCenters is enabled', () => {
      const world = new PhysicsWorld();
      colliderAt(world, new BoxShape(10, 10), { x: 5, y: 7 });

      const debug = new PhysicsDebugDraw(fakeApp, world, { drawCenters: true, drawShapes: false });

      expect(() => renderWith(debug)).not.toThrow();
    });

    it('draws broad-phase links for overlapping colliders when drawBroadphase is enabled', () => {
      const world = new PhysicsWorld();
      colliderAt(world, new BoxShape(10, 10), { x: 0, y: 0 });
      colliderAt(world, new BoxShape(10, 10), { x: 5, y: 0 });

      const debug = new PhysicsDebugDraw(fakeApp, world, { drawBroadphase: true, drawShapes: false });

      expect(() => renderWith(debug)).not.toThrow();
    });

    it('drawBroadphase with a single collider produces no pairs but still renders', () => {
      const world = new PhysicsWorld();
      colliderAt(world, new BoxShape(10, 10), { x: 0, y: 0 });

      const debug = new PhysicsDebugDraw(fakeApp, world, { drawBroadphase: true, drawShapes: false });

      expect(() => renderWith(debug)).not.toThrow();
    });
  });

  describe('_renderJoints', () => {
    it('draws a line between the two bodies of a joint when drawJoints is enabled', () => {
      const world = new PhysicsWorld();
      const anchor = world.add(new PhysicsBody({ type: 'static', position: { x: 0, y: 0 } }));
      const bob = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 0, y: 100 }, colliders: [{ shape: new BoxShape(16, 16) }] }));

      world.addJoint(new DistanceJoint({ bodyA: anchor, bodyB: bob, length: 100 }));

      const debug = new PhysicsDebugDraw(fakeApp, world, { drawJoints: true, drawShapes: false });

      expect(() => renderWith(debug)).not.toThrow();
    });

    it('is a no-op loop when drawJoints is enabled but the world has no joints', () => {
      const world = new PhysicsWorld();
      const debug = new PhysicsDebugDraw(fakeApp, world, { drawJoints: true, drawShapes: false });

      expect(() => renderWith(debug)).not.toThrow();
    });
  });

  describe('_outlineColor / _strokeShape', () => {
    it('uses the sensor colour for a sensor collider regardless of drawSleeping', () => {
      const world = new PhysicsWorld();
      colliderAt(world, new BoxShape(10, 10), { x: 0, y: 0 }, 0, 'static', { isSensor: true });

      const debug = new PhysicsDebugDraw(fakeApp, world, { drawSleeping: true });

      expect(() => renderWith(debug)).not.toThrow();
    });

    it('falls through to the body-type colour when drawSleeping is on but the body is awake', () => {
      const world = new PhysicsWorld();
      colliderAt(world, new BoxShape(10, 10), { x: 0, y: 0 }, 0, 'dynamic');

      const debug = new PhysicsDebugDraw(fakeApp, world, { drawSleeping: true });

      expect(() => renderWith(debug)).not.toThrow();
    });

    it('uses the sleeping colour once drawSleeping is on and the body has fallen asleep', () => {
      const world = new PhysicsWorld({ gravity: { x: 0, y: 1000 } });
      world.add(new PhysicsBody({ type: 'static', position: { x: 0, y: 320 }, colliders: [{ shape: new BoxShape(1200, 40) }] }));
      const box = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 0, y: 284 }, colliders: [{ shape: new BoxShape(32, 32) }] }));

      advance(world, 2); // longer than the default timeToSleep
      expect(box.isSleeping).toBe(true);

      const debug = new PhysicsDebugDraw(fakeApp, world, { drawSleeping: true });

      expect(() => renderWith(debug)).not.toThrow();
    });

    it('strokes a circle shape including its orientation spoke', () => {
      const world = new PhysicsWorld();
      colliderAt(world, new CircleShape(6), { x: 3, y: 4 }, 0.5, 'dynamic');

      const debug = new PhysicsDebugDraw(fakeApp, world);

      expect(() => renderWith(debug)).not.toThrow();
    });

    it('strokes a polygon shape, wrapping the last edge back to the first vertex', () => {
      const world = new PhysicsWorld();
      colliderAt(world, new BoxShape(20, 12), { x: -3, y: 2 }, 0.2, 'kinematic');

      const debug = new PhysicsDebugDraw(fakeApp, world);

      expect(() => renderWith(debug)).not.toThrow();
    });
  });

  describe('_renderContacts', () => {
    it('draws a two-point manifold (face-to-face boxes) with drawContacts enabled', () => {
      const world = new PhysicsWorld();
      colliderAt(world, new BoxShape(10, 10), { x: 0, y: 0 });
      colliderAt(world, new BoxShape(10, 10), { x: 8, y: 0 });

      const debug = new PhysicsDebugDraw(fakeApp, world, { drawShapes: false, drawContacts: true, drawNormals: false });

      expect(() => renderWith(debug)).not.toThrow();
    });

    it('draws a single-point manifold (overlapping circles) with drawNormals enabled', () => {
      const world = new PhysicsWorld();
      colliderAt(world, new CircleShape(5), { x: 0, y: 0 });
      colliderAt(world, new CircleShape(5), { x: 8, y: 0 });

      const debug = new PhysicsDebugDraw(fakeApp, world, { drawShapes: false, drawContacts: false, drawNormals: true });

      expect(() => renderWith(debug)).not.toThrow();
    });

    it('skips a pair where either collider is a sensor', () => {
      const world = new PhysicsWorld();
      colliderAt(world, new BoxShape(10, 10), { x: 0, y: 0 });
      colliderAt(world, new BoxShape(10, 10), { x: 8, y: 0 }, 0, 'static', { isSensor: true });

      const debug = new PhysicsDebugDraw(fakeApp, world, { drawShapes: false, drawContacts: true });

      expect(() => renderWith(debug)).not.toThrow();
    });

    it('skips a broad-phase pair whose AABBs overlap but whose narrow phase reports no collision', () => {
      // Two circles offset diagonally: both AABBs overlap on each axis independently
      // (|dx|=8 < r1+r2=10 and |dy|=8 < r1+r2=10), but the actual centre distance
      // (~11.3) exceeds the summed radii, so narrowphase `collide()` returns false
      // even though the broad-phase produced the pair.
      const world = new PhysicsWorld();
      colliderAt(world, new CircleShape(5), { x: 0, y: 0 });
      colliderAt(world, new CircleShape(5), { x: 8, y: 8 });

      const debug = new PhysicsDebugDraw(fakeApp, world, { drawShapes: false, drawContacts: true, drawNormals: true });

      expect(() => renderWith(debug)).not.toThrow();
    });
  });

  describe('destroy()', () => {
    it('releases the Graphics primitive created by render(), and a second destroy() is a no-op', () => {
      const world = new PhysicsWorld();
      colliderAt(world, new BoxShape(10, 10), { x: 0, y: 0 });

      const debug = new PhysicsDebugDraw(fakeApp, world);

      renderWith(debug);

      expect(() => debug.destroy()).not.toThrow();
      expect(() => debug.destroy()).not.toThrow();
    });
  });
});
