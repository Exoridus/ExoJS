import { describe, expect, it } from 'vitest';

import { BoxShape, PhysicsBody, PhysicsWorld } from '../src/index';

describe('applyImpulse', () => {
  it('rejects a lone X coordinate instead of silently applying a central impulse', () => {
    const world = new PhysicsWorld();
    const body = world.add(new PhysicsBody({ colliders: [{ shape: new BoxShape(2, 4) }] }));

    expect(() => body.applyImpulse(8, 16, 0)).toThrow(TypeError);
    expect(body.linearVelocityX).toBe(0);
    expect(body.linearVelocityY).toBe(0);
    expect(body.angularVelocity).toBe(0);
  });

  it.each([false, true])('applies a central impulse with explicitly undefined coordinates: %s', explicit => {
    const world = new PhysicsWorld();
    const body = world.add(
      new PhysicsBody({ position: { x: 10, y: 20 }, colliders: [{ shape: new BoxShape(2, 4), offset: { x: 2, y: 0 } }] }),
    );
    body.angularVelocity = 3;

    const result = explicit ? body.applyImpulse(8, 16, undefined, undefined) : body.applyImpulse(8, 16);

    expect(result).toBe(body);
    expect(body.linearVelocityX).toBeCloseTo(1);
    expect(body.linearVelocityY).toBeCloseTo(2);
    expect(body.angularVelocity).toBe(3);
  });

  it.each([
    { pointX: 25, pointY: 40, angularVelocity: 7.2 },
    { pointX: 0, pointY: 0, angularVelocity: 1.2 },
    { pointX: 0, pointY: 40, angularVelocity: -22.8 },
    { pointX: 25, pointY: 0, angularVelocity: 31.2 },
  ])('applies torque at world point ($pointX, $pointY)', ({ pointX, pointY, angularVelocity }) => {
    const world = new PhysicsWorld();
    const body = world.add(
      new PhysicsBody({
        position: { x: 10, y: 20 },
        angle: Math.PI / 2,
        colliders: [{ shape: new BoxShape(2, 4), offset: { x: 2, y: 0 } }],
      }),
    );

    expect(body.applyImpulse(8, 16, pointX, pointY)).toBe(body);
    expect(body.linearVelocityX).toBeCloseTo(1);
    expect(body.linearVelocityY).toBeCloseTo(2);
    expect(body.angularVelocity).toBeCloseTo(angularVelocity);
  });

  describe.each(['dynamic', 'static', 'kinematic'] as const)('%s body', type => {
    it.each([
      { pointX: 0, pointY: undefined },
      { pointX: undefined, pointY: 0 },
      { pointX: 5, pointY: undefined },
      { pointX: undefined, pointY: 5 },
    ])('rejects partial point ($pointX, $pointY) before mutation or wake', ({ pointX, pointY }) => {
      const world = new PhysicsWorld();
      const body = world.add(new PhysicsBody({ type, colliders: [{ shape: new BoxShape(2, 4) }] }));
      body._setSleeping(true);
      body._sleepTime = 0.25;
      body.linearVelocityX = 3;
      body.linearVelocityY = -4;
      body.angularVelocity = 5;

      expect(() => body.applyImpulse(8, 16, pointX, pointY)).toThrow(TypeError);
      expect(body.linearVelocityX).toBe(3);
      expect(body.linearVelocityY).toBe(-4);
      expect(body.angularVelocity).toBe(5);
      expect(body.isSleeping).toBe(true);
      expect(body._sleepTime).toBe(0.25);
    });
  });
});
