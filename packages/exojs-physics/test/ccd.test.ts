import { describe, expect, it } from 'vitest';

import { BoxShape, CircleShape, PhysicsBody, PhysicsWorld } from '../src/index';

/**
 * Continuous collision detection / bullet-mode (spec `03-ccd.md`, gate C-1).
 * A body flagged `isBullet` is swept against static geometry each step so it
 * cannot tunnel through thin walls. SG-C prefix, +Y down.
 */

const FRAME = 1 / 60;

/** A world with a thin static wall at `x = 200` and a small ball fired at it from the left. */
const fireAtWall = (bullet: boolean): { world: PhysicsWorld; ball: PhysicsBody } => {
  const world = new PhysicsWorld({ gravity: { x: 0, y: 0 } });

  world.add(new PhysicsBody({ type: 'static', position: { x: 200, y: 0 }, colliders: [{ shape: new BoxShape(4, 400) }] }));

  const ball = new PhysicsBody({ type: 'dynamic', position: { x: 0, y: 0 }, colliders: [{ shape: new CircleShape(6) }] });
  ball.isBullet = bullet;
  world.add(ball);
  ball.linearVelocityX = 6000; // ~100 px per fixed step — far more than the 4px wall thickness

  return { world, ball };
};

describe('SG-C — continuous collision (bullet mode)', () => {
  it('SG-C1: a fast bullet does not tunnel through a thin static wall', () => {
    // Without CCD the body tunnels straight through (the documented limit).
    const plain = fireAtWall(false);
    for (let frame = 0; frame < 30; frame++) {
      plain.world.step(FRAME);
    }
    expect(plain.ball.x).toBeGreaterThan(220); // passed clean through the wall

    // With isBullet the swept test stops it at the wall.
    const ccd = fireAtWall(true);
    for (let frame = 0; frame < 30; frame++) {
      ccd.world.step(FRAME);
    }
    expect(ccd.ball.x).toBeLessThan(200); // never crossed the wall plane at x = 200
    expect(Number.isFinite(ccd.ball.x)).toBe(true);
  });

  it('SG-C2: a bullet that does not cross a wall is not falsely stopped', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: 0 } });
    // The wall spans y ∈ [−200, 200]; the bullet flies past well above it.
    world.add(new PhysicsBody({ type: 'static', position: { x: 200, y: 0 }, colliders: [{ shape: new BoxShape(4, 400) }] }));

    const ball = new PhysicsBody({ type: 'dynamic', position: { x: 0, y: 300 }, colliders: [{ shape: new CircleShape(6) }] });
    ball.isBullet = true;
    world.add(ball);
    ball.linearVelocityX = 6000;

    for (let frame = 0; frame < 10; frame++) {
      world.step(FRAME);
    }

    expect(ball.x).toBeGreaterThan(400); // flew freely past the wall's x without being clamped
  });

  it('SG-C3: a fast bullet stays finite and contained in a closed static box', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: 0 } });
    const wall = (x: number, y: number, w: number, h: number): void => {
      world.add(new PhysicsBody({ type: 'static', position: { x, y }, colliders: [{ shape: new BoxShape(w, h) }] }));
    };
    wall(0, -110, 240, 20);
    wall(0, 110, 240, 20);
    wall(-110, 0, 20, 240);
    wall(110, 0, 20, 240);

    const ball = new PhysicsBody({ type: 'dynamic', position: { x: 0, y: 0 }, colliders: [{ shape: new CircleShape(6), restitution: 0.5 }] });
    ball.isBullet = true;
    world.add(ball);
    ball.linearVelocityX = 5000;
    ball.linearVelocityY = 3000;

    for (let frame = 0; frame < 120; frame++) {
      world.step(FRAME);
    }

    // CCD keeps it inside the thin-walled box — never escaping, never NaN.
    expect(Number.isFinite(ball.x)).toBe(true);
    expect(Number.isFinite(ball.y)).toBe(true);
    expect(Math.abs(ball.x)).toBeLessThan(105);
    expect(Math.abs(ball.y)).toBeLessThan(105);
  });
});
