import type { Application } from '@codexo/exojs';
import { describe, expect, it } from 'vitest';

import { PhysicsDebugDraw } from '../src/debug/PhysicsDebugDraw';
import { PhysicsWorld } from '../src/index';

const fakeApp = {} as Application;

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
});
